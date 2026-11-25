"""Turn a Korean meal sentence into meal drafts.

Gemini (when GEMINI_API_KEY is set) or a built-in rule parser only extracts the structure:
food, meal type, date and grams. Nutrients always come from the public-data `foods` table
(per 100 g x grams), so the model never invents nutrition values.
"""

import json
import logging
import os
import re
from datetime import date, timedelta

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .models import Food

logger = logging.getLogger("vitapick")
MEAL_TYPES = ("아침", "점심", "저녁", "간식")
DEFAULT_SERVING_G = 200.0
MATCH_THRESHOLD = 0.5

MEAL_WORDS = {"아침": "아침", "조식": "아침", "브런치": "아침", "점심": "점심", "중식": "점심", "런치": "점심",
              "저녁": "저녁", "석식": "저녁", "디너": "저녁", "야식": "간식", "간식": "간식", "디저트": "간식", "후식": "간식"}
NUMBERS = {"한": 1, "하나": 1, "두": 2, "둘": 2, "세": 3, "셋": 3, "네": 4, "넷": 4, "다섯": 5, "반": 0.5}
UNIT_GRAMS = {"공기": 210, "그릇": 400, "인분": 300, "접시": 300, "개": 100, "조각": 100, "쪽": 30, "잔": 200, "컵": 200,
              "캔": 350, "병": 500, "장": 35, "줌": 30, "봉지": 120, "팩": 200, "큰술": 15, "스푼": 15, "작은술": 5}
PIECE_GRAMS = {"달걀": 50, "계란": 50, "사과": 200, "바나나": 120, "귤": 80, "만두": 30, "고구마": 150, "감자": 150}
FILLER = r"(?:오늘|어제|그저께|그제|엊그제|저는|나는|내가|제가|좀|약|대략|정도|쯤|가량|그리고)"
VERBS = r"(?:먹었습니다|먹었어요|먹었어|먹었다|먹었음|먹음|먹은|먹고|먹어|마셨습니다|마셨어요|마셨어|마셨다|마심|마시고|섭취했어요|섭취했다|섭취|했어요|했어|했다)"
CLAUSE_SPLIT = re.compile(r"(?:먹고|마시고|먹은\s*뒤에?|먹은\s*후에?|[.。!?\n]|,\s*(?=(?:아침|점심|저녁|간식|야식|오늘|어제)))")
ITEM_SPLIT = re.compile(r"\s*(?:,|，|\+|/|그리고|및|이랑|랑|하고)\s*")
QUANTITY = re.compile(
    r"(?P<num>\d+(?:\.\d+)?|한|하나|두|둘|세|셋|네|넷|다섯|반)\s*"
    r"(?P<unit>kg|g|그램|ml|mL|밀리|공기|그릇|인분|접시|개|조각|쪽|잔|컵|캔|병|장|줌|봉지|팩|큰술|스푼|작은술)"
    r"|(?P<count>하나|둘|셋|넷|다섯)(?![가-힣])"
)


