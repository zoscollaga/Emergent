# Golf Scorecard - Product Requirements

## Summary
A polished, high-contrast Expo (React Native) mobile app for golfers to quickly record scores during a round at **Keilor Golf Course** (the only course for now). Supports solo scoring and **peer-verified pair scoring** across two devices, with Google Sheets export.

## Course (v1.2)
- **Keilor Golf Course** — 18 holes, Par 69, hardcoded on backend (`/api/courses/keilor`) with the exact par/distance/strokeIndex the user provided.
- Nearby-course search is retained as a stub returning only Keilor for now. Real course IDs and additional courses will be plugged in later.

## Solo Mode
- Home → START ROUND · SOLO → hole-by-hole entry (Score + Putts steppers) → Summary → END ROUND & EXPORT (one row per round to Google Sheets).

## Pair Scoring Mode (v1.2)
1. Home → **PLAY WITH A MARKER** → Pair Setup.
2. Each device gets an auto-generated **4-digit Member ID** (random for now, persisted via AsyncStorage; real member IDs later).
3. Player creates a round → gets a **6-digit join code** → Marker joins with the code. Backend polls every 2s until both are linked; then both auto-navigate to the Pair Round screen.
4. Pair Round screen (per hole): PLAYER row (your own Score/Putts) and MARKER row (partner's Score/Putts you observed). Both devices submit; server cross-checks:
   - `A.player_score == B.marker_score` AND `B.player_score == A.marker_score`
   - `A.player_putts == B.marker_putts` AND `B.player_putts == A.marker_putts`
5. States: **pending** (waiting for the other), **verified** (rows green, Next Hole enabled on both), **mismatch** (rows RED, banner "Scores don't match", Next Hole hidden — must re-submit matching values).
6. Hole 18 verified → Finish Round → Pair Summary.
7. Each device submits its MARKER's card (verified partner data) to Google Sheets. Filename / tab name: **`MEMBER-YYYYMMDDHHMM-COURSE`** (e.g. `2314-202608041500-1423`) in local time.

## Google Sheets Export
- Target: a spreadsheet called **Scorecards**.
- Container-bound Apps Script creates one **tab per date** (YYYY-MM-DD, local) with rows upserted by Member ID (col C). The script assigns a **Scorecard ID** (`SC-YYYYMMDD-NNN`) on first insert and echoes it back to the app.
- POSTed as `text/plain` JSON (`{csv, filename, meta}`) to skip Apps Script CORS preflight.
- CSV column order (both solo + pair modes): `Scorecard ID, Player Name, Member ID, Date, Course, Gross Score, Handicap, Total Putts, H1 Score, H1 Putts, … H18 Score, H18 Putts`.

## Scoring UX (v1.3)
- On first open of a hole, Score defaults to the hole's **Par** and Putts defaults to **2**. Values already entered on prior visits are preserved.
- **Next Hole / Finish Round is disabled** until both Score and Putts have a value (auto-defaults satisfy this by design).

## Backend
- `GET /api/courses/keilor` and `/api/courses/nearby` — Keilor only.
- `POST /api/sessions` — creates a paired session with random 6-digit join code and deterministic 4-digit course id.
- `POST /api/sessions/join/{code}` — second device joins (3rd is 409, idempotent rejoin).
- `GET /api/sessions/{id}` — returns players + hole_entries + computed `hole_status`.
- `POST /api/sessions/{id}/holes/{n}/submit` — upserts an entry for that device.
- `POST /api/sessions/{id}/finish` — sets finished_at.
- Solo endpoints (`/api/rounds`) unchanged.

## Frontend Screens
- `app/index.tsx` — Home (Keilor + Solo/Pair CTAs).
- `app/round.tsx` / `app/summary.tsx` — Solo flow (v1.0).
- `app/pair.tsx` — Member ID + Create/Join.
- `app/pair-round.tsx` — Peer-verified hole entry with mismatch guard.
- `app/pair-summary.tsx` — Marker's card preview + export.

## Future Roadmap
Real Member/Course IDs (from a directory), handicap, Stableford, multi-group leaderboards, wearables, stats dashboard, PDF export, dark mode.
