import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';

const queries = [];
const client = {
  async query(sql, params) {
    queries.push({ sql, params });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('FROM moonflip_private.game_rounds') && sql.includes("status = 'active'")) {
      return {
        rows: [
          {
            round_id: '00000000-0000-4000-8000-000000000021',
            discord_user_id: '123456789',
            wager: '250',
            game_state: { autoCashout: 2.0 },
            version: '0',
          },
          {
            round_id: '00000000-0000-4000-8000-000000000022',
            discord_user_id: '987654321',
            wager: '500',
            game_state: { autoCashout: null },
            version: '0',
          },
        ],
      };
    }
    if (sql.includes('UPDATE moonflip_private.wallets') && sql.includes('balance = balance + $2')) {
      return { rows: [{ balance: '1250' }] };
    }
    if (sql.includes('UPDATE moonflip_private.game_rounds') && sql.includes("status = 'settled'")) {
      return { rows: [] };
    }
    throw new Error('Unexpected query: ' + sql);
  },
  release() {},
};

const economy = new PostgresEconomy({
  query() {},
  async connect() {
    return client;
  },
});

// Test 1: Recovery of interrupted flights with 20-minute age window (protects 13-minute Discord flights)
const recoveredCount = await economy.recoverInterruptedRounds('crash', true, 1200);
assert.equal(recoveredCount, 2);
assert.equal(queries[0].sql, 'BEGIN');
assert.equal(queries.at(-1).sql, 'COMMIT');
assert(queries.some((q) => q.sql.includes('pg_advisory_xact_lock')));
assert(queries.some((q) => q.sql.includes('balance = balance + $2')));
assert(queries.some((q) => q.sql.includes("status = 'settled'")));
assert(queries.some((q) => q.sql.includes("created_at < now() - ($2 || ' seconds')::interval") && q.params[1] === 1200));

// Test 1b: Verify default age window is 1200 seconds (20 minutes)
await economy.recoverInterruptedRounds('crash');
const lastQuery = queries.findLast((q) => q.sql.includes("created_at < now() - ($2 || ' seconds')::interval"));
assert.equal(lastQuery.params[1], 1200);

// A recovery sweep must never refund a round that is still owned by this process.
const activeId = '00000000-0000-4000-8000-000000000021';
await economy.recoverInterruptedRounds('crash', true, 1200, [activeId]);
const exclusionQuery = queries.findLast((q) => q.sql.includes("created_at < now() - ($2 || ' seconds')::interval"));
assert.deepEqual(exclusionQuery.params[2], [activeId]);
assert.match(exclusionQuery.sql, /round_id.*ALL\(\$3::uuid\[\]\)/s);

// Test 2: Active crash flight lookup
const lookupQueries = [];
const lookupEconomy = new PostgresEconomy({
  async query(sql, params) {
    lookupQueries.push({ sql, params });
    return {
      rows: [{
        round_id: '00000000-0000-4000-8000-000000000021',
        discord_user_id: '123456789',
        game_type: 'crash',
        wager: '250',
        game_state: { crashPoint: 3.5, autoCashout: 2.0 },
        status: 'active',
        version: '0',
        balance_after_wager: '750',
      }],
    };
  },
});

const activeFlight = await lookupEconomy.loadActiveCrash('123456789');
assert.equal(activeFlight.roundId, '00000000-0000-4000-8000-000000000021');
assert.equal(activeFlight.wager, 250);
assert.equal(activeFlight.game, 'crash');
assert.equal(lookupQueries[0].params[0], '123456789');

console.log('Crash restart recovery and database persistence passed');
