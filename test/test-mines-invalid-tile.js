import assert from 'node:assert/strict';
import express from 'express';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
const { setupPlayApi } = await import('../src/web/playApi.js');

const app = express();
app.use(express.json());
setupPlayApi(app);
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, data) => fetch(base + route, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-guest-id': 'isolated-test' },
    body: JSON.stringify(data),
  });
  const start = await post('/api/play/mines/start', { wager: 10, bombs: 3 });
  assert.equal(start.status, 200);
  const { gameId } = await start.json();
  const invalid = await post('/api/play/mines/reveal', { gameId, tileIdx: 0.5 });
  assert.equal(invalid.status, 400, 'Fractional tile indices must be rejected');
  console.log('Mines tile validation passed');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
