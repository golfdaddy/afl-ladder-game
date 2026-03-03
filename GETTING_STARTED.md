# Getting Started - AFL Ladder Prediction Game

## Current Status

### ✅ Completed
- Backend API infrastructure (Express + TypeScript)
- PostgreSQL database schema with all tables
- Database migrations and seeding
- Authentication system (register, login, JWT)
- Prediction submission and editing endpoints
- Competition creation and joining system
- Scoring calculation logic
- Leaderboard endpoints (competition, personal, global)
- Admin endpoint for uploading AFL ladder data
- Frontend project setup (React + TypeScript + Vite)
- Dashboard page with competition management UI
- Login/Register pages (functional)

### 🚧 In Progress / Remaining
- Ladder prediction form (frontend)
- Leaderboard views (personal, competition, global)
- Competition detail page with member list
- Email verification (backend ready, needs email service)
- Testing and bug fixes
- Production deployment

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Terminal/CLI

### 2. Install Dependencies

```bash
# Backend
cd /Users/MattWork/Documents/afl-ladder-game/backend
npm install

# Frontend
cd /Users/MattWork/Documents/afl-ladder-game/frontend
npm install
```

### 3. Start Infrastructure

```bash
# From project root
cd /Users/MattWork/Documents/afl-ladder-game
docker-compose up -d
```

Wait for containers to be healthy (30 seconds):
```bash
docker-compose ps
```

### 4. Setup Database

```bash
cd backend

# Copy example env
cp .env.example .env

# Run migrations
npm run migrate

# Seed initial data (creates 2026 season)
npm run seed
```

### 5. Start Backend

```bash
cd backend
npm run dev
```

Backend will run on: **http://localhost:3000**

### 6. Start Frontend (new terminal)

```bash
cd frontend
npm run dev
```

Frontend will run on: **http://localhost:5173**

---

## Testing the Application

### 1. Register & Login
- Go to http://localhost:5173
- Click "Register here" on login page
- Enter email, name, password (8+ chars)
- Login with credentials

### 2. Create a Competition
- Dashboard → "New Competition" card
- Enter name and optional description
- Click "Create Competition"
- Competition appears in "Your Competitions" section

### 3. Copy Join Code
- Click "Copy Code" on competition card
- Share code with friends

### 4. Join a Competition
- Get a join code from someone else
- Dashboard → "Join Competition" card
- Paste the code and click "Join"

### 5. Submit Ladder Prediction
- Dashboard → "Make Prediction" button
- (Form not yet complete - see next section)

### 6. View Leaderboard
- Dashboard → "Global Leaderboard" button
- (Leaderboard views in progress)

---

## API Endpoints (Postman/cURL Testing)

### Authentication
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "displayName": "Test User",
    "password": "password123"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Get Current User
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### Create Competition
```bash
curl -X POST http://localhost:3000/api/competitions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "seasonId": 1,
    "name": "My Competition",
    "description": "Optional description",
    "isPublic": false
  }'
```

### Submit Prediction (18 teams required)
```bash
curl -X POST http://localhost:3000/api/predictions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "seasonId": 1,
    "teams": [
      {"position": 1, "teamName": "Richmond"},
      {"position": 2, "teamName": "Melbourne"},
      ...
      {"position": 18, "teamName": "Gold Coast"}
    ]
  }'
```

### Upload AFL Ladder (Admin)
```bash
curl -X POST http://localhost:3000/api/admin/afl-ladder \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "seasonId": 1,
    "round": 1,
    "teams": [
      {
        "position": 1,
        "teamName": "Richmond",
        "wins": 3,
        "losses": 0,
        "pointsFor": 250,
        "pointsAgainst": 150,
        "percentage": 166.7
      },
      ...
    ]
  }'
```

---

## Environment Configuration

Create `.env` in backend directory:

```
DATABASE_URL=postgresql://afl_user:afl_password@localhost:5432/afl_ladder_game
JWT_SECRET=your-secret-key-here
JWT_EXPIRY=24h
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Next Steps (Priority Order)

1. **Complete Prediction Form** (~2 hours)
   - Allow users to drag/reorder or manually select 18 AFL teams
   - Show cutoff date countdown
   - Display validation errors

2. **Complete Leaderboard Views** (~3 hours)
   - Global leaderboard (all users, all competitions)
   - Competition leaderboard (members of specific competition)
   - Personal leaderboard (user's scores in each competition)
   - Point breakdown view

3. **Complete Competition Detail Page** (~1 hour)
   - Show competition info and members
   - Display leaderboard for that competition
   - Copy invite link/code

4. **Test & Bug Fixes** (~2 hours)
   - End-to-end testing
   - Edge case handling
   - Error messages

5. **Pre-Launch Checklist**
   - [ ] Can register and login
   - [ ] Can create competitions
   - [ ] Can join competitions
   - [ ] Can submit predictions before cutoff
   - [ ] Can see leaderboards updating
   - [ ] Admin can upload AFL ladder
   - [ ] Scores recalculate correctly

---

## Key AFL Teams (for testing)

When creating predictions, use these 18 AFL team names:
1. Richmond
2. Melbourne
3. Brisbane Lions
4. Geelong
5. Hawthorn
6. Gold Coast Suns
7. St Kilda
8. Collingwood
9. West Coast Eagles
10. North Melbourne
11. Sydney Swans
12. Essendon
13. Adelaide Crows
14. Port Adelaide
15. Fremantle
16. Greater Western Sydney
17. Canterbury-Bankstown
18. Cronulla-Sutherland

---

## Troubleshooting

### Database Connection Error
```bash
# Check Docker containers are running
docker-compose ps

# View logs
docker-compose logs postgres

# Restart containers
docker-compose restart
```

### Port Already in Use
- Backend: Change `PORT` in `.env`
- Frontend: Change port in `frontend/vite.config.ts`

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Clear All Data
```bash
# Stop containers
docker-compose down -v

# Remove volumes
rm -rf postgres_data/

# Restart
docker-compose up -d
npm run migrate
npm run seed
```

---

## Timeline to March 10

- **Today (9 days before cutoff)**: Current setup
- **Day 2-3**: Complete prediction form and leaderboards
- **Day 4-5**: Testing, bug fixes, refinements
- **Day 6-7**: Staging environment testing
- **Day 8**: Final checks and launch
- **Day 9 (March 10)**: Go live! Users can submit predictions

---

## Questions?

Check the code comments or review the implementation plan in `/plan.md`.
