import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
process.env.DASHBOARD_PASSWORD = 'isolated-password';
const { createWebServer } = await import('../src/web/server.js');
const server = createWebServer().listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/economy/players`)).status, 401);
  assert.equal((await fetch(`${base}/api/economy/adjust`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: 'victim', action: 'add', amount: 100 }),
  })).status, 401);
  const auth = 'Basic ' + Buffer.from('admin:isolated-password').toString('base64');
  assert.equal((await fetch(`${base}/api/economy/players`, { headers: { authorization: auth } })).status, 200);
  assert.equal((await fetch(`${base}/api/deploy/games`, { method: 'POST', headers: { authorization: auth } })).status, 415);
  assert.equal((await fetch(`${base}/play`)).status, 200);
  assert.equal((await fetch(`${base}/api/play/profile`)).status, 200);
  console.log('Dashboard authentication passed');
} finally { await new Promise((resolve) => server.close(resolve)); }