def resolve_date(text: str, today: date):
    if m := re.search(r"(20\d{2})[-./](\d{1,2})[-./](\d{1,2})", text):
        candidate = (int(m[1]), int(m[2]), int(m[3]))
    elif m := re.search(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일", text) or re.search(r"(?<!\d)(\d{1,2})/(\d{1,2})(?!\d)", text):
        candidate = (today.year, int(m[1]), int(m[2]))
    elif "그저께" in text or "그제" in text or "엊그제" in text:
        return today - timedelta(days=2)
    elif "어제" in text:
        return today - timedelta(days=1)
    elif "오늘" in text:
        return today
    else:
        return None
    try:
        return date(*candidate)
    except ValueError:
        return None


def resolve_meal_type(text: str):
    for word, meal_type in MEAL_WORDS.items():
        if word in text:
            return meal_type
    return None


def default_meal_type(hour: int) -> str:
    return "아침" if hour < 11 else "점심" if hour < 16 else "저녁" if hour < 21 else "간식"


def grams_for(number: str, unit: str, food_name: str) -> float:
    value = float(number) if number[0].isdigit() else NUMBERS[number]
    if unit == "kg":
        return value * 1000
    if unit in ("g", "그램", "ml", "mL", "밀리"):
        return value
    if unit == "개":
        return value * next((g for key, g in PIECE_GRAMS.items() if key in food_name), UNIT_GRAMS["개"])
    return value * UNIT_GRAMS[unit]


def clean_name(segment: str) -> str:
    text = QUANTITY.sub(" ", segment)
    text = re.sub(r"(20\d{2})[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|(?<!\d)\d{1,2}/\d{1,2}(?!\d)", " ", text)
    text = re.sub("(?:" + "|".join(MEAL_WORDS) + r")(?:에는|에|엔|으로|로|때|식사로)?", " ", text)
    text = re.sub(VERBS, " ", text)
    text = re.sub(FILLER, " ", text)
    tokens = []
    for token in text.split():
        token = re.sub(r"(으로|에서|에는)$", "", token) if len(token) >= 4 else token
        token = re.sub(r"[을를은는이가도만로에]$", "", token) if len(token) >= 3 else token
        if token:
            tokens.append(token)
    return " ".join(tokens).strip(" ~.,")


def rule_parse(text: str, today: date, hour: int):
    items, current_date, current_type = [], None, None
    for clause in filter(str.strip, CLAUSE_SPLIT.split(text)):
        current_date = resolve_date(clause, today) or current_date
        current_type = resolve_meal_type(clause) or current_type
        for segment in filter(str.strip, ITEM_SPLIT.split(clause)):
            name = clean_name(segment)
            if len(name) < 1:
                continue
            quantity = QUANTITY.search(segment)
            items.append({
                "food_name": name[:120],
                "meal_type": current_type or default_meal_type(hour),
                "eaten_at": current_date or today,
                "serving_g": (grams_for(quantity["num"], quantity["unit"], name) if quantity and quantity["num"]
                              else grams_for(quantity["count"], "개", name) if quantity else DEFAULT_SERVING_G),
                "serving_estimated": quantity is None,
                "keywords": [],
            })
    return items[:8]


GEMINI_SCHEMA = {
    "type": "OBJECT",
    "properties": {"items": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
        "food_name": {"type": "STRING", "description": "음식 이름 (한국어, 수량·조사 제외)"},
        "meal_type": {"type": "STRING", "enum": list(MEAL_TYPES)},
        "eaten_at": {"type": "STRING", "description": "YYYY-MM-DD"},
        "serving_g": {"type": "NUMBER", "description": "섭취량(그램). 수량 표현이 없으면 1인분 기준으로 추정"},
        "serving_estimated": {"type": "BOOLEAN", "description": "그램이 문장에 명시되지 않아 추정했으면 true"},
        "keywords": {"type": "ARRAY", "items": {"type": "STRING"}, "description": "식품 DB 검색용 짧은 한국어 이름 1~3개"},
    }, "required": ["food_name", "meal_type", "eaten_at", "serving_g", "serving_estimated", "keywords"]}}},
    "required": ["items"],
}
GEMINI_INSTRUCTION = (
    "너는 한국어 식단 문장을 구조화하는 도우미다. 문장에 나온 음식마다 항목을 하나씩 만든다. "
    "영양값(열량·단백질·탄수화물·지방)은 절대 만들지 않는다. "
    "날짜는 기준일을 바탕으로 '어제', '그제', 'n월 n일' 같은 표현을 YYYY-MM-DD로 바꾸고, 없으면 기준일을 쓴다. "
    "식사 구분은 아침/점심/저녁/간식 중 하나이며, 문장에 없으면 기준 시각으로 고른다(야식·디저트는 간식). "
    "섭취량은 그램으로, '한 공기'=210g, '한 그릇'=400g, '1인분'=300g, 달걀 1개=50g처럼 한국 표준 1회 제공량으로 환산한다. "
    "keywords에는 식품의약품안전처 식품영양성분DB에서 찾기 쉬운 짧은 이름을 넣는다(예: '닭가슴살 샐러드' → ['샐러드', '닭가슴살'])."
)


