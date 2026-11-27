import hashlib
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.db import Base, get_db
import json

from backend import main, meal_parser
from backend.main import app
from backend.models import Food, Meal, OAuthTicket, User, utc_now


@pytest.fixture
def client(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)

    def test_db():
        with session() as db:
            yield db

    app.dependency_overrides[get_db] = test_db
    with TestClient(app) as test_client:
        yield test_client, session
    app.dependency_overrides.clear()
    engine.dispose()


def register(client, email):
    response = client.post("/api/auth/register", json={"email": email, "name": "테스터", "password": "ValidPass1!"})
    assert response.status_code == 201
    return {"Authorization": f'Bearer {response.json()["access_token"]}'}


def test_auth_policy_and_private_meals(client):
    web, _ = client
    weak = web.post("/api/auth/register", json={"email": "weak@example.com", "name": "테스터", "password": "weakpass"})
    assert weak.status_code == 422
    first = register(web, "one@example.com")
    second = register(web, "two@example.com")
    assert web.post("/api/auth/login", json={"email": "one@example.com", "password": "wrong"}).status_code == 401
    assert web.get("/api/meals").status_code == 401
    meal = web.post("/api/meals", headers=first, json={
        "food_name": "현미밥", "meal_type": "점심", "eaten_at": "2026-11-16",
        "serving_g": 150, "calories": 220, "protein": 4, "carbs": 45, "fat": 1,
    })
    assert meal.status_code == 201
    assert len(web.get("/api/meals", headers=first).json()) == 1
    assert web.get("/api/meals", headers=second).json() == []
    assert web.delete(f'/api/meals/{meal.json()["id"]}', headers=second).status_code == 404
    assert web.delete(f'/api/meals/{meal.json()["id"]}', headers=first).status_code == 204
    assert web.get("/api/meals", headers=first).json() == []


def test_netlify_origin_can_call_api(client):
    web, _ = client
    response = web.options("/api/meals", headers={
        "Origin": "https://healthpick.netlify.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://healthpick.netlify.app"


def test_admin_role_change_is_enforced_server_side(client):
    web, session = client
    first = register(web, "admin@example.com")
    second = register(web, "member@example.com")
    with session() as db:
        admin = db.query(User).filter_by(email="admin@example.com").one()
        admin.role = "admin"
        admin_id = admin.id
        member_id = db.query(User).filter_by(email="member@example.com").one().id
        db.commit()
    assert web.get("/api/admin/users", headers=second).status_code == 403
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=second, json={"role": "admin"}).status_code == 403
    assert web.patch(f"/api/admin/users/{admin_id}/role", headers=first, json={"role": "user"}).status_code == 400
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=first, json={"role": "admin"}).json()["role"] == "admin"
    assert web.get("/api/admin/users", headers=second).status_code == 200
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=first, json={"role": "user"}).json()["role"] == "user"
    assert web.get("/api/admin/users", headers=second).status_code == 403


def test_oauth_ticket_is_one_time_and_expires(client):
    web, session = client
    register(web, "member@example.com")
    with session() as db:
        user = db.query(User).filter_by(email="member@example.com").one()
        db.add(OAuthTicket(code_hash=hashlib.sha256(b"fresh").hexdigest(), user_id=user.id, expires_at=utc_now() + timedelta(minutes=1)))
        db.add(OAuthTicket(code_hash=hashlib.sha256(b"stale").hexdigest(), user_id=user.id, expires_at=utc_now() - timedelta(minutes=1)))
        db.commit()
    assert web.post("/api/auth/oauth/exchange", json={"code": "stale"}).status_code == 401
    assert web.post("/api/auth/oauth/exchange", json={"code": "fresh"}).status_code == 200
    assert web.post("/api/auth/oauth/exchange", json={"code": "fresh"}).status_code == 401


def test_personalized_targets_are_private_and_estimated(client):
    web, _ = client
    first = register(web, "one@example.com")
    second = register(web, "two@example.com")
    assert web.get("/api/nutrition/targets", headers=first).json()["personalized"] is False
    profile = {"age": 30, "biological_sex": "female", "height_cm": 165, "weight_kg": 60, "activity_level": "light"}
    response = web.patch("/api/nutrition/profile", headers=first, json=profile)
    assert response.status_code == 200
    # Mifflin-St Jeor: 600 + 1031.25 - 150 - 161 = 1320.25; light activity x 1.375.
    assert response.json()["targets"]["calories"] == 1820
    assert web.get("/api/nutrition/targets", headers=first).json()["personalized"] is True
    assert web.get("/api/nutrition/targets", headers=second).json()["personalized"] is False
    assert web.patch("/api/nutrition/profile", headers=first, json={**profile, "age": 12}).status_code == 422


