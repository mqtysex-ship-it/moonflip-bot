// dataDirectory loads the project's .env before the pool is configured.
import './dataDirectory.js';
import { createEconomyPool } from './games/postgresPool.js';

// The legacy file store is available only to the isolated test harness.
if (!process.env.DATABASE_URL && process.env.MOONFLIP_ISOLATED_TEST !== '1') {
  throw new Error('DATABASE_URL is required; local production storage is disabled');
}

export const databasePool = process.env.DATABASE_URL
  ? createEconomyPool(process.env.DATABASE_URL)
  : null;

export async function closeDatabase() {
  if (databasePool) await databasePool.end();
}
