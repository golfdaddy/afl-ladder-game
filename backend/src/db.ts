import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

export const db = {
  async connect() {
    try {
      const client = await pool.connect();
      console.log('Database connected');
      client.release();
    } catch (err) {
      console.error('Database connection failed:', err);
      throw err;
    }
  },

  async query(text: string, params?: any[]) {
    const start = Date.now();
    try {
      const result = await pool.query(text, params);
      const duration = Date.now() - start;
      if (duration > 1000) {
        console.warn(`Slow query (${duration}ms): ${text}`);
      }
      return result;
    } catch (error) {
      console.error('Query error:', text, error);
      throw error;
    }
  },

  async transaction(callback: (client: PoolClient) => Promise<any>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async close() {
    await pool.end();
  }
};