def gemini_parse(text: str, today: date, hour: int):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        return None
    model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
    body = {
        "systemInstruction": {"parts": [{"text": GEMINI_INSTRUCTION}]},
        "contents": [{"role": "user", "parts": [{"text": f"기준일: {today.isoformat()} ({hour}시)\n문장: {text}"}]}],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json", "responseSchema": GEMINI_SCHEMA},
    }
    try:
        response = httpx.post(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                              headers={"x-goog-api-key": key}, json=body, timeout=15)
        response.raise_for_status()
        parts = response.json()["candidates"][0]["content"]["parts"]
        raw = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))["items"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
        logger.warning("Gemini meal parsing failed, using rule parser: %s", type(error).__name__)
        return None
    items = []
    for item in raw[:8]:
        try:
            eaten_at = date.fromisoformat(str(item.get("eaten_at")))
        except ValueError:
            eaten_at = today
        serving = item.get("serving_g")
        name = str(item.get("food_name") or "").strip()[:120]
        if not name:
            continue
        valid_serving = isinstance(serving, (int, float)) and 0 < serving <= 5000
        items.append({
            "food_name": name,
            "meal_type": item.get("meal_type") if item.get("meal_type") in MEAL_TYPES else default_meal_type(hour),
            "eaten_at": eaten_at,
            "serving_g": float(serving) if valid_serving else DEFAULT_SERVING_G,
            "serving_estimated": bool(item.get("serving_estimated")) or not valid_serving,
            "keywords": [str(k).strip() for k in item.get("keywords") or [] if str(k).strip()][:3],
        })
    return items


def normalize(name: str) -> str:
    return re.sub(r"[\s_()/\[\],.-]", "", name)


def score(food_name: str, terms: list[str]) -> float:
    """Share of the DB name explained by the query (1000 = exact). Low scores are suggestions only."""
    candidate = normalize(food_name)
    if not candidate:
        return 0
    best = 0.0
    for term in terms:
        compact = normalize(term)
        if compact == candidate:
            return 1000
        parts = {p for p in re.split(r"[\s_]", term) if len(p) >= 2} or {compact}
        matched = sum(candidate.count(part) * len(part) for part in parts if part)
        best = max(best, min(matched, len(candidate)) / len(candidate))
    return best


def match_foods(db: Session, name: str, keywords: list[str]):
    terms = list(dict.fromkeys(t for t in [name, *keywords] if t.strip()))
    parts = list(dict.fromkeys(p for t in terms for p in [normalize(t), *t.split()] if len(p) >= 2 or p == normalize(t)))
    if not parts:
        return None, "none", []
    rows = db.scalars(select(Food).where(or_(*[Food.name.like(f"%{p}%") for p in parts])).limit(120)).all()
    ranked = sorted(((score(f.name, terms), f) for f in rows), key=lambda pair: (-pair[0], len(pair[1].name)))
    ranked = [(s, f) for s, f in ranked if s > 0][:5]
    if ranked and ranked[0][0] >= MATCH_THRESHOLD:
        return ranked[0][1], "exact" if ranked[0][0] == 1000 else "similar", [f for _, f in ranked]
    return None, "none", [f for _, f in ranked]


def food_dict(food: Food):
    return {"id": food.id, "name": food.name, "calories": food.calories, "protein": food.protein, "carbs": food.carbs, "fat": food.fat}


def nutrients_for(food: Food | None, serving_g: float):
    if food is None:
        return None
    ratio = serving_g / 100
    return {key: round(getattr(food, key) * ratio, 1) for key in ("calories", "protein", "carbs", "fat")}


def parse_meal_text(db: Session, text: str, today: date, hour: int):
    items = gemini_parse(text, today, hour)
    engine = "gemini" if items else "rules"
    if not items:
        items = rule_parse(text, today, hour)
    drafts = []
    for item in items:
        best, match, candidates = match_foods(db, item["food_name"], item["keywords"])
        drafts.append({
            "query": item["food_name"],
            "food_name": best.name if best else item["food_name"],
            "meal_type": item["meal_type"],
            "eaten_at": item["eaten_at"].isoformat(),
            "serving_g": round(item["serving_g"], 1),
            "serving_estimated": item["serving_estimated"],
            "match": match,
            "food": food_dict(best) if best else None,
            "candidates": [food_dict(c) for c in candidates],
            "nutrients": nutrients_for(best, item["serving_g"]),
        })
    return {"engine": engine, "items": drafts}
