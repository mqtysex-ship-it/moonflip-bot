function validateKey(key) {
  if (typeof key !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,200}$/.test(key)) {
    throw new Error('Invalid document key');
  }
}

export class PostgresDocumentStore {
  constructor(pool) { this.pool = pool; }

  async read(key, fallback = null) {
    validateKey(key);
    const result = await this.pool.query('SELECT value FROM moonflip_private.documents WHERE key = $1', [key]);
    return result.rows.length ? result.rows[0].value : structuredClone(fallback);
  }

  async write(key, value) {
    validateKey(key);
    await this.pool.query(`INSERT INTO moonflip_private.documents (key, value) VALUES ($1, $2::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [key, JSON.stringify(value)]);
    return value;
  }

  // The callback mutates a private copy; its result is returned only after
  // COMMIT. The row lock serializes writers across processes and hosts.
  async update(key, fallback, updater) {
    validateKey(key);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO moonflip_private.documents (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(fallback)]);
      const loaded = await client.query('SELECT value FROM moonflip_private.documents WHERE key = $1 FOR UPDATE', [key]);
      const value = loaded.rows[0].value;
      const result = await updater(value);
      await client.query('UPDATE moonflip_private.documents SET value = $2::jsonb, updated_at = now() WHERE key = $1', [key, JSON.stringify(value)]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* preserve original error */ }
      throw error;
    } finally { client.release(); }
  }
}
