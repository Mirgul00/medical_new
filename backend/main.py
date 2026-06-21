import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import date as date_type
from pathlib import Path
from uuid import uuid4

try:
    import bcrypt
except ImportError:  # pragma: no cover - fallback for local environments before deps are installed
    bcrypt = None

from fastapi import FastAPI, Form, Depends, HTTPException, File, UploadFile, Header, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from database import engine, SessionLocal, Base
from models import (
    AdminUser,
    Appointment,
    BeforeAfterCase,
    Certificate,
    ClientNote,
    ClosedSlot,
    Review,
    ScheduleSetting,
    Service,
    SiteSetting,
)
from utils import get_by_id, not_found_response, patch_fields, success_response, update_fields


app = FastAPI()

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = Path(__file__).resolve().parent
UPLOAD_DIR = PROJECT_ROOT / "frontend" / "assets" / "img" / "uploads"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def load_env_file(path: Path):
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        value = line.strip()

        if not value or value.startswith("#") or "=" not in value:
            continue

        key, raw = value.split("=", 1)
        os.environ.setdefault(key.strip(), raw.strip().strip('"').strip("'"))


load_env_file(BACKEND_ROOT / ".env")

MAX_UPLOAD_SIZE = int(os.getenv("MAX_UPLOAD_SIZE", str(5 * 1024 * 1024)))
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set")
JWT_TTL_SECONDS = int(os.getenv("JWT_TTL_SECONDS", str(8 * 60 * 60)))
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "begimaj.dadanova@gmail.com").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
TOKEN_ALGORITHM = "HS256"
TIME_RE = re.compile(r"^\d{2}:\d{2}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PHONE_RE = re.compile(r"^[0-9+()\-\s]{6,24}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = int(os.getenv("RATE_LIMIT_MAX", "120"))
rate_limit_store = {}

Base.metadata.create_all(bind=engine)

DEFAULT_SITE_SETTINGS = {
    "doctor_name": "Даданова Бегимай Нурмухамедовна",
    "specialty": "Дерматолог-косметолог",
    "experience": "6 лет",
    "clients": "25 000+",
    "phone": "0702664406",
    "address": "Турусбекова-13",
    "instagram": "https://instagram.com/dr_dadanoca",
    "telegram": "tel:0702664406",
    "email": "begimaj.dadanova@gmail.com",
    "tiktok": "https://www.tiktok.com/@dr_dadanova?_r=1&_t=ZP-97OjbFfa5JW"
}

LEGACY_SITE_SETTINGS = {
    "phone": ("+996 700 000 000", ""),
    "address": ("Bishkek, Kyrgyzstan", ""),
    "instagram": ("#", ""),
    "email": ("clinic@mail.com", ""),
}

REAL_SERVICES = [
    {
        "title": "Ботулинотерапия",
        "price": "от 7000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/7d4f9c94db32429085ff0694c3b89711.jpg",
        "description": "Инъекционная процедура для коррекции мимических морщин и расслабления активных мышц лица. Помогает сохранить естественную мимику и сделать лицо более свежим.",
    },
    {
        "title": "Ботулинотерапия Full Face",
        "price": "от 7000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/7d4f9c94db32429085ff0694c3b89711.jpg",
        "description": "Комплексная коррекция зон лица с индивидуальным подбором техники для гармоничного омоложения и улучшения качества кожи.",
    },
    {
        "title": "Контурная пластика губ",
        "price": "от 6000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/c0e3ef5f2d0442b1a1050464fb64c45f.jpg",
        "description": "Процедура для коррекции формы и объёма губ с сохранением естественных пропорций лица.",
    },
    {
        "title": "Мезотерапия",
        "price": "от 3000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/53a4e1f3e03c42a2a81320441094da0d.jpg",
        "description": "Процедура с введением специальных препаратов для улучшения состояния кожи, увлажнения, восстановления и улучшения тона кожи.",
    },
    {
        "title": "Биоревитализация",
        "price": "от 4000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/7c75faf65fa248aab8553425b09858f7.jpg",
        "description": "Инъекционная процедура для глубокого увлажнения кожи, улучшения её структуры и повышения упругости.",
    },
    {
        "title": "Плазмотерапия",
        "price": "от 3000 сом",
        "duration": "Индивидуально",
        "category": "Инъекционные процедуры",
        "image": "assets/img/uploads/1f980ae271854d54928f847493db180d.png",
        "description": "Процедура с использованием собственной плазмы пациента для улучшения качества кожи и запуска процессов восстановления.",
    },
    {
        "title": "Все виды чистки лица",
        "price": "от 2500 сом",
        "duration": "Индивидуально",
        "category": "Уход",
        "image": "assets/img/Facial Cleansing.webp",
        "description": "Комплексные процедуры очищения кожи с подбором техники по состоянию кожи.",
    },
    {
        "title": "Пилинги",
        "price": "от 1500 сом",
        "duration": "Индивидуально",
        "category": "Уход",
        "image": "assets/img/Rejuvenation.jpg",
        "description": "Процедуры для обновления кожи, улучшения текстуры, тона и общего состояния кожи.",
    },
]

DEFAULT_BEFORE_AFTER_CASES = [
    {
        "title": "Восстановление ровного тона",
        "description": "Мягкая работа с тусклостью и неровной текстурой кожи.",
        "procedure": "Пилинг + уход",
        "result": "Более ровный тон и визуально свежая кожа.",
        "before_image": "assets/img/Acne Treatment.jpeg",
        "after_image": "assets/img/Rejuvenation.jpg",
    },
    {
        "title": "Уменьшение воспалений",
        "description": "Курс ухода для кожи, склонной к высыпаниям.",
        "procedure": "Лечение акне",
        "result": "Спокойнее рельеф и меньше заметных покраснений.",
        "before_image": "assets/img/Acne Treatment.jpeg",
        "after_image": "assets/img/Facial Cleansing.webp",
    },
    {
        "title": "Свежесть после чистки",
        "description": "Очищение пор и восстановление ухоженного вида.",
        "procedure": "Чистка лица",
        "result": "Кожа выглядит чище, мягче и светлее.",
        "before_image": "assets/img/Consultation.jpg",
        "after_image": "assets/img/Facial Cleansing.webp",
    },
]


def ensure_schema():
    inspector = inspect(engine)

    if "services" in inspector.get_table_names():
        existing = {column["name"] for column in inspector.get_columns("services")}

        with engine.connect() as conn:
            if "duration" not in existing:
                conn.execute(text("ALTER TABLE services ADD COLUMN duration VARCHAR"))
            if "category" not in existing:
                conn.execute(text("ALTER TABLE services ADD COLUMN category VARCHAR"))
            if "image" not in existing:
                conn.execute(text("ALTER TABLE services ADD COLUMN image VARCHAR"))
            if "active" not in existing:
                conn.execute(text("ALTER TABLE services ADD COLUMN active BOOLEAN DEFAULT 1"))
            conn.commit()
    else:
        Base.metadata.create_all(bind=engine)

    if "appointments" in inspector.get_table_names():
        existing = {column["name"] for column in inspector.get_columns("appointments")}

        with engine.connect() as conn:
            if "service_id" not in existing:
                conn.execute(text("ALTER TABLE appointments ADD COLUMN service_id INTEGER"))
            if "procedure_snapshot" not in existing:
                conn.execute(text("ALTER TABLE appointments ADD COLUMN procedure_snapshot VARCHAR DEFAULT ''"))
            if "price_snapshot" not in existing:
                conn.execute(text("ALTER TABLE appointments ADD COLUMN price_snapshot VARCHAR DEFAULT ''"))
            conn.commit()

    Base.metadata.create_all(bind=engine)


ensure_schema()


def seed_services():
    db = SessionLocal()
    try:
        if db.query(Service).count() > 0:
            return

        for item in REAL_SERVICES:
            db.add(Service(**item, active=True))

        db.commit()
    finally:
        db.close()


seed_services()


def seed_certificates():
    db = SessionLocal()
    try:
        if db.query(Certificate).count() > 0:
            return

        items = [
            Certificate(
                title="КГМА им. И.К. Ахунбаева",
                year="Высшее образование",
                description="Факультет: Педиатрия.",
                image="assets/img/about-img.png",
                tags="Образование,Педиатрия",
                active=True,
            ),
            Certificate(
                title="Ординатура",
                year="Дерматовенерология",
                description="Профессиональная подготовка по направлению дерматовенерология.",
                image="assets/img/about-img.png",
                tags="Ординатура,Дерматовенерология",
                active=True,
            ),
            Certificate(
                title="Косметология эстетическая и инъекционная",
                year="Shrammekademy.kg",
                description="Направление: косметолог-эстетист, инъекционные процедуры. Обучение: мезотерапия, биоревитализация, плазмотерапия.",
                image="assets/img/about-img.png",
                tags="Косметология,Инъекционные процедуры",
                active=True,
            ),
            Certificate(
                title="КГМИПиПК им. С.Б. Даниярова",
                year="Повышение квалификации",
                description="Повышение квалификации по направлению косметология.",
                image="assets/img/about-img.png",
                tags="Повышение квалификации,Косметология",
                active=True,
            ),
        ]

        db.add_all(items)
        db.commit()
    finally:
        db.close()


seed_certificates()


def seed_site_settings():
    db = SessionLocal()
    try:
        for key, value in DEFAULT_SITE_SETTINGS.items():
            existing = db.query(SiteSetting).filter(SiteSetting.key == key).first()
            if not existing:
                db.add(SiteSetting(key=key, value=value))
            elif existing.value in LEGACY_SITE_SETTINGS.get(key, set()):
                existing.value = value
        db.commit()
    finally:
        db.close()


seed_site_settings()


def seed_reviews():
    db = SessionLocal()
    try:
        count = db.query(Review).count()
        if count == 0:
            db.add_all([
                Review(
                    id=1,
                    name="Анна П.",
                    text="Очень довольна результатом. Кожа стала заметно лучше уже после первой процедуры.",
                    rating=5,
                    image="",
                ),
                Review(
                    id=2,
                    name="Мария К.",
                    text="Профессиональный подход и внимательное отношение к пациенту.",
                    rating=4,
                    image="",
                ),
                Review(
                    id=3,
                    name="Елена С.",
                    text="Отличный результат, кожа стала чистой и здоровой.",
                    rating=5,
                    image="",
                ),
            ])
            db.commit()
    finally:
        db.close()


seed_reviews()


def hash_password(password: str) -> str:
    if bcrypt:
        return "bcrypt$" + bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 250_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("bcrypt$") and bcrypt:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.removeprefix("bcrypt$").encode("utf-8"))

    if password_hash.startswith("pbkdf2_sha256$"):
        _, salt, digest = password_hash.split("$", 2)
        candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 250_000)
        return hmac.compare_digest(candidate.hex(), digest)

    return False


