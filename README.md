# AFL Ladder Game

A desktop tipping & ladder-prediction game for AFL fans. Players predict round results each week, watch the ladder update in real time, and compete against friends on a private leaderboard — all from a native desktop app.

---

## Concept

Each week before a round locks, players submit tips (predicted winners) for every match. After results come in, the AFL ladder updates automatically and player scores are tallied. Players can also run "what-if" ladder simulations to see how future rounds might shake out.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Desktop shell | **Electron** | Cross-platform (Mac/Win/Linux), ships with a Chromium UI |
| Frontend | **React + TypeScript** | Component model suits game UI; typed codebase is easier to maintain |
| Styling | **Tailwind CSS** | Utility-first, fast to iterate |
| State | **Zustand** | Lightweight; avoids Redux boilerplate |
| Local DB | **SQLite (better-sqlite3)** | Persists season data, tips, and scores offline |
| AFL data | **squiggle.com.au API** | Free, well-maintained AFL results/ladder API |
| Build | **Vite + electron-vite** | Fast HMR in dev; clean production bundling |
| Testing | **Vitest + Playwright** | Unit + E2E coverage |

---

## Feature List

### MVP — Season 1

#### Core Game Loop
- [ ] **Round tipping** — Submit win/loss tips for each match before the round lock time
- [ ] **Round lock** — Tips lock automatically at first bounce of the first game of each round
- [ ] **Auto-results import** — Pull results from Squiggle API after each game and update scores
- [ ] **Tip scoring** — 1 point per correct tip; optional margin bonus for stretch goals
- [ ] **Season leaderboard** — Ranked table of all players by cumulative tip score
- [ ] **Round-by-round history** — See any player's tips vs. actual results for past rounds

#### AFL Ladder
- [ ] **Live AFL ladder** — Display current AFL ladder fetched from Squiggle API
- [ ] **Ladder delta view** — Show position changes (▲/▼) since last round
- [ ] **Team detail panel** — Click a team to see their schedule, form, and W/L record

#### Accounts & Competition
- [ ] **Local multi-player** — Multiple named profiles stored on device (no account/server needed for MVP)
- [ ] **Invite friends** — Export/import a competition code so friends on other devices can join the same comp (peer-to-peer via JSON file share)

#### App Shell
- [ ] **Onboarding wizard** — Create or join a competition on first launch
- [ ] **System-tray presence** — App lives in tray; shows round deadline badge
- [ ] **Round deadline notifications** — Desktop notification 24h and 1h before tip lock
- [ ] **Dark / light mode** — Respects OS setting, overridable in preferences
- [ ] **Offline mode** — App is fully usable offline; syncs when connection restored

---

### V1.1 — Ladder Predictor

- [ ] **"What-if" simulator** — Pick hypothetical winners for upcoming rounds and see the projected ladder
- [ ] **Finalists tracker** — Highlight which teams are mathematically in/out of finals as the season progresses
- [ ] **Percentage calculator** — Show what % a team needs to overtake a rival

---

### V1.2 — Social & Stats

- [ ] **Tip streaks** — Track and surface longest correct-tip streaks per player
- [ ] **Head-to-head records** — Compare two players' historical tipping accuracy
- [ ] **Team loyalty badge** — Award flair to players who consistently back their team
- [ ] **Weekly wrap summary** — Auto-generated round recap (best/worst tippers, shock results)
- [ ] **Export to CSV** — Download full season tips & scores for spreadsheet nerds

---

### V2.0 — Online Competitions (future)

- [ ] **Cloud sync** — Optional Supabase backend for real-time competition state
- [ ] **Public competitions** — Join competitions with strangers
- [ ] **Push notifications** — Mobile companion (if app is extended to mobile)

---

## Architecture

```
afl-ladder-game/
├── electron/               # Electron main process
│   ├── main.ts             # App entry, window management
│   ├── ipc/                # IPC handlers (DB queries, API calls)
│   └── tray.ts             # System tray & notifications
├── src/                    # React renderer process
│   ├── app.tsx             # Root component, routing
│   ├── pages/
│   │   ├── Dashboard.tsx   # Current round + leaderboard summary
│   │   ├── Tipping.tsx     # Submit tips for the current round
│   │   ├── Ladder.tsx      # AFL ladder with delta view
│   │   ├── History.tsx     # Past rounds, tip history
│   │   ├── Predictor.tsx   # What-if ladder simulator
│   │   └── Settings.tsx    # Preferences, competition management
│   ├── components/         # Shared UI components
│   ├── store/              # Zustand slices
│   └── lib/
│       ├── api.ts          # Squiggle API client
│       └── db.ts           # SQLite helpers
├── db/
│   └── schema.sql          # DB schema (seasons, rounds, games, tips, players)
├── tests/
│   ├── unit/               # Vitest unit tests
│   └── e2e/                # Playwright E2E tests
└── package.json
```

---

## Data Model (SQLite)

```sql
-- Teams reference
CREATE TABLE teams (id INTEGER PRIMARY KEY, name TEXT, abbrev TEXT, logo_url TEXT);

-- AFL season/round structure
CREATE TABLE rounds (id INTEGER PRIMARY KEY, season INTEGER, number INTEGER, name TEXT, lock_time TEXT);

-- Individual AFL matches
CREATE TABLE games (
  id INTEGER PRIMARY KEY, round_id INTEGER,
  home_team_id INTEGER, away_team_id INTEGER,
  home_score INTEGER, away_score INTEGER,
  winner_id INTEGER, complete INTEGER DEFAULT 0
);

-- Competition players (local profiles)
CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT, avatar TEXT);

-- Player tips per game
CREATE TABLE tips (
  id INTEGER PRIMARY KEY, player_id INTEGER, game_id INTEGER,
  tip_team_id INTEGER, margin_tip INTEGER,
  correct INTEGER, points_earned INTEGER
);

-- Leaderboard cache (updated after each round)
CREATE TABLE leaderboard (player_id INTEGER, season INTEGER, round_number INTEGER, cumulative_points INTEGER);
```

---

## Implementation Roadmap

| Phase | Milestone | Goal |
|---|---|---|
| 0 | Project scaffold | Electron + Vite + React + SQLite wired up, dev server running |
| 1 | AFL data pipeline | Squiggle API client, DB population, ladder display |
| 2 | Core tipping UI | Submit tips, lock logic, score calculation |
| 3 | Leaderboard | Season + round leaderboard, history view |
| 4 | Notifications & tray | Deadline reminders, system tray |
| 5 | Ladder predictor | What-if simulator page |
| 6 | Polish & packaging | Dark mode, onboarding, auto-updater, installers |
| 7 | Beta testing | Playwright E2E suite, bug fixes |

---

## Getting Started (once scaffolded)

```bash
npm install
npm run dev        # Start Electron app with HMR
npm test           # Run Vitest unit tests
npm run test:e2e   # Run Playwright E2E tests
npm run build      # Production build
npm run dist       # Package installer (Mac .dmg / Win .exe / Linux .AppImage)
```

---

## AFL Data Source

All live AFL data comes from the **[Squiggle API](https://api.squiggle.com.au/)** — a free, community-maintained AFL data API.

Key endpoints used:
- `?q=games;year={year};round={round}` — Match results per round
- `?q=ladder;year={year};round={round}` — Ladder after each round
- `?q=teams` — Team list and metadata

Rate limit: be courteous — cache responses and don't hammer the API.
