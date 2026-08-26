# Golf Scorecard — Product Document

**Version:** 2.0
**Last updated:** August 2026
**Owner:** Riverbend Golf (private club, ~35 members)
**Status:** In active development (preview) — targeting first production deploy

---

## 1. Executive Summary

Golf Scorecard is a **cross-platform mobile app (iOS + Android via Expo)** that lets club golfers record their round score hole-by-hole from the tee-box, with **large outdoor-friendly buttons**, **offline resilience**, and **live cross-device verification** for pair rounds. All data flows into a single **Google Sheet** so the club captain retains full control of the roster, courses, and scorecards without needing to log into a separate admin panel.

The app is optimised for **speed and glanceability during play** — most interactions are ±1 tap on a stepper, no keyboard, no menus mid-round.

---

## 2. Vision & Goals

| Goal | Why it matters |
|---|---|
| **Fastest possible in-round scoring** | Golfers hate holding up play to fiddle with an app. Every screen should be usable one-handed while walking. |
| **Verified scorecards without paper** | The club needs a signed/marker-verified record for handicap purposes. Two-device sync replaces the pencilled marker card. |
| **Zero admin overhead** | Members and scorecards live in a Google Sheet the captain already knows how to edit. No new admin UI to maintain. |
| **Live leaderboard** | Members playing simultaneous rounds can see standings update as everyone finishes each hole. |
| **Works when the phone signal doesn't** | A round takes 4 hours; the app must survive dead spots on the course. |

---

## 3. Scope

### In Scope (this version)
- Solo and pair (2-ball better ball, aka 2BBB) scorecarding for **18-hole rounds**.
- **Dynamic course loading** from a shared Google Sheet — no code changes to add a new course.
- **Member roster** (self-signup with OTP email verification, admin approval).
- **Live leaderboard** — individual and 2BBB team modes, per-day and per-course.
- **Player profile** with round history (cloud sync + local cache) and cross-course stats.
- **Local persistence** for offline play (rounds resume when the app is reopened).
- Google Sheets as the sole persistent datastore for members, scorecards, courses.
- FastAPI + MongoDB backend used **only** for short-lived pair-session state (join codes, real-time hole reconciliation between two devices).

### Out of Scope (v2.x)
- GPS distance-to-pin / rangefinder.
- Tee-time booking or club calendar.
- Multi-club (single-tenant per install; each club has its own deploy + sheet).
- Real-money side games / betting reconciliation.
- Long-term encrypted PII storage — PII lives only on the club's own Google Sheet.

### Deferred (roadmap — see §11)
- Stableford scoring, PDF export, statistics dashboard, dark mode, Apple Watch / Wear OS companion, real handicap engine.

---

## 4. Users & Personas

### Persona 1 — "The Weekend Golfer" (primary — ~80 % of users)
- Plays 1–3 rounds a week, typically Sat/Sun morning.
- Uses an iPhone. Older iOS versions common (13–17).
- Wants: enter score fast, see if they beat their PB, share the round.
- Frustrations: paper cards, apps that require login every time, tiny buttons.

### Persona 2 — "The Serious Player" (~15 %)
- Plays 4+ rounds/week, tracks handicap trends.
- Wants: stats, net vs gross, best/worst, favourite course, sortable leaderboard.
- Uses profile + leaderboard heavily.

### Persona 3 — "The Club Captain / Admin" (~1 person)
- Doesn't play with the app; **manages the data** via Google Sheets directly.
- Wants: full visibility, ability to edit anything, no separate admin UI to learn.
- Approves new member signups via email link.

---

## 5. What The App Does — Feature Outline

### 5.1 Home
- Hero image + today's selected course.
- Player chip (Choose your name / signed-in player).
- Course chip (tap to change; **locked** while a round is in progress).
- **Resume 2BBB round** banner when a pair session is active (shows join code).
- Four primary CTAs (bottom, thumb-friendly): Start Round · Solo · Play With a Marker · Live Leaderboard · Sign in as Player.
- Settings gear (top-right) for webhook override.

### 5.2 Course Selection
- Reads all active courses from the Google Sheet `Courses` tab via the Apps Script webhook.
- Search-filter as you type.
- Sorted; each row shows name + 18-hole par total.
- **Add New Course** — an in-app form for par/distance/index per hole; writes back to the sheet with a unique 5-digit Course ID and emails the admin.
- Picker **locked** if a solo or pair round is in progress.

### 5.3 Solo Round
- Per-hole screen: hole # / 18, par, distance, stroke index.
- Two big steppers: **Score** (defaults to par on first open) and **Putts** (defaults to 2).
- Previous / Next Hole. Finish button on hole 18.
- **Live leaderboard sync** — after every hole, the current card is pushed to the sheet with a unique Scorecard ID (`SCyyyyMMDDNNN`).
- Round persists locally until finished; app can be closed and reopened without losing state.

