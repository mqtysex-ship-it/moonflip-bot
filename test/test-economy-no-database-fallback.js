import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// A configured database must never silently fall back to a separate JSON wallet.
const child = spawnSync(process.execPath, ['--input-type=module', '-e', "const e=await import('./src/games/economy.js'); try { await e.getBalance('123'); process.exit(1); } catch { process.exit(0); }"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: 'postgresql://test:secret@localhost/test' },
  encoding: 'utf8',
});
assert.equal(child.status, 0, 'Failed database query must not fall back to JSON');
console.log('Database fallback protection passed');