def seed_admin_user():
    db = SessionLocal()
    try:
        if db.query(AdminUser).count() > 0:
            return

        if not ADMIN_PASSWORD:
            return

        db.add(AdminUser(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD)))
        db.commit()
    finally:
        db.close()


def seed_before_after_cases():
    db = SessionLocal()
    try:
        if db.query(BeforeAfterCase).count() > 0:
            return

        db.add_all([BeforeAfterCase(**item, active=True) for item in DEFAULT_BEFORE_AFTER_CASES])
        db.commit()
    finally:
        db.close()


seed_admin_user()
seed_before_after_cases()

# ==========================
# CORS
# ==========================

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================
# DB
# ==========================

def get_db():
    db = SessionLocal()

    try:
        yield db

    finally:
        db.close()


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def create_token(email: str) -> str:
    header = {"alg": TOKEN_ALGORITHM, "typ": "JWT"}
    payload = {"sub": email, "exp": int(time.time()) + JWT_TTL_SECONDS}
    signing_input = ".".join([
        b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8")),
        b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8")),
    ])
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{b64url_encode(signature)}"


def decode_token(token: str) -> dict:
    try:
        header_b64, payload_b64, signature_b64 = token.split(".", 2)
        signing_input = f"{header_b64}.{payload_b64}"
        expected = hmac.new(JWT_SECRET.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
        actual = b64url_decode(signature_b64)

        if not hmac.compare_digest(expected, actual):
            raise ValueError("Invalid signature")

        payload = json.loads(b64url_decode(payload_b64).decode("utf-8"))

        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("Token expired")

        return payload
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Требуется вход администратора") from exc


def require_admin(
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется вход администратора")

    payload = decode_token(authorization.removeprefix("Bearer ").strip())
    email = str(payload.get("sub", "")).lower()
    user = db.query(AdminUser).filter(AdminUser.email == email).first()

    if not user:
        raise HTTPException(status_code=401, detail="Требуется вход администратора")

    return user


def public_error(message: str, status_code: int = 400):
    raise HTTPException(status_code=status_code, detail=message)


def validate_date(value: str):
    if not DATE_RE.match(value or ""):
        public_error("Некорректная дата")
    try:
        date_type.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Некорректная дата") from exc


def validate_time(value: str):
    if not TIME_RE.match(value or ""):
        public_error("Некорректное время")
    hour, minute = [int(part) for part in value.split(":")]
    if hour > 23 or minute > 59:
        public_error("Некорректное время")


def validate_phone(value: str):
    if not PHONE_RE.match(value or ""):
        public_error("Некорректный номер телефона")


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    message = exc.detail if isinstance(exc.detail, str) else "Ошибка запроса"
    return JSONResponse(status_code=exc.status_code, content={"error": message, "message": message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": "Некорректные данные", "message": "Некорректные данные"})


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        client = request.client.host if request.client else "unknown"
        key = f"{client}:{request.url.path}"
        now = time.time()
        hits = [hit for hit in rate_limit_store.get(key, []) if now - hit < RATE_LIMIT_WINDOW]

        if len(hits) >= RATE_LIMIT_MAX:
            return JSONResponse(status_code=429, content={"error": "Слишком много запросов", "message": "Слишком много запросов"})

        hits.append(now)
        rate_limit_store[key] = hits

    return await call_next(request)


# ==========================
# HOME
# ==========================

@app.get("/")
def home():
    return {
        "message": "Dadanova API"
    }


@app.post("/admin/login")
def admin_login(
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
):
    normalized_email = email.strip().lower()

    if not EMAIL_RE.match(normalized_email):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    user = db.query(AdminUser).filter(AdminUser.email == normalized_email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    return {
        "success": True,
        "token": create_token(user.email),
        "token_type": "bearer",
        "expires_in": JWT_TTL_SECONDS,
    }


@app.get("/admin/me")
def admin_me(admin: AdminUser = Depends(require_admin)):
    return {"email": admin.email}


@app.get("/site-settings")
def get_site_settings(db: Session = Depends(get_db)):
    settings = db.query(SiteSetting).all()
    return serialize_site_settings(settings)


@app.put("/site-settings")
async def update_site_settings(
    request: Request,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    form = await request.form()
    allowed_keys = set(DEFAULT_SITE_SETTINGS.keys())
    values = {
        key: str(value).strip()
        for key, value in form.items()
        if key in allowed_keys and str(value).strip() != ""
    }

    email = values.get("email", "")

    if email and not EMAIL_RE.match(email):
        public_error("Некорректный email")

    for key, value in values.items():
        setting = db.query(SiteSetting).filter(SiteSetting.key == key).first()
        if setting:
            setting.value = value
        else:
            db.add(SiteSetting(key=key, value=value))

    db.commit()
    return serialize_site_settings(db.query(SiteSetting).all())


@app.get("/reviews")
def get_reviews(db: Session = Depends(get_db)):
    reviews = db.query(Review).order_by(Review.id).limit(3).all()
    return [serialize_review(item) for item in reviews]


@app.put("/review/{id}")
def update_review(
    id: int,
    name: str = Form(...),
    text: str = Form(...),
    rating: int = Form(5),
    image: str = Form(""),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if id < 1 or id > 3:
        raise HTTPException(status_code=400, detail="Only three fixed reviews are editable")

    review = db.query(Review).filter(Review.id == id).first()
    if not review:
        review = Review(id=id)
        db.add(review)

    review.name = name
    review.text = text
    review.rating = max(1, min(5, int(rating or 5)))
    review.image = image
    db.commit()

    return serialize_review(review)


@app.get("/before-after")
def get_before_after_cases(
    active: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(BeforeAfterCase).order_by(BeforeAfterCase.id)

    if active is not None:
        query = query.filter(BeforeAfterCase.active == active)

    return [serialize_before_after(item) for item in query.all()]


@app.post("/before-after")
def create_before_after_case(
    title: str = Form(...),
    description: str = Form(""),
    procedure: str = Form(""),
    result: str = Form(""),
    before_image: str = Form(""),
    after_image: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    case = BeforeAfterCase(
        title=title,
        description=description,
        procedure=procedure,
        result=result,
        before_image=before_image,
        after_image=after_image,
        active=active,
    )
    db.add(case)
    db.commit()
    db.refresh(case)
    return serialize_before_after(case)


@app.put("/before-after/{id}")
def update_before_after_case(
    id: int,
    title: str = Form(...),
    description: str = Form(""),
    procedure: str = Form(""),
    result: str = Form(""),
    before_image: str = Form(""),
    after_image: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    case = get_by_id(db, BeforeAfterCase, id)

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    update_fields(case, {
        "title": title,
        "description": description,
        "procedure": procedure,
        "result": result,
        "before_image": before_image,
        "after_image": after_image,
        "active": active,
    })
    db.commit()
    return serialize_before_after(case)


@app.delete("/before-after/{id}")
def delete_before_after_case(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    case = get_by_id(db, BeforeAfterCase, id)

    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    db.delete(case)
    db.commit()
    return {"success": True}


# ==========================
# SERIALIZERS
# ==========================

def serialize_appointment(appointment):
    return {
        "id": appointment.id,
        "name": appointment.name,
        "phone": appointment.phone,
        "procedure": appointment.procedure_snapshot or appointment.procedure,
        "procedure_legacy": appointment.procedure,
        "service_id": appointment.service_id,
        "procedure_snapshot": appointment.procedure_snapshot or appointment.procedure,
        "price_snapshot": appointment.price_snapshot or "",
        "date": appointment.date,
        "time": appointment.time,
        "comment": appointment.comment,
        "status": appointment.status,
    }


def serialize_service(service):
    return {
        "id": service.id,
        "title": service.title,
        "description": service.description or "",
        "price": service.price or "",
        "duration": service.duration or "",
        "category": service.category or "",
        "image": service.image or "",
        "active": bool(service.active),
    }


def serialize_schedule(schedule):
    return {
        "id": schedule.id,
        "work_days": schedule.work_days or "",
        "start_time": schedule.start_time or "09:00",
        "end_time": schedule.end_time or "16:00",
        "break_start": schedule.break_start or "",
        "break_end": schedule.break_end or "",
    }


def serialize_closed_slot(slot):
    return {
        "id": slot.id,
        "date": slot.date,
        "time": slot.time,
        "reason": slot.reason or "",
    }


def serialize_certificate(certificate):
    return {
        "id": certificate.id,
        "title": certificate.title,
        "year": certificate.year or "",
        "description": certificate.description or "",
        "image": certificate.image or "assets/img/about-img.png",
        "tags": certificate.tags or "",
        "active": bool(certificate.active),
    }


def serialize_site_settings(settings):
    result = DEFAULT_SITE_SETTINGS.copy()
    for item in settings:
        if item.key in result and item.value not in (None, ""):
            result[item.key] = item.value
    return result


def serialize_review(review):
    return {
        "id": review.id,
        "name": review.name or "",
        "text": review.text or "",
        "rating": max(1, min(5, int(review.rating or 5))),
        "image": review.image or "",
    }


def serialize_before_after(case):
    return {
        "id": case.id,
        "title": case.title or "",
        "description": case.description or "",
        "procedure": case.procedure or "",
        "result": case.result or "",
        "before_image": case.before_image or "",
        "after_image": case.after_image or "",
        "active": bool(case.active),
    }


async def save_uploaded_image(file: UploadFile):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Можно загрузить только изображение")

    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Файл должен быть изображением")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")

    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой")

    destination.write_bytes(content)
    return f"assets/img/uploads/{filename}"


@app.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    admin: AdminUser = Depends(require_admin),
):
    image_path = await save_uploaded_image(file)
    return {
        "success": True,
        "path": image_path
    }


# ==========================
# ВСЕ ЗАПИСИ
# ==========================

@app.get("/appointments")
def get_appointments(
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    appointments = db.query(
        Appointment
    ).all()

    return [serialize_appointment(item) for item in appointments]


def parse_time_minutes(value: str) -> int:
    validate_time(value)
    hour, minute = [int(part) for part in value.split(":")]
    return hour * 60 + minute


def format_time_minutes(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def parse_duration_minutes(value: str | None) -> int:
    match = re.search(r"\d+", value or "")
    return int(match.group(0)) if match else 60


def find_service(db: Session, service_id: int | None, procedure: str | None):
    service = None

    if service_id:
        service = db.query(Service).filter(Service.id == service_id, Service.active == True).first()

    if not service and procedure:
        service = db.query(Service).filter(Service.title == procedure, Service.active == True).first()

    return service


def appointment_duration(db: Session, appointment: Appointment) -> int:
    service = find_service(db, appointment.service_id, appointment.procedure_snapshot or appointment.procedure)
    return parse_duration_minutes(service.duration if service else "")


def appointment_overlaps(db: Session, appointment: Appointment, start: int, end: int) -> bool:
    item_start = parse_time_minutes(appointment.time)
    item_end = item_start + appointment_duration(db, appointment)
    return start < item_end and end > item_start


def get_available_slots_for_date(db: Session, date: str, service=None):
    validate_date(date)
    schedule = get_or_create_schedule(db)
    work_days = [day for day in (schedule.work_days or "1,2,3,4,5").split(",") if day]
    day_number = date_type.fromisoformat(date).isoweekday() % 7

    if str(day_number) not in work_days:
        return []

    start = parse_time_minutes(schedule.start_time or "09:00")
    end = parse_time_minutes(schedule.end_time or "16:00")
    break_start = parse_time_minutes(schedule.break_start) if schedule.break_start else None
    break_end = parse_time_minutes(schedule.break_end) if schedule.break_end else None
    duration = parse_duration_minutes(service.duration if service else "")
    appointments = db.query(Appointment).filter(
        Appointment.date == date,
        Appointment.status != "cancelled",
    ).all()
    closed_times = {
        parse_time_minutes(slot.time)
        for slot in db.query(ClosedSlot).filter(ClosedSlot.date == date).all()
        if slot.time
    }
    slots = []
    current = start

    while current + duration <= end:
        slot_end = current + duration
        in_break = break_start is not None and break_end is not None and current < break_end and slot_end > break_start
        closed = current in closed_times
        busy = any(appointment_overlaps(db, item, current, slot_end) for item in appointments)

        if not in_break and not closed and not busy:
            slots.append(format_time_minutes(current))

        current += 30

    return slots


# ==========================
# ЗАНЯТОЕ ВРЕМЯ
# ==========================

@app.get("/busy/{date}")
def busy(
    date: str,
    db: Session = Depends(get_db)
):

    result = db.query(
        Appointment.time
    ).filter(
        Appointment.date == date,
        Appointment.status != "cancelled"
    ).all()

    closed = db.query(
        ClosedSlot.time
    ).filter(
        ClosedSlot.date == date
    ).all()

    return list({x[0] for x in result} | {x[0] for x in closed})


@app.get("/available-slots/{date}")
def available_slots(
    date: str,
    service_id: int | None = Query(None),
    procedure: str | None = Query(None),
    db: Session = Depends(get_db),
):
    service = find_service(db, service_id, procedure)
    return get_available_slots_for_date(db, date, service)


# ==========================
# НОВАЯ ЗАПИСЬ
# ==========================

@app.post("/appointment")
def create_appointment(

    name: str = Form(...),

    phone: str = Form(...),

    procedure: str = Form(...),

    date: str = Form(...),

    time: str = Form(...),

    comment: str = Form(""),

    service_id: int | None = Form(None),

    db: Session = Depends(get_db)

):
    validate_phone(phone)
    validate_date(date)
    validate_time(time)

    service = find_service(db, service_id, procedure)

    if not service:
        raise HTTPException(status_code=400, detail="Услуга не найдена")

    available = get_available_slots_for_date(db, date, service)

    if time not in available:
        return {
            "success": False,
            "message": "Время уже занято или недоступно"
        }

    check = db.query(
        Appointment
    ).filter(
        Appointment.date == date,
        Appointment.time == time,
        Appointment.status != "cancelled"
    ).first()

    if check:
        return {
            "success": False,
            "message": "Время уже занято"
        }

    closed = db.query(
        ClosedSlot
    ).filter(
        ClosedSlot.date == date,
        ClosedSlot.time == time
    ).first()

    if closed:
        return {
            "success": False,
            "message": "Слот закрыт администратором"
        }

    new = Appointment(

        name=name,

        phone=phone,

        procedure=service.title,

        service_id=service.id,

        procedure_snapshot=service.title,

        price_snapshot=service.price or "",

        date=date,

        time=time,

        comment=comment,

        status="new"

    )

    db.add(new)

    db.commit()

    db.refresh(new)

    return {
        "success": True,
        "message": "Запись создана"
    }


# ==========================
# ПОДТВЕРДИТЬ
# ==========================

def set_appointment_status(db: Session, appointment_id: int, status: str):
    appointment = get_by_id(db, Appointment, appointment_id)

    if not appointment:
        return not_found_response()

    appointment.status = status
    db.commit()
    return success_response()


@app.patch("/appointment/{id}/confirm")
def confirm_appointment(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return set_appointment_status(db, id, "confirmed")


# ==========================
# ОТМЕНИТЬ
# ==========================

@app.patch("/appointment/{id}/cancel")
def cancel_appointment(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return set_appointment_status(db, id, "cancelled")


# ==========================
# ЗАВЕРШИТЬ
# ==========================

@app.patch("/appointment/{id}/complete")
def complete_appointment(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return set_appointment_status(db, id, "completed")


# ==========================
# ОБНОВИТЬ СТАТУС
# ==========================

@app.put("/appointment/{id}")
def update_status(

    id: int,

    status: str,

    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)

):
    return set_appointment_status(db, id, status)


@app.patch("/appointment/{id}")
def patch_appointment_status(
    id: int,
    status: str = Form(...),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return set_appointment_status(db, id, status)


# ==========================
# УДАЛИТЬ ЗАПИСЬ
# ==========================

@app.delete("/appointment/{id}")
def delete_appointment(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    appointment = get_by_id(db, Appointment, id)

    if not appointment:
        return not_found_response()

    db.delete(appointment)
    db.commit()
    return success_response()


# ==========================
# СТАТИСТИКА
# ==========================

@app.get("/stats")
def stats(
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):

    all_records = db.query(
        Appointment
    ).all()

    total = len(all_records)

    new_count = len(
        [x for x in all_records if x.status == "new"]
    )

    confirmed_count = len(
        [x for x in all_records if x.status == "confirmed"]
    )

    cancelled_count = len(
        [x for x in all_records if x.status == "cancelled"]
    )

    return {
        "total": total,
        "new": new_count,
        "confirmed": confirmed_count,
        "cancelled": cancelled_count
    }



@app.get("/services")
def get_services(
    active: bool | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Service)

    if active is not None:
        query = query.filter(Service.active == active)

    services = query.all()
    return [serialize_service(item) for item in services]


@app.post("/service")
def create_service(

    title: str = Form(...),
    price: str = Form(""),
    description: str = Form(""),
    duration: str = Form(""),
    category: str = Form(""),
    image: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)

):

    service = Service(
        title=title,
        price=price,
        description=description,
        duration=duration,
        category=category,
        image=image,
        active=active,
    )

    db.add(service)
    db.commit()

    return {
        "success": True
    }


@app.put("/service/{id}")
def update_service(

    id: int,
    title: str = Form(...),
    price: str = Form(""),
    description: str = Form(""),
    duration: str = Form(""),
    category: str = Form(""),
    image: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)

):

    service = get_by_id(db, Service, id)

    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    update_fields(service, {
        "title": title,
        "price": price,
        "description": description,
        "duration": duration,
        "category": category,
        "image": image,
        "active": active,
    })

    db.commit()

    return {
        "success": True
    }


@app.patch("/service/{id}")
def patch_service(
    id: int,
    title: str | None = Form(None),
    price: str | None = Form(None),
    description: str | None = Form(None),
    duration: str | None = Form(None),
    category: str | None = Form(None),
    image: str | None = Form(None),
    active: bool | None = Form(None),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    service = get_by_id(db, Service, id)
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    patch_fields(service, {
        "title": title,
        "price": price,
        "description": description,
        "duration": duration,
        "category": category,
        "image": image,
        "active": active,
    })

    db.commit()

    return {
        "success": True
    }


@app.delete("/service/{id}")
def delete_service(

    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)

):

    service = get_by_id(db, Service, id)

    if not service:
        return not_found_response("Service not found")

    db.delete(service)
    db.commit()

    return success_response()


# ==========================
# СЕРТИФИКАТЫ
# ==========================

@app.get("/certificates")
def get_certificates(
    active: bool | None = None,
    db: Session = Depends(get_db)
):
    query = db.query(Certificate)

    if active is not None:
        query = query.filter(Certificate.active == active)

    certificates = query.all()
    return [serialize_certificate(item) for item in certificates]


@app.post("/certificate")
def create_certificate(
    title: str = Form(...),
    year: str = Form(""),
    description: str = Form(""),
    image: str = Form("assets/img/about-img.png"),
    tags: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    certificate = Certificate(
        title=title,
        year=year,
        description=description,
        image=image,
        tags=tags,
        active=active,
    )
    db.add(certificate)
    db.commit()

    return {
        "success": True
    }


@app.put("/certificate/{id}")
def update_certificate(
    id: int,
    title: str = Form(...),
    year: str = Form(""),
    description: str = Form(""),
    image: str = Form("assets/img/about-img.png"),
    tags: str = Form(""),
    active: bool = Form(True),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    certificate = get_by_id(db, Certificate, id)

    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")

    update_fields(certificate, {
        "title": title,
        "year": year,
        "description": description,
        "image": image,
        "tags": tags,
        "active": active,
    })
    db.commit()

    return {
        "success": True
    }


@app.patch("/certificate/{id}")
def patch_certificate(
    id: int,
    title: str | None = Form(None),
    year: str | None = Form(None),
    description: str | None = Form(None),
    image: str | None = Form(None),
    tags: str | None = Form(None),
    active: bool | None = Form(None),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    certificate = get_by_id(db, Certificate, id)

    if not certificate:
        raise HTTPException(status_code=404, detail="Certificate not found")

    patch_fields(certificate, {
        "title": title,
        "year": year,
        "description": description,
        "image": image,
        "tags": tags,
        "active": active,
    })

    db.commit()

    return {
        "success": True
    }


@app.delete("/certificate/{id}")
def delete_certificate(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    certificate = get_by_id(db, Certificate, id)

    if not certificate:
        return not_found_response("Certificate not found")

    db.delete(certificate)
    db.commit()

    return success_response()


# ==========================
# РАСПИСАНИЕ
# ==========================

def get_or_create_schedule(db: Session):
    schedule = db.query(ScheduleSetting).first()

    if schedule:
        return schedule

    schedule = ScheduleSetting()
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@app.get("/schedule")
def get_schedule(
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    return serialize_schedule(get_or_create_schedule(db))


@app.put("/schedule")
def update_schedule(
    work_days: str = Form("1,2,3,4,5"),
    start_time: str = Form("09:00"),
    end_time: str = Form("16:00"),
    break_start: str = Form(""),
    break_end: str = Form(""),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    schedule = get_or_create_schedule(db)
    schedule.work_days = work_days
    schedule.start_time = start_time
    schedule.end_time = end_time
    schedule.break_start = break_start
    schedule.break_end = break_end
    db.commit()

    return {
        "success": True,
        "schedule": serialize_schedule(schedule)
    }


@app.get("/closed-slots")
def get_closed_slots(
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    slots = db.query(ClosedSlot).all()
    return [serialize_closed_slot(slot) for slot in slots]


@app.post("/closed-slot")
def create_closed_slot(
    date: str = Form(...),
    time: str = Form(...),
    reason: str = Form(""),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    validate_date(date)
    validate_time(time)
    existing = db.query(ClosedSlot).filter(
        ClosedSlot.date == date,
        ClosedSlot.time == time
    ).first()

    if existing:
        return {
            "success": False,
            "message": "Слот уже закрыт"
        }

    slot = ClosedSlot(date=date, time=time, reason=reason)
    db.add(slot)
    db.commit()
    db.refresh(slot)

    return {
        "success": True,
        "slot": serialize_closed_slot(slot)
    }


@app.delete("/closed-slot/{id}")
def delete_closed_slot(
    id: int,
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    slot = get_by_id(db, ClosedSlot, id)

    if not slot:
        return not_found_response()

    db.delete(slot)
    db.commit()

    return success_response()


# ==========================
# КЛИЕНТЫ
# ==========================

@app.get("/clients")
def get_clients(
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    appointments = db.query(Appointment).all()
    notes = {
        item.phone: item.note or ""
        for item in db.query(ClientNote).all()
    }
    clients = {}

    for appointment in appointments:
        key = appointment.phone or appointment.name

        if key not in clients:
            clients[key] = {
                "name": appointment.name,
                "phone": appointment.phone,
                "note": notes.get(appointment.phone, ""),
                "appointments": [],
            }

        clients[key]["appointments"].append(serialize_appointment(appointment))

    return list(clients.values())


@app.put("/client-note")
def update_client_note(
    phone: str = Form(...),
    note: str = Form(""),
    admin: AdminUser = Depends(require_admin),
    db: Session = Depends(get_db)
):
    item = db.query(ClientNote).filter(ClientNote.phone == phone).first()

    if not item:
        item = ClientNote(phone=phone, note=note)
        db.add(item)
    else:
        item.note = note

    db.commit()

    return {
        "success": True
    }
