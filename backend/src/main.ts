import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import cron from 'node-cron';
import { db } from './db';
import { runMigrations } from './migrations/run';
import { syncLadderFromSquiggle } from './jobs/ladderSync';
import { runFantasySyncJobs } from './jobs/fantasySync';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check — BUILD_TIME is injected at compile time to verify Railway has the latest deploy
const BUILD_TIME = new Date().toISOString();
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), buildTime: BUILD_TIME });
});

// Routes
import authRoutes from './routes/auth';
import predictionsRoutes from './routes/predictions';
import competitionsRoutes from './routes/competitions';
import leaderboardRoutes from './routes/leaderboards';
import adminRoutes from './routes/admin';
import seasonsRoutes from './routes/seasons';
import fantasyRoutes from './routes/fantasy';

app.use('/api/auth', authRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/competitions', competitionsRoutes);
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/fantasy', fantasyRoutes);

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
      console.log(`Server running on port ${PORT}`);
    });

    // Schedule automatic AFL ladder sync from Squiggle every 30 minutes (production only)
    if (process.env.NODE_ENV === 'production') {
      cron.schedule('*/30 * * * *', () => {
        syncLadderFromSquiggle();
      });
      console.log('[LadderSync] Scheduled: syncing AFL ladder from Squiggle every 30 minutes');

      cron.schedule('*/30 * * * *', () => {
        runFantasySyncJobs()
      })
      console.log('[FantasySync] Scheduled: ingestion/pricing/scoring every 30 minutes')
    }
  })
  .catch((err) => {
    console.error('Failed to connect to database:', err);
    process.exit(1);
  });

export default app;