def test_food_sync_normalizes_only_valid_gram_servings():
    from rpa.sync_foods import normalize

    row = {"FOOD_CD": "A1", "DESC_KOR": "현미밥", "SERVING_SIZE": "200g",
           "NUTR_CONT1": "300", "NUTR_CONT2": "60", "NUTR_CONT3": "8", "NUTR_CONT4": "2"}
    assert normalize(row) == {"source_id": "A1", "name": "현미밥", "calories": 150, "protein": 4, "carbs": 30, "fat": 1}
    assert normalize({**row, "SERVING_SIZE": "200ml"}) is None
    modern = {"FOOD_CD": "B1", "FOOD_NM_KR": "기장밥", "SERVING_SIZE": "100g",
              "AMT_NUM1": "120", "AMT_NUM3": "2", "AMT_NUM6": "26", "AMT_NUM4": "0.5"}
    assert normalize(modern) == {"source_id": "B1", "name": "기장밥", "calories": 120, "protein": 2, "carbs": 26, "fat": 0.5}
    assert normalize({**modern, "AMT_NUM1": "nan"}) is None


def test_portal_api_page_uses_issued_key_and_checks_response(monkeypatch):
    from rpa import sync_foods

    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"header": {"resultCode": "00", "resultMsg": "NORMAL SERVICE."},
                    "body": {"totalCount": 2, "items": [{"FOOD_CD": "A1"}]}}

    def fake_get(url, params, timeout):
        assert url == sync_foods.API_URL
        assert params == {"serviceKey": "a+b/=", "pageNo": 1, "numOfRows": 500, "type": "json"}
        assert timeout == 30
        return Response()

    monkeypatch.setattr(sync_foods.requests, "get", fake_get)
    assert sync_foods.fetch_page("a%2Bb%2F%3D", 1) == ([{"FOOD_CD": "A1"}], 2)

    class ErrorResponse(Response):
        def json(self):
            return {"header": {"resultCode": "20", "resultMsg": "SERVICE_KEY_IS_NULL"}}

    monkeypatch.setattr(sync_foods.requests, "get", lambda *args, **kwargs: ErrorResponse())
    with pytest.raises(RuntimeError, match="error code: 20"):
        sync_foods.fetch_page("key", 1)


def test_portal_sync_upserts_across_pages_without_duplicates(monkeypatch):
    from rpa import sync_foods

    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)
    monkeypatch.setattr(sync_foods, "engine", engine)
    monkeypatch.setattr(sync_foods, "SessionLocal", session)
    monkeypatch.setattr(sync_foods, "PAGE_SIZE", 2)
    monkeypatch.setenv("MFDS_API_KEY", "test-key")
    monkeypatch.setenv("SYNC_MAX_PAGES", "2")

    def row(code, energy):
        return {"FOOD_CD": code, "FOOD_NM_KR": "현미밥", "SERVING_SIZE": "100g",
                "AMT_NUM1": energy, "AMT_NUM3": "4", "AMT_NUM6": "25", "AMT_NUM4": "1"}

    pages = {1: ([row("A1", "100"), row("B1", "200")], 3), 2: ([row("A1", "120")], 3)}
    monkeypatch.setattr(sync_foods, "fetch_page", lambda key, page: pages[page])
    assert sync_foods.sync() == 3
    with session() as db:
        assert db.query(Food).count() == 2
        assert db.query(Food).filter_by(source_id="A1").one().calories == 120
    engine.dispose()


