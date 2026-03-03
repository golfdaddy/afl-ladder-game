import { db } from '../db';
import dotenv from 'dotenv';

dotenv.config();

async function seed() {
  try {
    console.log('Seeding database...');

    // Create 2026 season
    await db.query(
      `INSERT INTO seasons (year, start_date, cutoff_date, status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (year) DO NOTHING`,
      [2026, '2026-03-28', '2026-03-10', 'open']
    );

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

seed();
