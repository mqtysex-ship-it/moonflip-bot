import assert from 'node:assert/strict';
import express from 'express';
import { EventEmitter } from 'node:events';

const module = await import('../src/web/rewardsApi.js').catch(() => ({}));
assert.equal(typeof module.setupRewardsApi, 'function', 'Rewards must have its own authenticated rewards API');

// Part 1: Unauthenticated and fail-closed checks (pool: null)
const app1 = express();
app1.use(express.json());
module.setupRewardsApi(app1, {
  resolvePlayer: async req => ({ authenticated: req.headers['x-test-user'] === 'linked', session: { userId: '123' } }),
  pool: null
});
const server1 = app1.listen(0);
await new Promise(r => server1.once('listening', r));
const base1 = `http://127.0.0.1:${server1.address().port}`;

try {
  assert.equal((await fetch(base1 + '/api/play/rewards')).status, 401);
  assert.equal((await fetch(base1 + '/api/play/rewards', { headers: { 'x-test-user': 'linked' } })).status, 503);
  assert.equal((await fetch(base1 + '/api/play/rewards/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base1 + '/api/play/rewards/rakeback/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  assert.equal((await fetch(base1 + '/api/play/rewards/rakeback/claim', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-user': 'linked' }, body: JSON.stringify({ operationId: 'invalid-uuid' }) })).status, 503);
  console.log('Rewards authentication and database fail-closed checks passed');
} finally {
  server1.closeAllConnections();
  await new Promise(r => server1.close(r));
}

// Part 2: Authenticated checks with simulated PostgreSQL pool
let fakeWallet = { balance: '5000', total_bet: '10000' };
let fakeDoc = { claimedWager: 0, lifetimeClaimed: 0, claims: {} };
const mockClient = {
  async query(sql, params) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('RETURNING discord_user_id')) {
      return { rows: [{ discord_user_id: params[0], balance: fakeWallet.balance, total_bet: fakeWallet.total_bet, total_won: '0', games_played: '1', last_daily: null, xp: '0', level: 1, created_at: new Date('2026-01-01T00:00:00Z'), username: 'Player', avatar_url: null }] };
    }
    if (sql.includes('FROM moonflip_private.documents WHERE key = $1')) {
      return { rows: [{ value: structuredClone(fakeDoc) }] };
    }
    if (sql.includes('INSERT INTO moonflip_private.documents')) return { rows: [] };
    if (sql.includes('UPDATE moonflip_private.documents')) {
      fakeDoc = JSON.parse(params[1]);
      return { rows: [] };
    }
    if (sql.includes('FROM moonflip_private.wallets WHERE discord_user_id = $1 FOR UPDATE')) {
      return { rows: [{ balance: fakeWallet.balance, total_bet: fakeWallet.total_bet }] };
    }
    if (sql.includes('UPDATE moonflip_private.wallets SET balance')) {
      fakeWallet.balance = (BigInt(fakeWallet.balance) + BigInt(params[1])).toString();
      return { rows: [] };
    }
    throw new Error('unexpected query in test: ' + sql);
  },
  release() {}
};

const mockPool = {
  async query(sql, params) { return mockClient.query(sql, params); },
  async connect() { return mockClient; }
};

const economyEvents = new EventEmitter();
const emittedEvents = [];
economyEvents.on('balanceChanged', ev => emittedEvents.push(ev));

const app2 = express();
app2.use(express.json());
module.setupRewardsApi(app2, {
  resolvePlayer: async () => ({ authenticated: true, session: { userId: 'user-777' } }),
  pool: mockPool,
  economyEvents
});
const server2 = app2.listen(0);
await new Promise(r => server2.once('listening', r));
const base2 = `http://127.0.0.1:${server2.address().port}`;

try {
  // GET rewards includes rakeback info
  const rewardsRes = await fetch(base2 + '/api/play/rewards');
  assert.equal(rewardsRes.status, 200);
  const rewardsData = await rewardsRes.json();
  assert.equal(rewardsData.amount, 500);
  assert.equal(rewardsData.available, true);
  assert(rewardsData.rakeback);
  assert.equal(rewardsData.rakeback.rate, 0.005);
  assert.equal(rewardsData.rakeback.totalWagered, 10000);
  assert.equal(rewardsData.rakeback.claimedWager, 0);
  assert.equal(rewardsData.rakeback.available, 50); // 10,000 * 0.005 = 50 tokens

  // Invalid operationId rejected with 400
  const badClaim = await fetch(base2 + '/api/play/rewards/rakeback/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: 'not-a-uuid' })
  });
  assert.equal(badClaim.status, 400);

  // Valid rakeback claim succeeds atomically
  const validOp = '12345678-1234-4234-8234-123456789abc';
  const goodClaim = await fetch(base2 + '/api/play/rewards/rakeback/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: validOp })
  });
  assert.equal(goodClaim.status, 200);
  const claimResult = await goodClaim.json();
  assert.equal(claimResult.success, true);
  assert.equal(claimResult.amount, 50);
  assert.equal(claimResult.balance, 5050);
  assert.equal(claimResult.rakeback.available, 0);
  assert.equal(claimResult.rakeback.claimedWager, 10000);
  assert.equal(claimResult.rakeback.lifetimeClaimed, 50);
  assert.equal(emittedEvents.length, 1);
  assert.equal(emittedEvents[0].action, 'rakeback');
  assert.equal(emittedEvents[0].amount, 50);
  assert.equal(emittedEvents[0].balance, 5050);

  console.log('Rewards API rakeback integration tests passed');
} finally {
  server2.closeAllConnections();
  await new Promise(r => server2.close(r));
}
