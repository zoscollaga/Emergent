"""Backend tests for Keilor course + Pair Scoring flow."""
import os
import re
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://greens-scorecard.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def s():
    ses = requests.Session()
    ses.headers.update({"Content-Type": "application/json"})
    return ses


# ---------- Keilor course ----------
class TestKeilor:
    def test_course_detail(self, s):
        r = s.get(f"{API}/courses/keilor", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "keilor"
        assert d["name"] == "Keilor Golf Course"
        holes = d["holes"]
        assert len(holes) == 18
        # Spot checks per problem statement
        by_num = {h["number"]: h for h in holes}
        assert by_num[1]["par"] == 4 and by_num[1]["distance"] == 317 and by_num[1]["index"] == 11
        assert by_num[7]["par"] == 4 and by_num[7]["distance"] == 400 and by_num[7]["index"] == 1
        assert by_num[10]["par"] == 4 and by_num[10]["distance"] == 423 and by_num[10]["index"] == 2
        assert by_num[18]["par"] == 4 and by_num[18]["distance"] == 351 and by_num[18]["index"] == 6
        # Par 69 total
        assert sum(h["par"] for h in holes) == 69

    def test_courses_nearby_returns_only_keilor(self, s):
        r = s.get(f"{API}/courses/nearby", params={"lat": -37.7, "lng": 144.83}, timeout=15)
        assert r.status_code == 200
        courses = r.json()["courses"]
        assert len(courses) == 1
        assert courses[0]["id"] == "keilor"
        assert courses[0]["name"] == "Keilor Golf Course"


# ---------- Sessions ----------
class TestSessions:
    def _create(self, s, device_id, member_id="1234"):
        payload = {
            "device_id": device_id,
            "member_id": member_id,
            "course_id": "keilor",
            "course_name": "Keilor Golf Course",
        }
        r = s.post(f"{API}/sessions", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_session_shape(self, s):
        sess = self._create(s, str(uuid.uuid4()))
        assert re.fullmatch(r"\d{6}", sess["join_code"])
        assert re.fullmatch(r"\d{4}", sess["course_short_id"])
        assert len(sess["holes"]) == 18
        assert sess["holes"][0]["par"] == 4
        assert sess["holes"][6]["distance"] == 400  # hole 7
        assert len(sess["players"]) == 1
        assert sess["players"][0]["role"] == "host"

    def test_join_and_third_device_rejected(self, s):
        host_dev = str(uuid.uuid4())
        sess = self._create(s, host_dev, "1111")
        code = sess["join_code"]

        # Guest joins
        guest_dev = str(uuid.uuid4())
        r = s.post(f"{API}/sessions/join/{code}",
                   json={"device_id": guest_dev, "member_id": "2222"}, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert len(d["players"]) == 2
        roles = {p["role"] for p in d["players"]}
        assert roles == {"host", "guest"}

        # Idempotent rejoin
        r2 = s.post(f"{API}/sessions/join/{code}",
                    json={"device_id": guest_dev, "member_id": "2222"}, timeout=15)
        assert r2.status_code == 200
        assert len(r2.json()["players"]) == 2

        # Third device rejected
        r3 = s.post(f"{API}/sessions/join/{code}",
                    json={"device_id": str(uuid.uuid4()), "member_id": "3333"}, timeout=15)
        assert r3.status_code == 409

    def test_join_invalid_code_404(self, s):
        r = s.post(f"{API}/sessions/join/999999",
                   json={"device_id": str(uuid.uuid4()), "member_id": "9999"}, timeout=15)
        assert r.status_code == 404


# ---------- Hole submit / cross-check ----------
class TestHoleSubmit:
    @pytest.fixture(scope="class")
    def paired(self):
        ses = requests.Session()
        ses.headers.update({"Content-Type": "application/json"})
        host_dev = str(uuid.uuid4())
        guest_dev = str(uuid.uuid4())
        r = ses.post(f"{API}/sessions", json={
            "device_id": host_dev, "member_id": "1111",
            "course_id": "keilor", "course_name": "Keilor Golf Course",
        }, timeout=15)
        sess = r.json()
        code = sess["join_code"]
        ses.post(f"{API}/sessions/join/{code}",
                 json={"device_id": guest_dev, "member_id": "2222"}, timeout=15)
        return {"session_id": sess["id"], "host": host_dev, "guest": guest_dev, "s": ses}

    def test_pending_then_verified(self, paired):
        s = paired["s"]
        sid = paired["session_id"]
        # Host submits: player=5, putts=2; marker (guest's score) = 4/1
        r1 = s.post(f"{API}/sessions/{sid}/holes/1/submit", json={
            "device_id": paired["host"],
            "player_score": 5, "player_putts": 2,
            "marker_score": 4, "marker_putts": 1,
        }, timeout=15)
        assert r1.status_code == 200
        assert r1.json()["hole_status"]["1"] == "pending"

        # Guest submits matching cross-check:
        # A(host).player_score(5) == B(guest).marker_score => 5
        # B(guest).player_score(4) == A(host).marker_score(4)
        r2 = s.post(f"{API}/sessions/{sid}/holes/1/submit", json={
            "device_id": paired["guest"],
            "player_score": 4, "player_putts": 1,
            "marker_score": 5, "marker_putts": 2,
        }, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["hole_status"]["1"] == "verified"

    def test_mismatch_then_resubmit_verified(self, paired):
        s = paired["s"]
        sid = paired["session_id"]
        # Host: player=6, marker=4
        s.post(f"{API}/sessions/{sid}/holes/2/submit", json={
            "device_id": paired["host"],
            "player_score": 6, "player_putts": 2,
            "marker_score": 4, "marker_putts": 1,
        }, timeout=15)
        # Guest disagrees on marker score (says host was 5, not 6)
        r = s.post(f"{API}/sessions/{sid}/holes/2/submit", json={
            "device_id": paired["guest"],
            "player_score": 4, "player_putts": 1,
            "marker_score": 5, "marker_putts": 2,
        }, timeout=15)
        assert r.json()["hole_status"]["2"] == "mismatch"

        # Guest re-submits matching
        r2 = s.post(f"{API}/sessions/{sid}/holes/2/submit", json={
            "device_id": paired["guest"],
            "player_score": 4, "player_putts": 1,
            "marker_score": 6, "marker_putts": 2,
        }, timeout=15)
        assert r2.json()["hole_status"]["2"] == "verified"

    def test_mismatch_putts_only(self, paired):
        s = paired["s"]
        sid = paired["session_id"]
        s.post(f"{API}/sessions/{sid}/holes/3/submit", json={
            "device_id": paired["host"],
            "player_score": 5, "player_putts": 2,
            "marker_score": 5, "marker_putts": 2,
        }, timeout=15)
        # Scores match but putts differ
        r = s.post(f"{API}/sessions/{sid}/holes/3/submit", json={
            "device_id": paired["guest"],
            "player_score": 5, "player_putts": 3,  # differs from host's marker_putts=2
            "marker_score": 5, "marker_putts": 2,
        }, timeout=15)
        assert r.json()["hole_status"]["3"] == "mismatch"

    def test_finish_session(self, paired):
        s = paired["s"]
        sid = paired["session_id"]
        r = s.post(f"{API}/sessions/{sid}/finish", timeout=15)
        assert r.status_code == 200
        assert r.json()["finished_at"] is not None
