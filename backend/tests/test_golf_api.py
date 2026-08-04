"""Backend tests for Golf Scorecard API."""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://greens-scorecard.preview.emergentagent.com").rstrip("/")


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Root ----------
def test_root(api_client):
    r = api_client.get(f"{BASE_URL}/api/", timeout=30)
    assert r.status_code == 200
    assert "message" in r.json()


# ---------- Nearby ----------
def test_nearby_courses_sorted(api_client):
    r = api_client.get(f"{BASE_URL}/api/courses/nearby?lat=-37.9739&lng=145.0349", timeout=60)
    assert r.status_code == 200
    data = r.json()
    courses = data.get("courses", [])
    assert len(courses) > 0
    for c in courses:
        assert "id" in c and "name" in c
        assert "latitude" in c and "longitude" in c
        assert "distance_km" in c
    dists = [c["distance_km"] for c in courses]
    assert dists == sorted(dists), "Not sorted by distance"


# ---------- Course detail ----------
def test_course_detail_default_18(api_client):
    r = api_client.get(f"{BASE_URL}/api/courses/famous-royal-melbourne-west?name=Royal%20Melbourne&lat=-37.97&lng=145.03", timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d["id"] == "famous-royal-melbourne-west"
    assert d["name"]
    holes = d["holes"]
    assert len(holes) == 18
    for i, h in enumerate(holes, start=1):
        assert h["number"] == i
        assert h["par"] in (3, 4, 5)
        assert h["distance"] > 0
        assert 1 <= h["index"] <= 18


# ---------- Rounds ----------
def test_create_round_and_list(api_client):
    holes = [{"number": i, "score": 4, "putts": 2} for i in range(1, 19)]
    payload = {
        "course_id": "TEST_course_1",
        "course_name": "TEST_Course",
        "latitude": -37.97,
        "longitude": 145.03,
        "holes": holes,
    }
    r = api_client.post(f"{BASE_URL}/api/rounds", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["total_score"] == 4 * 18
    assert d["total_putts"] == 2 * 18
    assert d["course_name"] == "TEST_Course"
    assert "_id" not in d
    assert "id" in d

    lr = api_client.get(f"{BASE_URL}/api/rounds", timeout=30)
    assert lr.status_code == 200
    body = lr.json()
    assert "rounds" in body
    for rec in body["rounds"]:
        assert "_id" not in rec
    # our created round should be present
    ids = [rec.get("id") for rec in body["rounds"]]
    assert d["id"] in ids