def test_invalid_admin_password_skips_bootstrap_without_crashing(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    session = sessionmaker(bind=engine, expire_on_commit=False)
    monkeypatch.setattr(main, "engine", engine)
    monkeypatch.setattr(main, "SessionLocal", session)
    monkeypatch.setenv("ADMIN_EMAIL", "Admin@Example.com")
    for password, admins in (("weakpass", 0), ("ValidPass1!", 1)):
        monkeypatch.setenv("ADMIN_PASSWORD", password)
        with TestClient(app) as web:
            assert web.get("/api/health").status_code == 200
        with session() as db:
            assert db.query(User).filter_by(email="admin@example.com", role="admin").count() == admins
    engine.dispose()


def test_demo_accounts_work_in_production_and_demo_admin_is_read_only(client, monkeypatch):
    web, session = client
    monkeypatch.setattr(main, "env", "production")
    monkeypatch.setattr(main, "demo_enabled", False)
    assert web.get("/api/auth/demo-status").json() == {"enabled": False}
    assert web.post("/api/auth/demo-login", json={"role": "admin"}).status_code == 404

    monkeypatch.setattr(main, "demo_enabled", True)
    assert web.get("/api/auth/demo-status").json() == {"enabled": True}
    real = register(web, "realperson@example.com")
    with session() as db:
        db.query(User).filter_by(email="realperson@example.com").one().role = "admin"
        db.commit()
    demo_user = web.post("/api/auth/demo-login", json={"role": "user"}).json()
    demo_admin_login = web.post("/api/auth/demo-login", json={"role": "admin"}).json()
    assert demo_user["user"]["role"] == "user" and demo_user["user"]["is_demo"] is True
    assert demo_admin_login["user"]["role"] == "viewer"
    demo_admin = {"Authorization": f'Bearer {demo_admin_login["access_token"]}'}

    # 테스트 관리자 can read the console with real members masked, but cannot change any role.
    listed = {u["id"]: u for u in web.get("/api/admin/users", headers=demo_admin).json()}
    person = next(u for u in listed.values() if not u["is_demo"])
    assert person["email"] == "re********@example.com" and person["name"] == "테**"
    for target in (person["id"], demo_user["user"]["id"]):
        denied = web.patch(f"/api/admin/users/{target}/role", headers=demo_admin, json={"role": "admin"})
        assert denied.status_code == 403 and "읽기 전용" in denied.json()["detail"]

    # Real admins see real data and can grant all three roles.
    assert any(u["email"] == "realperson@example.com" for u in web.get("/api/admin/users", headers=real).json())
    member = register(web, "member@example.com")
    with session() as db:
        member_id = db.query(User).filter_by(email="member@example.com").one().id
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=real, json={"role": "viewer"}).json()["role"] == "viewer"
    assert web.get("/api/admin/users", headers=member).status_code == 200
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=member, json={"role": "admin"}).status_code == 403
    assert web.patch(f"/api/admin/users/{member_id}/role", headers=real, json={"role": "owner"}).status_code == 422

    # Demo admin is restored to read-only even if someone promoted it.
    with session() as db:
        db.query(User).filter_by(email="demo-admin@healthpick.local").one().role = "admin"
        db.commit()
    assert web.post("/api/auth/demo-login", json={"role": "admin"}).json()["user"]["role"] == "viewer"


def add_foods(session):
    with session() as db:
        db.add_all([
            Food(source_id="F1", name="현미밥", calories=150, protein=3.0, carbs=32.0, fat=1.0),
            Food(source_id="F2", name="샐러드_닭가슴살", calories=90, protein=12.0, carbs=4.0, fat=3.0),
            Food(source_id="F3", name="토스트_누텔라 바나나 토스트", calories=300, protein=6.0, carbs=40.0, fat=12.0),
        ])
        db.commit()


def test_meal_sentence_is_split_and_nutrients_come_from_food_db(client, monkeypatch):
    web, session = client
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    add_foods(session)
    headers = register(web, "parser@example.com")
    assert web.get("/api/meals/parse/status").json() == {"ai": False, "engine": "rules"}
    result = web.post("/api/meals/parse", headers=headers, json={
        "text": "어제 점심에 현미밥 한 공기랑 닭가슴살 샐러드 먹고 바나나 하나", "today": "2026-11-25", "hour": 9}).json()
    assert result["engine"] == "rules"
    rice, salad, banana = result["items"]
    assert (rice["food_name"], rice["meal_type"], rice["eaten_at"], rice["serving_g"], rice["match"]) == ("현미밥", "점심", "2026-11-24", 210, "exact")
    assert rice["nutrients"] == {"calories": 315.0, "protein": 6.3, "carbs": 67.2, "fat": 2.1}
    assert salad["food_name"] == "샐러드_닭가슴살" and salad["serving_estimated"] is True and salad["nutrients"]["protein"] == 24.0
    # A loosely related dish is only offered as a suggestion, never auto-filled.
    assert banana["match"] == "none" and banana["nutrients"] is None and banana["candidates"]
    assert banana["serving_g"] == 120
    assert web.post("/api/meals/parse", headers=headers, json={"text": "음"}).status_code == 422
    assert web.post("/api/meals/parse", json={"text": "현미밥 한 공기"}).status_code == 401


