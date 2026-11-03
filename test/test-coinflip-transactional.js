import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';

// Verify that playInstantRound with documentUpdate performs both operations in ONE transaction
const queries = [];
let shouldFailDocument = false;

const mockClient = {
  async query(sql, params) {
    queries.push({ sql, params });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('start_game_round')) return { rows: [{ balance_after: '900', applied: true }] };
    if (sql.includes('settle_game_round')) return { rows: [{ balance_after: '1092', applied: true }] };
    if (sql.includes('moonflip_private.documents') && sql.includes('FOR UPDATE')) {
      if (shouldFailDocument) throw new Error('Document update failed');
      return { rows: [{ value: { 'user_1': { coinflip: { streak: 2 } } } }] };
    }
    return { rows: [] };
  },
  release() {},
};

const economy = new PostgresEconomy({
  query() {},
  async connect() {
    return mockClient;
  },
});

// Test 1: Successful atomic round + streak update
const res = await economy.playInstantRound(
  '00000000-0000-4000-8000-000000000099',
  'user_1',
  'coinflip',
  100,
  192,
  { choice: 'heads', outcome: 'heads', streak: 3 },
  {
    key: 'user_preferences',
    fallback: {},
    updater: (doc) => {
      doc['user_1'] ||= {};
      doc['user_1'].coinflip = { streak: 3 };
      return doc['user_1'].coinflip;
    },
  }
);

assert.equal(res.balance, 1092);
assert.deepEqual(res.documentResult, { streak: 3 });
assert.equal(queries[0].sql, 'BEGIN');
assert.equal(queries.at(-1).sql, 'COMMIT');
assert(queries.some((q) => q.sql.includes('start_game_round')));
assert(queries.some((q) => q.sql.includes('settle_game_round')));
assert(queries.some((q) => q.sql.includes('moonflip_private.documents') && q.sql.includes('FOR UPDATE')));

// Test 2: Failed document update rolls back the ENTIRE round and wallet credit
queries.length = 0;
shouldFailDocument = true;

await assert.rejects(
  economy.playInstantRound(
    '00000000-0000-4000-8000-000000000100',
    'user_1',
    'coinflip',
    100,
    192,
    { choice: 'heads', outcome: 'heads', streak: 4 },
    {
      key: 'user_preferences',
      fallback: {},
      updater: () => {},
    }
  ),
  /Document update failed/
);

assert.equal(queries[0].sql, 'BEGIN');
assert.equal(queries.at(-1).sql, 'ROLLBACK');

console.log('Coinflip round settlement and streak update are strictly atomic and transactional');
