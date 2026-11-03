import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const env = { ...process.env, DATABASE_URL: '', MOONFLIP_ISOLATED_TEST: '' };
const child = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./src/database.js')"], { env, encoding: 'utf8' });
assert.notEqual(child.status, 0, 'Production must refuse to start without DATABASE_URL');
assert.match(child.stderr, /DATABASE_URL/);
const weakSecret = spawnSync(process.execPath, ['--input-type=module', '-e', "const {createWebServer}=await import('./src/web/server.js'); createWebServer()"], {
  env: { ...process.env, DATABASE_URL: 'postgresql://test:secret@localhost/test', WEB_SESSION_SECRET: '', MOONFLIP_ISOLATED_TEST: '' }, encoding: 'utf8'
});
assert.notEqual(weakSecret.status, 0, 'Production must reject a missing session secret');
assert.match(weakSecret.stderr, /WEB_SESSION_SECRET/);

process.env.MOONFLIP_ISOLATED_TEST = '1';
process.env.DATABASE_URL = '';
process.env.DASHBOARD_PASSWORD = 'test-password';
const { createWebServer } = await import('../src/web/server.js');
const server = createWebServer().listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/health`)).status, 503);
  for (let i = 0; i < 10; i++) await fetch(`${base}/api/status`);
  assert.equal((await fetch(`${base}/api/status`)).status, 429);
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Production storage and dashboard access guards passed');
