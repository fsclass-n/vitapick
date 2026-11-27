import hashlib
import logging
import os
import re
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .db import Base, SessionLocal, engine, get_db
from .meal_parser import parse_meal_text
from .models import Food, Meal, OAuthTicket, User, utc_now

env = os.getenv("APP_ENV", "development")
demo_enabled = os.getenv("DEMO_ACCOUNTS_ENABLED", "false").lower() == "true"
# Shared one-click accounts; ".local" is rejected by sign-up validation, so these cannot be claimed.
demo_emails = {"user": "demo-user@healthpick.local", "admin": "demo-admin@healthpick.local"}
secret_key = os.getenv("JWT_SECRET") or secrets.token_urlsafe(48)
if env == "production" and not os.getenv("JWT_SECRET"):
    raise RuntimeError("JWT_SECRET is required in production")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
backend_url = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
password_hasher = PasswordHasher()
bearer = HTTPBearer(auto_error=False)
logger = logging.getLogger("healthpick")
ROLES = ("user", "admin", "viewer")  # viewer = 테스트 관리자: read-only admin console
PARSE_LIMIT, PARSE_WINDOW = 20, 600
parse_history: dict[int, deque] = defaultdict(deque)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    admin_email = os.getenv("ADMIN_EMAIL")
    admin_password = os.getenv("ADMIN_PASSWORD")
    if admin_email and admin_password and not valid_password(admin_password):
        # Optional bootstrap: a bad value must not take the whole API down.
        logger.warning("ADMIN_PASSWORD does not meet the password policy; skipping initial admin creation")
    elif admin_email and admin_password:
        with SessionLocal() as db:
            email = admin_email.strip().lower()
            if not db.scalar(select(User).where(User.email == email)):
                db.add(User(email=email, name="관리자", password_hash=password_hasher.hash(admin_password), role="admin"))
                db.commit()
    yield


app = FastAPI(title="healthpick API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list({frontend_url, "https://healthpick.netlify.app", "http://localhost:5173", "http://127.0.0.1:5173"}),
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


class Register(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=80)
    password: str


class Login(BaseModel):
    email: EmailStr
    password: str


class DemoLogin(BaseModel):
    role: str


class RoleChange(BaseModel):
    role: str


class MealText(BaseModel):
    text: str = Field(min_length=2, max_length=300)
    today: date | None = None
    hour: int | None = Field(default=None, ge=0, le=23)


class Exchange(BaseModel):
    code: str


class NutritionProfile(BaseModel):
    age: int = Field(ge=18, le=100)
    biological_sex: str
    height_cm: float = Field(ge=100, le=230, allow_inf_nan=False)
    weight_kg: float = Field(ge=30, le=300, allow_inf_nan=False)
    activity_level: str


class MealInput(BaseModel):
    food_name: str = Field(min_length=1, max_length=120)
    meal_type: str
    eaten_at: date
    serving_g: float = Field(gt=0, le=10000, allow_inf_nan=False)
    calories: float = Field(ge=0, le=20000, allow_inf_nan=False)
    protein: float = Field(ge=0, le=10000, allow_inf_nan=False)
    carbs: float = Field(ge=0, le=10000, allow_inf_nan=False)
    fat: float = Field(ge=0, le=10000, allow_inf_nan=False)


class Withdrawal(BaseModel):
    password: str | None = Field(default=None, max_length=128)


def valid_password(value: str) -> bool:
    return (
        8 <= len(value) <= 128
        and bool(re.search(r"[a-z]", value))
        and bool(re.search(r"[A-Z]", value))
        and bool(re.search(r"\d", value))
        and bool(re.search(r"[^A-Za-z0-9]", value))
    )


def is_demo(user: User) -> bool:
    return user.email in demo_emails.values() and user.password_hash is None and user.provider is None


def public_user(user: User):
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role, "provider": user.provider,
            "is_demo": is_demo(user)}


def mask(text: str, keep: int) -> str:
    return text[:keep] + "*" * max(len(text) - keep, 1)


def masked_user(user: User):
    # Shared demo admins may see the console layout but not real members' personal data.
    local, _, domain = user.email.partition("@")
    return {**public_user(user), "email": f"{mask(local, 2)}@{domain}", "name": mask(user.name, 1)}


def delete_account(db: Session, user: User):
    db.execute(delete(OAuthTicket).where(OAuthTicket.user_id == user.id))
    db.execute(delete(Meal).where(Meal.user_id == user.id))
    db.delete(user)
    db.commit()


