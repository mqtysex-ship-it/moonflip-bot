import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Isolated test required');
process.env.DASHBOARD_PASSWORD = 'isolated-password';
const { createWebServer } = await import('../src/web/server.js');
let captured;
const operationId = 'fb7ec7ae-aed5-4727-b5b5-57ea9b3a41c5';
const store = { async getEconomyStats() { return { totalTokens: 450, totalWagered: 50, totalGamesPlayed: 1, totalUsers: 1 }; },
  async getEconomyPlayers() { return [{ userId: '123', balance: 450, totalBet: 50, gamesPlayed: 1 }]; },
  async adjust(operation, user, action, amount) {
  captured = { operation, user, action, amount };
  return { previousBalance: 450, balance: 250, applied: true };
} };
const server = createWebServer({ economyStore: store }).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
try {
  const headers = { authorization: 'Basic ' + Buffer.from('admin:isolated-password').toString('base64') };
  const playersResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/economy/players`, { headers });
  assert.equal((await playersResponse.json()).players[0].balance, 450);
  const statsResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/stats`, { headers });
  assert.equal((await statsResponse.json()).economy.totalTokens, 450);
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/economy/adjust`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Basic ' + Buffer.from('admin:isolated-password').toString('base64') },
    body: JSON.stringify({ userId: '123', action: 'deduct', amount: 200, operationId }),
  });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.previousBalance, 450);
  assert.equal(result.newBalance, 250);
  assert.equal(captured.user, '123');
  assert.equal(captured.action, 'deduct');
  assert.equal(captured.amount, 200);
  assert.equal(captured.operation, operationId);
} finally { await new Promise(resolve => server.close(resolve)); }
console.log('Database dashboard adjustment passed');
