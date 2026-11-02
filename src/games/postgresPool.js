import pg from 'pg';
import { readFileSync } from 'node:fs';

// Supabase's session pooler supports IPv4. Fail closed on unencrypted or
// certificate-bypassing connection parameters rather than leaking credentials.
export function createEconomyPool(connectionString, Pool = pg.Pool) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid Postgres DATABASE_URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid Postgres DATABASE_URL');
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'ssl']) {
    if (url.searchParams.has(key)) throw new Error('SSL parameters must be configured by the application');
  }
  const ssl = { rejectUnauthorized: true };
  if (url.hostname.endsWith('.pooler.supabase.com') || url.hostname.endsWith('.supabase.co')) {
    ssl.ca = readFileSync(new URL('../../supabase/certs/prod-ca-2021.crt', import.meta.url), 'utf8');
  }
  return new Pool({ connectionString, ssl, max: 5, connectionTimeoutMillis: 10000, idleTimeoutMillis: 30000 });
}
