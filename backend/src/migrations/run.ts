import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { db } from '../db';
import dotenv from 'dotenv';

dotenv.config();

export async function runMigrations() {
  try {
    console.log('Running migrations...');

    const migrationsDir = join(__dirname, '../../migrations');
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
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
