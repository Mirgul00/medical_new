from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pathlib import Path


DATABASE_PATH = Path(__file__).resolve().parent / "clinic.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"



engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False
    }
)



SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)



Base = declarative_base()
