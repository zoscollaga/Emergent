# Golf Scorecard - Product Requirements

## Summary
A polished, high-contrast Expo (React Native) mobile app for golfers to quickly record scores during a round. Optimised for outdoor sunlight readability, huge touch targets, and zero-keyboard score entry.

## Core Features (v1)
- **Auto-detected course**: GPS permission → OpenStreetMap Overpass API returns nearby golf courses sorted by distance; the closest is auto-selected on Home.
- **Change Course**: Searchable, distance-sorted list of nearby courses; falls back to a curated famous-course list if Overpass is unavailable.
- **Round entry**: One-hole-at-a-time view showing par / distance (m) / stroke index and two oversized `+/-` steppers for Score and Putts. Score chip shows `+n / E / -n` relative to par.
- **Navigation**: Previous / Next hole buttons. Previous disabled on hole 1; Next becomes Finish Round on hole 18.
- **Autosave**: Every stepper tap persists the active round to AsyncStorage. Closing the app and reopening resumes the exact hole and values.
- **Finish Round**: Local + best-effort remote save (`POST /api/rounds`), then a Round Summary screen with total score (vs par), total putts, and a colour-coded per-hole table.

## Design
- Palette: white background, dark green (#064E3B) accents, light grey (#F3F4F6) cards, blue (#2563EB) primary CTAs.
- Fonts: Space Grotesk (numerics), Plus Jakarta Sans (text) loaded via fontsource CDN.
- Stack-only navigation via expo-router. No bottom tabs.

## Data Model
- **Course**: `id, name, latitude, longitude, holes[18]` (each hole: `number, par, distance, index`).
- **Round**: `id, date, course_id, course_name, latitude, longitude, holes[{number, score, putts}], total_score, total_putts`.

## Backend (`/app/backend/server.py`)
- `GET /api/` – health.
- `GET /api/courses/nearby?lat&lng&radius` – Overpass API + haversine + curated fallback.
- `GET /api/courses/{id}?name&lat&lng` – returns stored or default hole layout (mix of par 3/4/5s).
- `POST /api/rounds` – validates, computes totals, stores in Mongo.
- `GET /api/rounds` – list, excludes `_id`.

## Frontend Screens
- `app/index.tsx` – Home (hero image + CTA).
- `app/courses.tsx` – Nearby courses (search + list).
- `app/round.tsx` – Hole-by-hole score entry.
- `app/summary.tsx` – Round Summary table.

## Future Roadmap (from problem statement)
Handicap, Stableford, Match Play, Skins, teams, live leaderboard, wearables, stats dashboard (fairways/GIR/sand saves/penalties), shot tracking, PDF export, share scorecard, club tracking, weather, tee selection, dark mode.

## Business Enhancement (built-in)
- Round history persisted locally + remote (`GET /api/rounds`) sets up **free-tier + Pro sync/statistics** as the natural monetisation path once handicap/GIR/fairways stats are added.
