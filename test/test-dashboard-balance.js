import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
process.env.DASHBOARD_PASSWORD = 'isolated-password';
const { createWebServer } = await import('../src/web/server.js');

const app = createWebServer();
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/economy/adjust`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('admin:isolated-password').toString('base64') },
    body: JSON.stringify({ userId: 'isolated-dashboard-test', action: 'add', amount: 200 }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.previousBalance, 1000);
  assert.equal(result.newBalance, 1200);
  console.log('Dashboard balance history passed');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
