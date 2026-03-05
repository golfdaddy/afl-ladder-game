import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import dotenv from 'dotenv';

dotenv.config();

export async function runMigrations() {
  try {
    console.log('Running migrations...');

    // Create migration tracking table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = join(__dirname, '../../migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      // Skip if already applied
      const check = await db.query(
        `SELECT filename FROM schema_migrations WHERE filename = $1`,
        [file]
      );
      if (check.rows.length > 0) {
        console.log(`  Skipping (already applied): ${file}`);
        continue;
      }

      console.log(`Running migration: ${file}`);
      const filePath = join(migrationsDir, file);
      const schema = readFileSync(filePath, 'utf-8');

      // Split by semicolon and execute each statement
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        await db.query(statement);
      }

      // Record migration as applied
      await db.query(
        `INSERT INTO schema_migrations (filename) VALUES ($1)`,
        [file]
      );

      console.log(`  Done: ${file}`);
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Allow running directly: node dist/migrations/run.js
if (require.main === module) {
  runMigrations().then(() => process.exit(0)).catch(() => process.exit(1));
}