### 5.4 Pair Round (2BBB)
- Two devices join via a **6-digit join code**.
- Each device shows two rows on every hole: **Player** (own scores) + **Marker** (partner's scores, as observed by this device).
- Both submit → server compares:
  - `A.player_score == B.marker_score`
  - `A.player_putts == B.marker_putts`
- Three states: **pending / verified / mismatch**. Next Hole enabled only when verified.
- Each device broadcasts the partner's verified card to the sheet after each hole.
- **Rejoin code visible** in the header — accidental app-close is recoverable.
- Backend supports idempotent rejoin (same `device_id` returns without error).
- Deterministic pair Scorecard ID: `SC<yyyyMMdd>-2B-<sessionHash>-<partnerMemberId>` — guarantees no cross-device collision.

### 5.5 Summary Screens
- **Solo Summary** — total gross, net (gross − handicap), putts, hole-by-hole table, per-hole colour chips (birdie/par/bogey), one-tap "END ROUND & EXPORT" to sheet.
- **Pair Summary** — two cards (You / Marker) with totals, hole-by-hole table, "SUBMIT MARKER'S CARD" (guards against sending until partner's real name is loaded).

### 5.6 Live Leaderboard
- Reads today's date-tab from the sheet every 15 s (+ pull-to-refresh).
- **Individual mode** — one row per player, sortable by HCP / Gross / Net / Putts.
- **2BBB mode** — teams grouped by:
  1. Shared `-2B-<sessionHash>-<memberId>` suffix (primary).
  2. Legacy `-2B` on same course/date (fallback).
  3. Mutual `marker_id` relationship (legacy fallback).
- Filter by course; date navigation (prev/next/today).
- Rank pills (gold/silver/bronze) + vs-par colour chips.

### 5.7 Player Profile
- Signed-in player's chip (name, member ID, handicap, status).
- **Stats card** — total rounds, avg gross (best/worst), avg putts, rounds this month, favourite course.
- **Filter chips** — All / Solo / 2BBB.
- **Rounds list** — newest first, tap to open the full hole-by-hole summary.
- **Cloud sync** — fetches every scorecard for this member across every date-tab in one request (`?action=history&member_id=X`).
- **Offline badge** on any round cached locally but not yet uploaded.
- Pull-to-refresh.

### 5.8 Member Sign-up & Identification
- **Identify** screen — privacy-first autocomplete; type ≥ 2 chars to filter (never shows full roster).
- **Sign-up** — collects first/last name, email, mobile, handicap → sends 6-digit OTP via email → verifies → creates a `Pending Approval` row in the sheet.
- Admin receives an email with **Approve / Reject** signed-URL buttons.
- 404 fallback — if the webhook is stale/wrong, the app surfaces a helpful "Reconnect in Settings" prompt instead of crashing.

### 5.9 Settings
- Single screen. Contains:
  - Webhook URL (defaulted from `EXPO_PUBLIC_WEBHOOK_URL`, overridable per device).
  - Test button — pings the URL and confirms member data comes back.

---

## 6. Design Specification

### 6.1 Design Principles
1. **Outdoor first** — high contrast, no light-grey type, minimum 44 pt touch targets. Sunny screens must be readable.
2. **One-handed** — primary actions in the bottom third of the screen, reachable by the thumb.
3. **Glanceable** — a golfer looking at the phone for < 3 seconds should get the info they need (hole, par, score-to-par).
4. **No keyboards mid-round** — every input during a round is a stepper (± button).
5. **Progressive disclosure** — stats/history/admin actions live in their own screens; the round-scoring flow shows only what matters right now.

### 6.2 Visual System
- **Palette** — brand green (#0F5D3A) + brand green primary CTA (#3B71F6 blue) + surfaces (near-white) + rank-medal accents (gold/silver/bronze) + score chips (birdie yellow / par grey / bogey red).
- **Typography** — a display face (bold, large numerals) for the hole number and totals, a text face for everything else. Weights: text, textBold, display.
- **Spacing** — 8 pt grid (`xs=4, sm=8, md=12, lg=16, xl=20, xxl=32, xxxl=40`).
- **Radius** — `md=10, lg=16, pill=999` (buttons and chips are pills).
- **Shadows** — none; the app uses flat cards and subtle borders instead (avoids performance cost on scroll).

### 6.3 Information Architecture
```
Home  ─┬─  Solo Round  ─→  Solo Summary  ─→  Home
       ├─  Pair Setup  ─→  Pair Round  ─→  Pair Summary  ─→  Home
       ├─  Courses  ─┬─  Add Course
       │             └─  (returns to Home w/ selection)
       ├─  Live Leaderboard  (Individual | 2BBB tabs)
       ├─  Profile  ─→  Round Summary (any historical round)
       ├─  Identify / Sign up  ─→  Verify (OTP)
       └─  Settings
```

### 6.4 Interaction Patterns
- **Steppers** — big ± buttons flanking the current value; long-press not supported (avoids accidental leaps).
- **Chips** — pill-shaped, tappable status pills for player, course, filters.
- **Segmented control** — for Individual/2BBB leaderboard toggle.
- **Pull-to-refresh** — leaderboard, profile.
- **Live indicators** — a red "LIVE" pulse when viewing today's leaderboard.

### 6.5 Handled Edge Cases
- Notch / dynamic island (safe-area insets everywhere).
- Locked-course state during a round (visual + copy).
- Webhook missing / misconfigured (banner with Settings deep-link).
- Slow / failed sheet POSTs (retry on next hole; no user-facing error unless the final export fails).
- Two devices with fresh AsyncStorage on same day (deterministic scorecard IDs — no collisions).

---

## 7. Functional Specification (endpoint-level)

### 7.1 FastAPI backend (`/api/*`)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/courses/nearby` | Stub returning Keilor as fallback |
| GET | `/api/courses/{id}` | Course detail (rarely used; sheets is source of truth) |
| POST | `/api/rounds` | Save a completed solo round (best-effort persistence) |
| GET | `/api/rounds` | List recent rounds (Mongo — dev only, not surfaced in UI) |
| POST | `/api/sessions` | Create pair session — returns `{id, join_code}` |
| POST | `/api/sessions/join/{code}` | Join by 6-digit code (idempotent by device_id) |
| GET | `/api/sessions/{id}` | Read session (players, hole entries, computed hole_status) |
| POST | `/api/sessions/{id}/holes/{n}/submit` | Upsert this device's hole entry |
| POST | `/api/sessions/{id}/finish` | Mark session finished |

### 7.2 Google Apps Script webhook (single URL for everything)
| HTTP | Query / body | Purpose |
|---|---|---|
| GET | (no action) | Members roster |
| GET | `?action=leaderboard&date=YYYY-MM-DD` | All scorecards for that date-tab |
| GET | `?action=history&member_id=X` | Every scorecard for that member across every date-tab |
| GET | `?action=courses` | Active courses |
| GET | `?action=approve/reject&mid=&token=` | Admin approves/rejects a signup |
| GET | `?action=ping` | Health check (returns `pong-v2`) |
| POST | `{action:"signup_start", ...}` | Send OTP email |
| POST | `{action:"signup_verify", ...}` | Verify OTP → create pending member |
| POST | `{action:"add_course", ...}` | Insert a new course row |
| POST | `{csv, filename, meta}` | Upsert a scorecard into the date-tab named by `filename` |

---

## 8. Data Model

### 8.1 Google Sheets (source of truth)
- **`Members` tab:** Member ID · First · Last · Handicap · Status · Mobile · Email.
- **`Courses` tab:** Course ID · Name · Lat · Lng · H1 Par · H1 Distance · H1 Index · … × 18 · Status · Added By · Added At.
- **`YYYY-MM-DD` tabs (one per date):** Scorecard ID · Player Name · Member ID · Marker ID · Date · Course · Gross · Handicap · Net · Total Putts · H1 Score · H1 Putts · … × 18.

### 8.2 MongoDB (ephemeral pair-session state)
- **`sessions`** collection: `id` (UUID), `join_code` (6 digits), `course_id`, `course_name`, `holes` (18 × par/distance/index), `players` (device_id, member_id, role), `hole_entries` (per device, per hole submissions), `started_at`, `finished_at`.

### 8.3 AsyncStorage (device-local)
- `gs.selectedCourse`, `gs.activeRound`, `gs.roundHistory`, `gs.exportedRounds`.
- `gs.deviceId`, `gs.memberId`, `gs.identifiedMember`.
- `gs.activeSession` (pair session id).
- `gs.cloudRoundHistory` (cached cloud rounds for offline profile viewing).
- `gs.sheetsWebhook`, `gs.membersWebhook` (per-device webhook overrides).
- `scId::<sessionId>::<memberId>` — cached deterministic pair scorecard IDs.

---

## 9. Technical Architecture

```
┌────────────────────────────────────┐
│   iOS / Android (Expo Go / build)  │
│      React Native + Expo Router    │
│      State: AsyncStorage           │
└────────────┬───────────────────────┘
             │
             ├── /api/* ────────► FastAPI  ──► MongoDB
             │                    (pair-session sync only)
             │
             └── webhook  ──────► Google Apps Script  ──► Google Sheet
                                    (members, scorecards, courses,
                                     leaderboard, history, signup, OTP)
```

- **Frontend:** Expo SDK (React Native), Expo Router file-based routing, React Native Reanimated, expo-image, expo-haptics.
- **Backend:** FastAPI + Motor + Pydantic + python-dotenv. Deployed alongside the frontend on Emergent's Kubernetes container.
- **Datastore split:** Sheet = long-lived, admin-editable data. MongoDB = short-lived pair-round state that needs a real-time cross-device write path.

---

## 10. Non-functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | Every screen paints under 300 ms after JS ready. Steppers respond within one frame. |
| **Offline** | Solo rounds are fully playable offline; final export is queued and retried when the network returns. |
| **Sync latency** | Pair-mode hole reconciliation ≤ 3 s (2 s polling + 1 s tolerance). |
| **Reliability** | Live leaderboard tolerates transient webhook failures without wiping the visible list. |
| **Security** | See §12. |
| **Compatibility** | iOS 13+, Android 7+ (Expo SDK default matrix). |
| **Accessibility** | Minimum 44 pt touch targets; body text ≥ 13 pt; colour is never the sole information carrier (chips also carry text). |

---

## 11. Roadmap

### Next (P1)
- **Stableford scoring** — toggle at round start; live points per hole using handicap × stroke index.
- **PDF export & share** — one-tap generation of a printable scorecard from the summary screen.

### Then (P2)
- **Statistics dashboard** — fairways hit, GIR, sand saves, penalties, driving distance (requires extra per-hole inputs; opt-in per round).
- **Dark mode** — full palette variant, respects `useColorScheme`.
- **Real handicap engine** — WHS-compliant playing handicap calculation.

### Later (P3)
- **Apple Watch / Wear OS companion** — tap Score/Putts from the wrist.
- **Multi-club support** — one binary, per-club sheet + branding.
- **Push notifications** — round-invite links, admin-approval alerts.

---

## 12. Security & Privacy (current posture)

- **PII lives on the club's Google Sheet** (email, mobile). No PII stored server-side or logged.
- **AsyncStorage** holds the identified member's non-sensitive info (name, member id, handicap, status). Mobile number is stored but slated for removal in a hardening pass.
- **OTP-based signup** — 6-digit code, 15-minute TTL, one-shot. Admin approval via signed-token URL.
- **Known findings** (see security audit `2026-08-24`):
  - **HIGH** — the webhook is public; drop `email`/`mobile` from the members list response.
  - **MEDIUM** — need per-email rate limit on OTP send.
  - **MEDIUM** — identity is currently self-asserted; a code-based sign-in for existing members would close this gap.
  - **MEDIUM** — CSV formula-injection guard on names/course names (client-side fix pending).

---

## 13. Deployment

- **Preview / dev**: Emergent container, Metro bundler, backend at `0.0.0.0:8001`, all routes prefixed `/api`.
- **Production**: same container spec; deployed via the Emergent Publish button.
- **iOS / Android builds**: generated on-demand after publish. Two open items before store submission:
  - Public **privacy policy URL**.
  - **In-app account deletion** flow.

---

## Appendix A — Frontend Screen Map (Expo Router)

| Route | File | Description |
|---|---|---|
| `/` | `app/index.tsx` | Home |
| `/round` | `app/round.tsx` | Solo scoring |
| `/summary` | `app/summary.tsx` | Round summary (solo + cloud round detail) |
| `/pair` | `app/pair.tsx` | Pair setup (host / join) |
| `/pair-round` | `app/pair-round.tsx` | Pair scoring |
| `/pair-summary` | `app/pair-summary.tsx` | Pair summary + export |
| `/courses` | `app/courses.tsx` | Course picker |
| `/add-course` | `app/add-course.tsx` | Add a new course |
| `/leaderboard` | `app/leaderboard.tsx` | Live leaderboard |
| `/profile` | `app/profile.tsx` | Player profile |
| `/identify` | `app/identify.tsx` | Sign in as a player |
| `/signup` | `app/signup.tsx` | New member sign-up |
| `/verify-signup` | `app/verify-signup.tsx` | OTP verification |
| `/settings` | `app/settings.tsx` | Webhook override + test |

## Appendix B — Reusable libraries (`src/lib/`)
- `storage.ts` — AsyncStorage wrapper + scorecard-id allocation.
- `api.ts` — Typed FastAPI client (pair sessions + solo saves).
- `sheets.ts` — CSV builder + Apps Script POST helper.
- `members.ts` — Members fetch, signup, verify.
- `courses.ts` — Courses fetch, add.
- `leaderboard.ts` — Leaderboard fetch + row normaliser.
- `history.ts` — Cloud round history fetch, cache, merge, stats.
- `pair-id.ts` — Deterministic pair scorecard id builder + parser.
