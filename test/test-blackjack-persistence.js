import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';

// Test 1: Verify doubleRound transaction logic with mock client
const queries = [];
let balance = 1000n;
const client = {
  async query(sql, params) {
    queries.push({ sql, params });
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('FROM moonflip_private.game_transitions WHERE operation_id')) {
      return { rows: [] }; // not prior
    }
    if (sql.includes('FROM moonflip_private.game_rounds WHERE round_id')) {
      return {
        rows: [{
          round_id: params[0],
          discord_user_id: params[1],
          game_type: 'blackjack',
          wager: '100',
          game_state: { playerHand: [{ val: 10 }, { val: 8 }] },
          status: 'active',
          version: '0',
          balance_after_wager: '900',
        }],
      };
    }
    if (sql.includes('FROM moonflip_private.wallets WHERE discord_user_id')) {
      return { rows: [{ balance: balance.toString() }] };
    }
    if (sql.includes('UPDATE moonflip_private.wallets')) {
      balance = BigInt(params[1]);
      return { rows: [] };
    }
    if (sql.includes('UPDATE moonflip_private.game_rounds')) {
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO moonflip_private.game_transitions')) {
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

const roundId = '00000000-0000-4000-8000-000000000010';
const opId = '00000000-0000-4000-8000-000000000011';
const userId = '123456789';

// Double down test: extraWager = 100, payout = 400 (win)
const doubleResult = await economy.doubleRound(opId, roundId, userId, 0, 100, { status: 'win' }, 400);

assert.equal(doubleResult.version, 1);
assert.equal(doubleResult.balance, 1300); // 1000 - 100 + 400 = 1300
assert.equal(doubleResult.applied, true);

// Check that queries executed BEGIN, checked transition, locked round & wallet, updated wallet, updated game_round, inserted transition, and COMMIT
assert.equal(queries[0].sql, 'BEGIN');
assert.equal(queries.at(-1).sql, 'COMMIT');
assert(queries.some((q) => q.sql.includes('UPDATE moonflip_private.wallets')));
assert(queries.some((q) => q.sql.includes('UPDATE moonflip_private.game_rounds')));
assert(queries.some((q) => q.sql.includes('INSERT INTO moonflip_private.game_transitions')));

// Test 2: Double down with insufficient balance rolls back
queries.length = 0;
balance = 50n; // less than extraWager 100
const failOpId = '00000000-0000-4000-8000-000000000012';
await assert.rejects(
  economy.doubleRound(failOpId, roundId, userId, 0, 100, { status: 'win' }, 400),
  /insufficient balance/
);
assert.equal(queries[0].sql, 'BEGIN');
assert.equal(queries.at(-1).sql, 'ROLLBACK');

// Test 3: Active blackjack lookup
const lookupQueries = [];
const lookupEconomy = new PostgresEconomy({
  async query(sql, params) {
    lookupQueries.push({ sql, params });
    return {
      rows: [{
        round_id: roundId,
        discord_user_id: userId,
        game_type: 'blackjack',
        wager: '100',
        game_state: { playerHand: [{ val: 10 }, { val: 6 }], dealerHand: [{ val: 10 }, { val: 7 }] },
        status: 'active',
        version: '0',
        balance_after_wager: '900',
      }],
    };
  },
});

const activeHand = await lookupEconomy.loadActiveBlackjack(userId);
assert.equal(activeHand.roundId, roundId);
assert.equal(activeHand.wager, 100);
assert.equal(activeHand.game, 'blackjack');
assert.equal(lookupQueries[0].params[0], userId);

console.log('Blackjack database persistence and Double Down transaction passed');
