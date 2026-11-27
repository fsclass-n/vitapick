import os
import ssl
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

database_url = os.getenv("DATABASE_URL", "sqlite:///./healthpick-dev.db")
if os.getenv("APP_ENV") == "production" and not os.getenv("DATABASE_URL"):
    raise RuntimeError("DATABASE_URL is required in production")

connect_args = {}
if database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif database_url.startswith("mysql"):
    # TiDB Cloud requires TLS. Verify the server certificate and hostname.
    tls = ssl.create_default_context(cafile=os.getenv("TIDB_CA_PATH") or None)
    connect_args = {"ssl": tls}

engine = create_engine(database_url, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    with SessionLocal() as db:
        yield db
