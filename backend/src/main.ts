import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { db } from './db';
import { runMigrations } from './migrations/run';
import { syncLadderFromSquiggle } from './jobs/ladderSync';
import { runFantasySyncJobs } from './jobs/fantasySync';
import { runMultiJobs } from './jobs/multiJobs';
import { runSevensJobs } from './jobs/sevensJobs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Australia/Melbourne';

// Middleware
app.use(helmet());
// FRONTEND_URL supports a comma-separated list — the ladder app and the
// Multi app are separate deployments sharing this API
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  credentials: true
}));
app.use(express.json());

// Health check — BUILD_TIME is injected at compile time to verify Railway has the latest deploy
const BUILD_TIME = new Date().toISOString();
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', environment: NODE_ENV, timestamp: new Date().toISOString(), buildTime: BUILD_TIME });
});

// Routes
import authRoutes from './routes/auth';
import predictionsRoutes from './routes/predictions';
import competitionsRoutes from './routes/competitions';
import leaderboardRoutes from './routes/leaderboards';
import adminRoutes from './routes/admin';
import seasonsRoutes from './routes/seasons';
import fantasyRoutes from './routes/fantasy';
import multiRoutes from './routes/multi';
import sevensRoutes from './routes/sevens';

app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/competitions', competitionsRoutes);
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/fantasy', fantasyRoutes);
app.use('/api/multi', multiRoutes);
app.use('/api/sevens', sevensRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
db.connect()
  .then(() => runMigrations())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} [${NODE_ENV}]`);
    });

    // Schedule automatic AFL ladder sync from Squiggle in Melbourne time (production only)
    if (NODE_ENV === 'production') {
      cron.schedule('0 13-23,0 * * *', () => {
        syncLadderFromSquiggle();
      }, { timezone: APP_TIMEZONE });
      console.log(`[LadderSync] Scheduled: hourly 1pm–midnight every day in ${APP_TIMEZONE}`);

      cron.schedule('*/30 * * * *', () => {
        runFantasySyncJobs()
      }, { timezone: APP_TIMEZONE })
      console.log(`[FantasySync] Scheduled: ingestion/pricing/scoring every 30 minutes in ${APP_TIMEZONE}`)

      cron.schedule('*/10 * * * *', () => {
        runMultiJobs()
      }, { timezone: APP_TIMEZONE })
      console.log(`[Multi] Scheduled: settlement, top-up, odds board + comp payouts every 10 minutes in ${APP_TIMEZONE}`)

      cron.schedule('*/15 * * * *', () => {
        runSevensJobs()
      }, { timezone: APP_TIMEZONE })
      console.log(`[Sevens] Scheduled: round scoring every 15 minutes in ${APP_TIMEZONE}`)

      // Kick the betting/fantasy jobs once on boot so player data backfills
      // immediately after a deploy rather than waiting for the first cron tick.
      setTimeout(() => { runMultiJobs(); runSevensJobs(); }, 8000)
    } else {
      console.log(`[Scheduler] Cron jobs disabled in ${NODE_ENV} environment`);
    }
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });

export default app;
