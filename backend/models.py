import enum
import os
from datetime import datetime

from pydantic import BaseModel, ConfigDict
from sqlalchemy import DateTime, Enum, Float, Integer, String
from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

DB_PATH = os.path.join(os.path.dirname(__file__), "lostfound.db")
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite+aiosqlite:///{DB_PATH}")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(AsyncAttrs, DeclarativeBase):
    pass


class BountyState(str, enum.Enum):
    OPEN = "Open"
    CLAIMED = "Claimed"
    RESOLVED = "Resolved"
    EXPIRED = "Expired"


class Bounty(Base):
    __tablename__ = "bounties"

    bounty_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    owner_address: Mapped[str | None] = mapped_column(String, nullable=True)
    finder_address: Mapped[str | None] = mapped_column(String, nullable=True)
    amount_wei: Mapped[str | None] = mapped_column(String, nullable=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    state: Mapped[BountyState | None] = mapped_column(Enum(BountyState), nullable=True)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    ipfs_cid: Mapped[str | None] = mapped_column(String, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    tx_hash_created: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


class AdCreate(BaseModel):
    bounty_id: int
    lat: float
    lng: float


class OnChainSync(BaseModel):
    owner_address: str | None = None
    finder_address: str | None = None
    amount_wei: str | None = None
    deadline: datetime | None = None
    state: BountyState | None = None
    description: str | None = None
    ipfs_cid: str | None = None
    tx_hash_created: str | None = None


class BountyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    bounty_id: int
    owner_address: str | None = None
    finder_address: str | None = None
    amount_wei: str | None = None
    deadline: datetime | None = None
    state: BountyState | None = None
    description: str | None = None
    ipfs_cid: str | None = None
    lat: float | None = None
    lng: float | None = None
    tx_hash_created: str | None = None
    created_at: datetime
    updated_at: datetime


class BountyNearbyOut(BountyOut):
    distance_km: float
