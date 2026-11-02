// dataDirectory loads the project's .env before the pool is configured.
import './dataDirectory.js';
import { createEconomyPool } from './games/postgresPool.js';

export const databasePool = process.env.DATABASE_URL
  ? createEconomyPool(process.env.DATABASE_URL)
  : null;

export async function closeDatabase() {
  if (databasePool) await databasePool.end();
}