def issue_token(user: User):
    now = datetime.now(timezone.utc)
    token = jwt.encode({"sub": str(user.id), "iat": now, "exp": now + timedelta(hours=12)}, secret_key, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer", "user": public_user(user)}


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
):
    if credentials is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    try:
        payload = jwt.decode(credentials.credentials, secret_key, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        user = None
    if user is None:
        raise HTTPException(status_code=401, detail="로그인 정보가 유효하지 않습니다.")
    return user


def staff_user(user: User = Depends(current_user)):
    if user.role not in ("admin", "viewer"):
        raise HTTPException(status_code=403, detail="관리자 권한이 필요합니다.")
    return user


def admin_user(user: User = Depends(staff_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="테스트 관리자는 읽기 전용입니다.")
    return user


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=201)
def register(payload: Register, db: Session = Depends(get_db)):
    if not valid_password(payload.password):
        raise HTTPException(status_code=422, detail="비밀번호는 영문 대·소문자, 숫자, 특수문자를 포함한 8~128자여야 합니다.")
    email = str(payload.email).lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")
    user = User(email=email, name=payload.name.strip(), password_hash=password_hasher.hash(payload.password))
    if not user.name:
        raise HTTPException(status_code=422, detail="이름을 입력해 주세요.")
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다.")
    db.refresh(user)
    return issue_token(user)


@app.post("/api/auth/login")
def login(payload: Login, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    try:
        if user is None or not user.password_hash:
            raise VerificationError("Invalid credentials")
        password_hasher.verify(user.password_hash, payload.password)
    except VerificationError:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    return issue_token(user)


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return public_user(user)


@app.delete("/api/auth/me", status_code=204)
def withdraw(payload: Withdrawal, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if is_demo(user):
        raise HTTPException(status_code=400, detail="테스트 계정은 탈퇴할 수 없습니다.")
    real_admins = select(func.count()).select_from(User).where(User.role == "admin", User.email.not_in(demo_emails.values()))
    if user.role == "admin" and db.scalar(real_admins) <= 1:
        raise HTTPException(status_code=400, detail="마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 먼저 지정해 주세요.")
    if user.password_hash:
        if not payload.password:
            raise HTTPException(status_code=422, detail="비밀번호를 입력해 주세요.")
        try:
            password_hasher.verify(user.password_hash, payload.password)
        except VerificationError:
            raise HTTPException(status_code=401, detail="비밀번호가 올바르지 않습니다.")
    delete_account(db, user)


@app.get("/api/auth/demo-status")
def demo_status():
    return {"enabled": demo_enabled}


@app.get("/api/meals/parse/status")
def parse_status():
    return {"ai": bool(os.getenv("GEMINI_API_KEY")), "engine": "gemini" if os.getenv("GEMINI_API_KEY") else "rules"}


@app.post("/api/auth/demo-login")
def demo_login(payload: DemoLogin, db: Session = Depends(get_db)):
    if not demo_enabled:
        raise HTTPException(status_code=404, detail="테스트 계정은 이 환경에서 사용할 수 없습니다.")
    if payload.role not in ("user", "admin"):
        raise HTTPException(status_code=422, detail="유효하지 않은 계정 유형입니다.")
    email = demo_emails[payload.role]
    user = db.scalar(select(User).where(User.email == email))
    if user is not None and not is_demo(user):
        raise HTTPException(status_code=409, detail="테스트 계정을 사용할 수 없습니다.")
    if user is None:
        user = User(email=email, name="테스트 관리자" if payload.role == "admin" else "테스트 사용자",
                    role="viewer" if payload.role == "admin" else "user")
        db.add(user)
    elif payload.role == "admin":
        user.role = "viewer"  # The public demo admin is always the read-only 테스트 관리자.
    db.commit()
    db.refresh(user)
    return issue_token(user)


def public_meal(meal: Meal):
    return {field: getattr(meal, field) for field in ("id", "food_name", "meal_type", "eaten_at", "serving_g", "calories", "protein", "carbs", "fat")}


activity_factors = {"sedentary": 1.2, "light": 1.375, "moderate": 1.55, "active": 1.725}


def nutrition_targets(user: User):
    profile = {key: getattr(user, key) for key in ("age", "biological_sex", "height_cm", "weight_kg", "activity_level")}
    if not all(value is not None for value in profile.values()):
        return {"personalized": False, "profile": profile, "targets": {"calories": 2000, "protein": 55, "carbs": 275, "fat": 70}}
    bmr = 10 * user.weight_kg + 6.25 * user.height_cm - 5 * user.age + (5 if user.biological_sex == "male" else -161)
    calories = round(bmr * activity_factors[user.activity_level] / 10) * 10
    return {
        "personalized": True,
        "profile": profile,
        "targets": {
            "calories": calories,
            "protein": round(calories * 0.20 / 4),
            "carbs": round(calories * 0.50 / 4),
            "fat": round(calories * 0.30 / 9),
        },
    }


@app.get("/api/nutrition/targets")
def get_targets(user: User = Depends(current_user)):
    return nutrition_targets(user)


@app.patch("/api/nutrition/profile")
def update_profile(payload: NutritionProfile, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if payload.biological_sex not in ("male", "female") or payload.activity_level not in activity_factors:
        raise HTTPException(status_code=422, detail="성별 또는 활동량을 확인해 주세요.")
    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    db.commit()
    return nutrition_targets(user)


@app.get("/api/meals")
def list_meals(user: User = Depends(current_user), db: Session = Depends(get_db)):
    items = db.scalars(select(Meal).where(Meal.user_id == user.id).order_by(Meal.eaten_at.desc(), Meal.id.desc()).limit(500)).all()
    return [public_meal(item) for item in items]


@app.post("/api/meals", status_code=201)
def add_meal(payload: MealInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if payload.meal_type not in ("아침", "점심", "저녁", "간식") or not payload.food_name.strip():
        raise HTTPException(status_code=422, detail="음식 이름 또는 식사 구분을 확인해 주세요.")
    meal = Meal(user_id=user.id, **{**payload.model_dump(), "food_name": payload.food_name.strip()})
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return public_meal(meal)


@app.post("/api/meals/parse")
def parse_meal(payload: MealText, user: User = Depends(current_user), db: Session = Depends(get_db)):
    history, now = parse_history[user.id], time.monotonic()
    while history and now - history[0] > PARSE_WINDOW:
        history.popleft()
    if len(history) >= PARSE_LIMIT:
        raise HTTPException(status_code=429, detail="문장 분석 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.")
    history.append(now)
    result = parse_meal_text(db, payload.text.strip(), payload.today or date.today(), payload.hour if payload.hour is not None else datetime.now().hour)
    if not result["items"]:
        raise HTTPException(status_code=422, detail="문장에서 음식을 찾지 못했습니다. 예: 어제 점심에 비빔밥 한 그릇 먹었어")
    return result


@app.delete("/api/meals/{meal_id}", status_code=204)
def delete_meal(meal_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    meal = db.get(Meal, meal_id)
    if meal is None or meal.user_id != user.id:
        raise HTTPException(status_code=404, detail="식사 기록을 찾을 수 없습니다.")
    db.delete(meal)
    db.commit()


@app.get("/api/foods")
def search_foods(q: str = Query(min_length=2, max_length=80), db: Session = Depends(get_db)):
    # Escape SQL wildcards so the query stays a literal substring search.
    term = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    rows = db.scalars(select(Food).where(Food.name.like(f"%{term}%", escape="\\")).limit(12)).all()
    return [{"id": f.id, "name": f.name, "calories": f.calories, "protein": f.protein, "carbs": f.carbs, "fat": f.fat} for f in rows]


@app.get("/api/admin/users")
def list_users(admin: User = Depends(staff_user), db: Session = Depends(get_db)):
    users = db.scalars(select(User).order_by(User.id.desc()).limit(500)).all()
    if admin.role == "viewer":
        return [public_user(u) if is_demo(u) else masked_user(u) for u in users]
    return [public_user(u) for u in users]


@app.patch("/api/admin/users/{user_id}/role")
def set_role(user_id: int, payload: RoleChange, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    if payload.role not in ROLES:
        raise HTTPException(status_code=422, detail="유효하지 않은 권한입니다.")
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다.")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="본인의 권한은 변경할 수 없습니다.")
    real_admins = select(func.count()).select_from(User).where(User.role == "admin", User.email.not_in(demo_emails.values()))
    if target.role == "admin" and payload.role != "admin" and not is_demo(target) and db.scalar(real_admins) <= 1:
        raise HTTPException(status_code=400, detail="마지막 관리자의 권한은 변경할 수 없습니다.")
    target.role = payload.role
    db.commit()
    return public_user(target)


@app.delete("/api/admin/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="회원을 찾을 수 없습니다.")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="본인 계정은 회원 관리에서 삭제할 수 없습니다.")
    if is_demo(target):
        raise HTTPException(status_code=400, detail="테스트 계정은 삭제할 수 없습니다.")
    delete_account(db, target)


providers = {
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "profile": "https://openidconnect.googleapis.com/v1/userinfo",
        "scope": "openid email profile",
    },
    "naver": {
        "authorize": "https://nid.naver.com/oauth2.0/authorize",
        "token": "https://nid.naver.com/oauth2.0/token",
        "profile": "https://openapi.naver.com/v1/nid/me",
        "scope": "",
    },
    "kakao": {
        "authorize": "https://kauth.kakao.com/oauth/authorize",
        "token": "https://kauth.kakao.com/oauth/token",
        "profile": "https://kapi.kakao.com/v2/user/me",
        "scope": "account_email profile_nickname",
    },
}


@app.get("/api/auth/oauth/providers")
def available_providers():
    return {provider: bool(os.getenv(f"{provider.upper()}_CLIENT_ID") and os.getenv(f"{provider.upper()}_CLIENT_SECRET"))
            for provider in providers}


def oauth_settings(provider: str):
    if provider not in providers:
        raise HTTPException(status_code=404)
    prefix = provider.upper()
    client_id = os.getenv(f"{prefix}_CLIENT_ID")
    client_secret = os.getenv(f"{prefix}_CLIENT_SECRET")
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail=f"{provider} 로그인이 아직 설정되지 않았습니다.")
    return client_id, client_secret, f"{backend_url}/api/auth/oauth/{provider}/callback"


@app.get("/api/auth/oauth/{provider}/start")
def oauth_start(provider: str):
    client_id, _, redirect_uri = oauth_settings(provider)
    state = secrets.token_urlsafe(32)
    params = {"client_id": client_id, "redirect_uri": redirect_uri, "response_type": "code", "state": state}
    if providers[provider]["scope"]:
        params["scope"] = providers[provider]["scope"]
    response = RedirectResponse(f'{providers[provider]["authorize"]}?{urlencode(params)}')
    response.set_cookie("oauth_state", f"{provider}:{state}", max_age=600, httponly=True, secure=backend_url.startswith("https://"), samesite="lax")
    return response


@app.get("/api/auth/oauth/{provider}/callback")
async def oauth_callback(provider: str, request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)):
    client_id, client_secret, redirect_uri = oauth_settings(provider)
    failure = RedirectResponse(f"{frontend_url}/login?error=oauth", status_code=302)
    failure.delete_cookie("oauth_state")
    if not code or not state or not secrets.compare_digest(request.cookies.get("oauth_state", ""), f"{provider}:{state}"):
        return failure
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            token_response = await client.post(providers[provider]["token"], data={
                "grant_type": "authorization_code", "client_id": client_id, "client_secret": client_secret, "code": code, "redirect_uri": redirect_uri,
            })
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            profile_response = await client.get(providers[provider]["profile"], headers={"Authorization": f"Bearer {access_token}"})
            profile_response.raise_for_status()
            profile = profile_response.json()
        if provider == "google":
            provider_id, email, name = profile["sub"], profile.get("email"), profile.get("name")
            if not profile.get("email_verified"):
                return failure
        elif provider == "naver":
            person = profile["response"]
            provider_id, email, name = person["id"], person.get("email"), person.get("name") or person.get("nickname")
        else:
            person = profile.get("kakao_account", {})
            provider_id, email, name = str(profile["id"]), person.get("email"), person.get("profile", {}).get("nickname")
            if not person.get("is_email_verified"):
                return failure
        if not email:
            return failure
        email = str(email).lower()
        user = db.scalar(select(User).where(User.provider == provider, User.provider_id == str(provider_id)))
        if not user:
            if db.scalar(select(User).where(User.email == email)):
                return failure  # Never silently link accounts by email.
            user = User(email=email, name=(name or "헬스픽 사용자")[:80], provider=provider, provider_id=str(provider_id))
            db.add(user)
            db.commit()
            db.refresh(user)
        ticket = secrets.token_urlsafe(32)
        db.add(OAuthTicket(code_hash=hashlib.sha256(ticket.encode()).hexdigest(), user_id=user.id, expires_at=utc_now() + timedelta(minutes=2)))
        db.commit()
        success = RedirectResponse(f"{frontend_url}/login?{urlencode({'code': ticket})}", status_code=302)
        success.delete_cookie("oauth_state")
        return success
    except (httpx.HTTPError, KeyError, ValueError, IntegrityError):
        db.rollback()
        return failure


@app.post("/api/auth/oauth/exchange")
def oauth_exchange(payload: Exchange, db: Session = Depends(get_db)):
    record = db.get(OAuthTicket, hashlib.sha256(payload.code.encode()).hexdigest())
    if record is None or record.expires_at < utc_now():
        raise HTTPException(status_code=401, detail="로그인 인증이 만료되었습니다. 다시 시도해 주세요.")
    user = db.get(User, record.user_id)
    db.delete(record)
    db.commit()
    return issue_token(user)
