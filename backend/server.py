from fastapi import FastAPI, APIRouter, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import math
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI(title="Golf Scorecard API")
api_router = APIRouter(prefix="/api")


# ---------- Models ----------
class Hole(BaseModel):
    number: int
    par: int = 4
    distance: int = 350  # metres
    index: int = 1  # stroke index 1-18


class Course(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    distance_km: Optional[float] = None
    holes: List[Hole] = Field(default_factory=list)


class HoleScore(BaseModel):
    number: int
    score: Optional[int] = None
    putts: Optional[int] = None


class Round(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    course_id: str
    course_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    holes: List[HoleScore] = Field(default_factory=list)
    total_score: int = 0
    total_putts: int = 0


class RoundCreate(BaseModel):
    course_id: str
    course_name: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    holes: List[HoleScore]


# ---------- Helpers ----------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# Default 18-hole layout: standard par distribution (4 par 3s, 10 par 4s, 4 par 5s)
DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
DEFAULT_DISTANCES = {3: 165, 4: 370, 5: 495}
# Stroke index by convention pairs difficult holes across nines
DEFAULT_INDEX = [7, 15, 17, 3, 11, 1, 13, 9, 5, 8, 12, 16, 4, 6, 2, 14, 10, 18]


def default_holes() -> List[Hole]:
    return [
        Hole(
            number=i + 1,
            par=DEFAULT_PARS[i],
            distance=DEFAULT_DISTANCES[DEFAULT_PARS[i]],
            index=DEFAULT_INDEX[i],
        )
        for i in range(18)
    ]


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Golf Scorecard API"}


@api_router.get("/courses/nearby")
async def courses_nearby(
    lat: float = Query(...),
    lng: float = Query(...),
    radius: int = Query(30000, description="Search radius in metres"),
):
    """Fetch nearby golf courses using OpenStreetMap Overpass API (free, no key).
    Falls back to a curated list of famous world courses if Overpass is unavailable.
    """
    overpass_query = f"""
    [out:json][timeout:15];
    (
      node["leisure"="golf_course"](around:{radius},{lat},{lng});
      way["leisure"="golf_course"](around:{radius},{lat},{lng});
      relation["leisure"="golf_course"](around:{radius},{lat},{lng});
    );
    out center tags;
    """
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    ]
    results: List[dict] = []
    for url in endpoints:
        try:
            async with httpx.AsyncClient(timeout=20.0) as hc:
                resp = await hc.post(url, data={"data": overpass_query})
            if resp.status_code == 200:
                data = resp.json()
                for el in data.get("elements", []):
                    tags = el.get("tags", {}) or {}
                    name = tags.get("name")
                    if not name:
                        continue
                    if el.get("type") == "node":
                        clat, clon = el.get("lat"), el.get("lon")
                    else:
                        c = el.get("center") or {}
                        clat, clon = c.get("lat"), c.get("lon")
                    if clat is None or clon is None:
                        continue
                    results.append(
                        {
                            "id": f"osm-{el.get('type')}-{el.get('id')}",
                            "name": name,
                            "latitude": clat,
                            "longitude": clon,
                            "distance_km": round(haversine_km(lat, lng, clat, clon), 2),
                        }
                    )
                break
        except Exception as e:
            logger.warning(f"Overpass endpoint {url} failed: {e}")
            continue

    if not results:
        # Fallback: curated famous courses so the app is usable anywhere
        for c in FAMOUS_COURSES:
            results.append(
                {
                    "id": c["id"],
                    "name": c["name"],
                    "latitude": c["latitude"],
                    "longitude": c["longitude"],
                    "distance_km": round(
                        haversine_km(lat, lng, c["latitude"], c["longitude"]), 2
                    ),
                }
            )

    # Deduplicate by name, keep closest
    seen: dict = {}
    for r in results:
        key = r["name"].lower()
        if key not in seen or r["distance_km"] < seen[key]["distance_km"]:
            seen[key] = r
    unique = sorted(seen.values(), key=lambda x: x["distance_km"])[:40]
    return {"courses": unique}


@api_router.get("/courses/{course_id}")
async def course_detail(course_id: str, name: Optional[str] = None,
                        lat: Optional[float] = None, lng: Optional[float] = None):
    """Return course hole layout. If we have it stored, return it. Otherwise generate defaults."""
    stored = await db.courses.find_one({"id": course_id}, {"_id": 0})
    if stored:
        return stored
    course = {
        "id": course_id,
        "name": name or "Unknown Course",
        "latitude": lat or 0.0,
        "longitude": lng or 0.0,
        "holes": [h.model_dump() for h in default_holes()],
    }
    return course


@api_router.post("/rounds")
async def create_round(payload: RoundCreate):
    total_score = sum((h.score or 0) for h in payload.holes)
    total_putts = sum((h.putts or 0) for h in payload.holes)
    r = Round(
        course_id=payload.course_id,
        course_name=payload.course_name,
        latitude=payload.latitude,
        longitude=payload.longitude,
        holes=payload.holes,
        total_score=total_score,
        total_putts=total_putts,
    )
    doc = r.model_dump()
    # Store datetime as ISO string for portability
    doc["date"] = r.date.isoformat()
    await db.rounds.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/rounds")
async def list_rounds():
    docs = await db.rounds.find({}, {"_id": 0}).sort("date", -1).to_list(200)
    return {"rounds": docs}


# ---------- Fallback famous courses ----------
FAMOUS_COURSES = [
    {"id": "famous-royal-melbourne-west", "name": "Royal Melbourne (West)", "latitude": -37.9739, "longitude": 145.0349},
    {"id": "famous-royal-melbourne-east", "name": "Royal Melbourne (East)", "latitude": -37.9720, "longitude": 145.0330},
    {"id": "famous-kingston-heath", "name": "Kingston Heath", "latitude": -37.9847, "longitude": 145.0819},
    {"id": "famous-victoria-golf", "name": "Victoria Golf Club", "latitude": -37.9797, "longitude": 145.0470},
    {"id": "famous-metropolitan", "name": "Metropolitan Golf Club", "latitude": -37.9614, "longitude": 145.0722},
    {"id": "famous-st-andrews", "name": "St Andrews Old Course", "latitude": 56.3436, "longitude": -2.8034},
    {"id": "famous-augusta", "name": "Augusta National", "latitude": 33.5030, "longitude": -82.0199},
    {"id": "famous-pebble-beach", "name": "Pebble Beach", "latitude": 36.5674, "longitude": -121.9497},
    {"id": "famous-pinehurst-no2", "name": "Pinehurst No. 2", "latitude": 35.1912, "longitude": -79.4675},
    {"id": "famous-cypress-point", "name": "Cypress Point", "latitude": 36.5793, "longitude": -121.9636},
]


# ---------- App wiring ----------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
