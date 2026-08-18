import math
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from backend.models import (
    AdCreate,
    Bounty,
    BountyNearbyOut,
    BountyOut,
    BountyState,
    OnChainSync,
    async_session,
    init_db,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Lost & Found - Ads & Geo servis", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    earth_radius_km = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlambda / 2) ** 2
    return 2 * earth_radius_km * math.asin(math.sqrt(a))


@app.post("/ads", response_model=BountyOut)
async def upsert_ad_location(ad: AdCreate):
    async with async_session() as session:
        bounty = await session.get(Bounty, ad.bounty_id)
        if bounty is None:
            bounty = Bounty(bounty_id=ad.bounty_id, lat=ad.lat, lng=ad.lng)
            session.add(bounty)
        else:
            bounty.lat = ad.lat
            bounty.lng = ad.lng
        await session.commit()
        await session.refresh(bounty)
        return bounty


@app.patch("/internal/ads/{bounty_id}", response_model=BountyOut)
async def sync_onchain_ad(bounty_id: int, data: OnChainSync):
    async with async_session() as session:
        bounty = await session.get(Bounty, bounty_id)
        if bounty is None:
            bounty = Bounty(bounty_id=bounty_id)
            session.add(bounty)

        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(bounty, field, value)

        await session.commit()
        await session.refresh(bounty)
        return bounty


@app.get("/ads", response_model=list[BountyOut])
async def list_ads(state: BountyState | None = None):
    async with async_session() as session:
        stmt = select(Bounty)
        if state is not None:
            stmt = stmt.where(Bounty.state == state)
        result = await session.execute(stmt)
        return result.scalars().all()


@app.get("/ads/nearby", response_model=list[BountyNearbyOut])
async def nearby_ads(
    lat: float = Query(...),
    lng: float = Query(...),
    radius_km: float = Query(10.0, gt=0),
):
    lat_delta = radius_km / 111.0
    lng_delta = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))

    async with async_session() as session:
        stmt = select(Bounty).where(
            Bounty.lat.is_not(None),
            Bounty.lng.is_not(None),
            Bounty.lat.between(lat - lat_delta, lat + lat_delta),
            Bounty.lng.between(lng - lng_delta, lng + lng_delta),
        )
        result = await session.execute(stmt)
        candidates = result.scalars().all()

    nearby: list[tuple[float, Bounty]] = []
    for bounty in candidates:
        distance = haversine_km(lat, lng, bounty.lat, bounty.lng)
        if distance <= radius_km:
            nearby.append((distance, bounty))

    nearby.sort(key=lambda pair: pair[0])
    return [
        BountyNearbyOut(**BountyOut.model_validate(bounty).model_dump(), distance_km=round(distance, 3))
        for distance, bounty in nearby
    ]


@app.get("/ads/{bounty_id}", response_model=BountyOut)
async def get_ad(bounty_id: int):
    async with async_session() as session:
        bounty = await session.get(Bounty, bounty_id)
        if bounty is None:
            raise HTTPException(status_code=404, detail="Oglas ne postoji")
        return bounty