def test_gemini_structures_the_sentence_and_falls_back_to_rules(client, monkeypatch):
    web, session = client
    add_foods(session)
    headers = register(web, "gemini@example.com")
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    calls = []

    class Reply:
        def __init__(self, payload):
            self.payload = payload

        def raise_for_status(self):
            pass

        def json(self):
            return self.payload

    def fake_post(url, headers, timeout, **kwargs):
        calls.append((url, headers, kwargs["json"]))
        items = [{"food_name": "현미밥", "meal_type": "저녁", "eaten_at": "2026-11-23", "serving_g": 105,
                  "serving_estimated": False, "keywords": ["현미밥"], "calories": 9999}]
        return Reply({"candidates": [{"content": {"parts": [{"text": json.dumps({"items": items})}]}}]})

    monkeypatch.setattr(meal_parser.httpx, "post", fake_post)
    result = web.post("/api/meals/parse", headers=headers, json={"text": "그제 저녁 현미밥 반 공기", "today": "2026-11-25", "hour": 20}).json()
    url, sent_headers, body = calls[0]
    assert ":generateContent" in url and sent_headers == {"x-goog-api-key": "test-key"}
    assert body["generationConfig"]["responseMimeType"] == "application/json"
    item = result["items"][0]
    assert result["engine"] == "gemini" and (item["meal_type"], item["eaten_at"], item["serving_g"]) == ("저녁", "2026-11-23", 105)
    assert item["nutrients"]["calories"] == 157.5  # from the DB, not the model's 9999

    def broken_post(*args, **kwargs):
        raise meal_parser.httpx.ConnectError("down")

    monkeypatch.setattr(meal_parser.httpx, "post", broken_post)
    fallback = web.post("/api/meals/parse", headers=headers, json={"text": "현미밥 한 공기", "today": "2026-11-25", "hour": 12}).json()
    assert fallback["engine"] == "rules" and fallback["items"][0]["serving_g"] == 210


def test_withdraw_requires_password_and_removes_user_data(client):
    web, session = client
    first = register(web, "one@example.com")
    second = register(web, "two@example.com")
    assert web.post("/api/meals", headers=first, json={
        "food_name": "현미밥", "meal_type": "점심", "eaten_at": "2026-11-25",
        "serving_g": 150, "calories": 220, "protein": 4, "carbs": 45, "fat": 1,
    }).status_code == 201
    assert web.request("DELETE", "/api/auth/me", headers=first, json={}).status_code == 422
    assert web.request("DELETE", "/api/auth/me", headers=first, json={"password": "WrongPass1!"}).status_code == 401
    assert web.request("DELETE", "/api/auth/me", headers=first, json={"password": "ValidPass1!"}).status_code == 204
    assert web.get("/api/auth/me", headers=first).status_code == 401
    assert web.post("/api/auth/login", json={"email": "one@example.com", "password": "ValidPass1!"}).status_code == 401
    with session() as db:
        assert db.query(Meal).count() == 0
        assert db.query(User).count() == 1
        assert db.query(User).one().email == "two@example.com"


def test_withdraw_blocked_for_demo_and_last_admin(client, monkeypatch):
    web, session = client
    monkeypatch.setattr(main, "demo_enabled", True)
    demo = web.post("/api/auth/demo-login", json={"role": "user"}).json()
    demo_head = {"Authorization": f'Bearer {demo["access_token"]}'}
    assert web.request("DELETE", "/api/auth/me", headers=demo_head, json={}).status_code == 400
    auth = register(web, "admin@example.com")
    with session() as db:
        db.query(User).filter_by(email="admin@example.com").one().role = "admin"
        db.commit()
    assert web.request("DELETE", "/api/auth/me", headers=auth, json={"password": "ValidPass1!"}).status_code == 400
    register(web, "admin2@example.com")
    with session() as db:
        db.query(User).filter_by(email="admin2@example.com").one().role = "admin"
        db.commit()
    assert web.request("DELETE", "/api/auth/me", headers=auth, json={"password": "ValidPass1!"}).status_code == 204


def test_admin_can_delete_member_but_not_self_or_demo(client, monkeypatch):
    web, session = client
    admin = register(web, "admin@example.com")
    member = register(web, "member@example.com")
    viewer_auth = register(web, "viewer@example.com")
    with session() as db:
        db.query(User).filter_by(email="admin@example.com").one().role = "admin"
        db.query(User).filter_by(email="viewer@example.com").one().role = "viewer"
        db.commit()
        ids = {u.email: u.id for u in db.query(User).all()}
    assert web.post("/api/meals", headers=member, json={
        "food_name": "현미밥", "meal_type": "점심", "eaten_at": "2026-11-25",
        "serving_g": 150, "calories": 220, "protein": 4, "carbs": 45, "fat": 1,
    }).status_code == 201
    assert web.delete(f"/api/admin/users/{ids['member@example.com']}", headers=member).status_code == 403
    assert web.delete(f"/api/admin/users/{ids['member@example.com']}", headers=viewer_auth).status_code == 403
    assert web.delete(f"/api/admin/users/{ids['admin@example.com']}", headers=admin).status_code == 400
    assert web.delete(f"/api/admin/users/{ids['member@example.com']}", headers=admin).status_code == 204
    assert web.get("/api/auth/me", headers=member).status_code == 401
    with session() as db:
        assert db.query(Meal).count() == 0
    monkeypatch.setattr(main, "demo_enabled", True)
    web.post("/api/auth/demo-login", json={"role": "user"})
    with session() as db:
        demo_id = db.query(User).filter_by(email="demo-user@healthpick.local").one().id
    assert web.delete(f"/api/admin/users/{demo_id}", headers=admin).status_code == 400
