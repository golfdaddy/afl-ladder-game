# AFL Ladder Predictor 🏉

A competitive AFL ladder prediction game where users predict the final 1–18 ladder positions for the season, earn points based on accuracy, and compete against friends in private competitions.

**Scoring**: Lower is better — points are the sum of absolute position differences across all 18 teams. A perfect prediction scores 0.

---

## Features

- 🔐 **User authentication** — register, login, JWT sessions
- 🏆 **Ladder predictions** — drag-and-drop 18 teams into your predicted order
- 📊 **Live scoring** — auto-synced from the Squiggle AFL API with per-team diff arrows
- 🤝 **Competitions** — create private leagues, invite friends by email, join with a code
- 🥇 **Leaderboards** — per-competition and global rankings
- 🛡️ **Admin panel** — user management, ladder sync, role assignment

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Auth | JWT (jsonwebtoken + bcrypt) |
| AFL Data | [Squiggle API](https://api.squiggle.com.au) |
| Dev Infra | Docker Compose |

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- Docker & Docker Compose

### 1. Clone & install

```bash
git clone <repo-url>
cd afl-ladder-game

cd backend && npm install && cp .env.example .env
cd ../frontend && npm install && cp .env.example .env
```

### 2. Configure environment

Edit `backend/.env` — at minimum set:
```
JWT_SECRET=<generate a long random string>
ADMIN_SECRET=<another long random string>
```

### 3. Start the database

```bash
docker-compose up -d
```

### 4. Run database migrations

```bash
cd backend
npm run migrate
npm run seed
```

### 5. Start dev servers

```bash
# Terminal 1 — Backend (http://localhost:3000)
cd backend && npm run dev

# Terminal 2 — Frontend (http://localhost:5173)
cd frontend && npm run dev
```

### 6. Set yourself as admin

After registering, promote your account:

```bash
curl -X POST http://localhost:3000/api/admin/promote-email \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <your ADMIN_SECRET>" \
  -d '{"email": "you@example.com", "role": "admin"}'
```

Log out and back in — the 🛡️ Admin link appears in the nav.

---

## Syncing the AFL Ladder

```bash
curl -X POST http://localhost:3000/api/admin/sync-ladder \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <your ADMIN_SECRET>" \
  -d '{"seasonId": 1}'
```

Or use the **Sync Ladder** button in the Admin panel. Scores recalculate automatically.

---

## Project Structure

```
afl-ladder-game/
├── .github/workflows/     # GitHub Actions CI
├── backend/
│   ├── migrations/        # SQL files — run in order
│   └── src/
│       ├── controllers/   # Route handlers
│       ├── middleware/    # auth, adminAuth, requireAdmin
│       ├── models/        # Database models
│       ├── routes/        # Express routers
│       ├── services/      # Squiggle API integration
│       ├── utils/         # JWT, password helpers
│       ├── db.ts          # PostgreSQL pool
│       └── main.ts        # Express entry point
└── frontend/
    └── src/
        ├── pages/         # Page components
        ├── store/         # Zustand auth store
        ├── services/      # Axios API client
        └── App.tsx        # Router + route guards
```

---

## API Reference

### Auth
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | — | Register |
| POST | `/api/auth/login` | — | Login → JWT |
| GET | `/api/auth/me` | JWT | Current user |

### Predictions
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/predictions` | JWT | Submit / update prediction |
| GET | `/api/predictions/:seasonId` | JWT | Get prediction + live scores |

### Competitions
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/competitions` | JWT | Create |
| GET | `/api/competitions` | JWT | List mine |
| GET | `/api/competitions/:id` | JWT | Detail + members |
| POST | `/api/competitions/join` | JWT | Join by code |
| POST | `/api/competitions/:id/invite` | JWT | Send email invite |

### Admin
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/sync-ladder` | Admin secret | Sync from Squiggle |
| POST | `/api/admin/promote-email` | Admin secret | Promote user to admin |
| GET | `/api/admin/users` | JWT + admin role | List all users |
| PUT | `/api/admin/users/:id/role` | JWT + admin role | Set user role |

---

## Scoring System

```
score = Σ |predicted_position(team) - actual_position(team)|  for all 18 teams
```

Lower score = better. Perfect = 0. Updated on every ladder sync.

---

## Environment Variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Long random string for signing JWTs |
| `JWT_EXPIRY` | | Token lifetime (default: `24h`) |
| `ADMIN_SECRET` | ✅ | Secret for headless admin API access |
| `FRONTEND_URL` | | Frontend origin for CORS (default: `http://localhost:5173`) |
| `PORT` | | API port (default: `3000`) |
| `SMTP_HOST/USER/PASS` | | Email sending (optional; logs to console in dev) |

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend URL (default: `http://localhost:3000/api`) |

---

## Deployment

- **Backend**: Railway, Fly.io, Render, or any Node.js host
- **Frontend**: Vercel, Netlify, or Cloudflare Pages
- **Database**: Supabase, Neon, Railway Postgres, or AWS RDS

Set all env vars, run migrations, and ensure `FRONTEND_URL` / `VITE_API_URL` point to each other correctly.

---

## UX Backlog (Not Implemented)

- Add a clear `Open Season` vs `Locked Season` mode banner with one primary CTA.
- Add pre-submit `prediction confidence` feedback (for example: major movers vs AFL now).
- Add `Quick Compare` mode to show only differences between selected users' ladders.
- Add draft autosave with `Last saved` timestamp in prediction edit flow.
- Add team search/jump in prediction editor to quickly locate and move teams.
- Improve invite loop with pending/accepted metrics and one-click invite link copy.
- Add personal progress cards after lockout (best rank, best pick accuracy, biggest miss).
- Add lightweight competition activity feed (submissions, ladder sync updates, rank changes).

---

## License

MIT
