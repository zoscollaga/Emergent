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


# ---------- Pair session models ----------
class SessionPlayer(BaseModel):
    device_id: str
    member_id: str  # 4-digit member id
    role: str  # "host" | "guest"
    joined_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class HoleEntry(BaseModel):
    hole_number: int
    device_id: str
    player_score: Optional[int] = None
    player_putts: Optional[int] = None
    marker_score: Optional[int] = None
    marker_putts: Optional[int] = None
    submitted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PairSession(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    join_code: str
    course_id: str
    course_short_id: str
    course_name: str
    holes: List[Hole]
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    players: List[SessionPlayer] = Field(default_factory=list)
    hole_entries: List[HoleEntry] = Field(default_factory=list)
    finished_at: Optional[datetime] = None


class CreateSessionPayload(BaseModel):
    device_id: str
    member_id: str
    course_id: str
    course_name: str
    course_short_id: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    holes: Optional[List[Hole]] = None


class JoinSessionPayload(BaseModel):
    device_id: str
    member_id: str


class SubmitHolePayload(BaseModel):
    device_id: str
    player_score: Optional[int] = None
    player_putts: Optional[int] = None
    marker_score: Optional[int] = None
    marker_putts: Optional[int] = None


# ---------- Helpers ----------
def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


# Keilor Golf Course — the only course for now (real course/member IDs come later)
KEILOR_HOLES = [
    {"number": 1,  "par": 4, "distance": 317, "index": 11},
    {"number": 2,  "par": 3, "distance": 136, "index": 18},
    {"number": 3,  "par": 5, "distance": 475, "index": 9},
    {"number": 4,  "par": 4, "distance": 357, "index": 5},
    {"number": 5,  "par": 4, "distance": 324, "index": 13},
    {"number": 6,  "par": 3, "distance": 135, "index": 15},
    {"number": 7,  "par": 4, "distance": 400, "index": 1},
    {"number": 8,  "par": 4, "distance": 391, "index": 3},
    {"number": 9,  "par": 4, "distance": 376, "index": 7},
    {"number": 10, "par": 4, "distance": 423, "index": 2},
    {"number": 11, "par": 3, "distance": 179, "index": 8},
    {"number": 12, "par": 4, "distance": 368, "index": 4},
    {"number": 13, "par": 3, "distance": 177, "index": 10},
    {"number": 14, "par": 3, "distance": 164, "index": 12},
    {"number": 15, "par": 5, "distance": 453, "index": 14},
    {"number": 16, "par": 4, "distance": 329, "index": 16},
    {"number": 17, "par": 4, "distance": 325, "index": 17},
    {"number": 18, "par": 4, "distance": 351, "index": 6},
]

KEILOR_COURSE = {
    "id": "keilor",
    "name": "Keilor Golf Course",
    "latitude": -37.7301,
    "longitude": 144.8300,
    "holes": KEILOR_HOLES,
}


def default_holes() -> List[Hole]:
    return [Hole(**h) for h in KEILOR_HOLES]


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Golf Scorecard API"}


@api_router.get("/courses/nearby")
async def courses_nearby(
    lat: float = Query(0.0),
    lng: float = Query(0.0),
    radius: int = Query(30000),
):
    """Only one course for now: Keilor Golf Course."""
    return {
        "courses": [
            {
                "id": KEILOR_COURSE["id"],
                "name": KEILOR_COURSE["name"],
                "latitude": KEILOR_COURSE["latitude"],
                "longitude": KEILOR_COURSE["longitude"],
                "distance_km": round(
                    haversine_km(lat, lng, KEILOR_COURSE["latitude"], KEILOR_COURSE["longitude"]),
                    2,
                ) if lat or lng else 0.0,
            }
        ]
    }


@api_router.get("/courses/{course_id}")
async def course_detail(course_id: str, name: Optional[str] = None,
                        lat: Optional[float] = None, lng: Optional[float] = None):
    """Only Keilor for now."""
    return {
        "id": KEILOR_COURSE["id"],
        "name": KEILOR_COURSE["name"],
        "latitude": KEILOR_COURSE["latitude"],
        "longitude": KEILOR_COURSE["longitude"],
        "holes": KEILOR_HOLES,
    }


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


# ---------- Pair session helpers & routes ----------
import random as _random


def _gen_join_code() -> str:
    return f"{_random.randint(0, 999999):06d}"


def _short_id(seed: str) -> str:
    """Deterministic 4-digit id derived from any string, so a given course/member
    always maps to the same 4-digit id within this device's lifetime.
    Real IDs will be plugged in later — for now this is stable enough."""
    h = 0
    for ch in seed:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return f"{h % 10000:04d}"


def _verify_hole(entries: List[dict]) -> str:
    """Return 'pending' (only 1 entry), 'verified' (2 entries, cross-check passes),
    or 'mismatch' (2 entries, values disagree)."""
    if len(entries) < 2:
        return "pending"
    a, b = entries[0], entries[1]
    fields = [
        (a.get("player_score"), b.get("marker_score")),
        (b.get("player_score"), a.get("marker_score")),
        (a.get("player_putts"), b.get("marker_putts")),
        (b.get("player_putts"), a.get("marker_putts")),
    ]
    for x, y in fields:
        if x is None or y is None:
            return "pending"
        if x != y:
            return "mismatch"
    return "verified"


def _session_public(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    # Compute per-hole status map
    by_hole: dict[int, list[dict]] = {}
    for e in doc.get("hole_entries", []):
        by_hole.setdefault(e["hole_number"], []).append(e)
    doc["hole_status"] = {
        str(n): _verify_hole(v) for n, v in by_hole.items()
    }
    return doc


@api_router.post("/sessions")
async def create_session(payload: CreateSessionPayload):
    holes = [h.model_dump() for h in (payload.holes or default_holes())]
    short = payload.course_short_id or _short_id(payload.course_id)
    session = {
        "id": str(uuid.uuid4()),
        "join_code": _gen_join_code(),
        "course_id": payload.course_id,
        "course_short_id": short,
        "course_name": payload.course_name,
        "holes": holes,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "players": [
            {
                "device_id": payload.device_id,
                "member_id": payload.member_id,
                "role": "host",
                "joined_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        "hole_entries": [],
        "finished_at": None,
    }
    await db.sessions.insert_one(session)
    return _session_public(session)


@api_router.post("/sessions/join/{join_code}")
async def join_session(join_code: str, payload: JoinSessionPayload):
    session = await db.sessions.find_one({"join_code": join_code, "finished_at": None})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    players = session.get("players", [])
    # Idempotent rejoin
    if not any(p["device_id"] == payload.device_id for p in players):
        if len(players) >= 2:
            raise HTTPException(status_code=409, detail="Session is full")
        players.append(
            {
                "device_id": payload.device_id,
                "member_id": payload.member_id,
                "role": "guest",
                "joined_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        await db.sessions.update_one(
            {"id": session["id"]}, {"$set": {"players": players}}
        )
        session["players"] = players
    return _session_public(session)


@api_router.get("/sessions/{session_id}")
async def get_session(session_id: str):
    session = await db.sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _session_public(session)


@api_router.post("/sessions/{session_id}/holes/{hole_number}/submit")
async def submit_hole(session_id: str, hole_number: int, payload: SubmitHolePayload):
    session = await db.sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    entries = [
        e for e in session.get("hole_entries", [])
        if not (e["hole_number"] == hole_number and e["device_id"] == payload.device_id)
    ]
    entries.append(
        {
            "hole_number": hole_number,
            "device_id": payload.device_id,
            "player_score": payload.player_score,
            "player_putts": payload.player_putts,
            "marker_score": payload.marker_score,
            "marker_putts": payload.marker_putts,
            "submitted_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await db.sessions.update_one(
        {"id": session_id}, {"$set": {"hole_entries": entries}}
    )
    session["hole_entries"] = entries
    return _session_public(session)


@api_router.post("/sessions/{session_id}/finish")
async def finish_session(session_id: str):
    session = await db.sessions.find_one({"id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.sessions.update_one(
        {"id": session_id},
        {"$set": {"finished_at": datetime.now(timezone.utc).isoformat()}},
    )
    session["finished_at"] = datetime.now(timezone.utc).isoformat()
    return _session_public(session)


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
