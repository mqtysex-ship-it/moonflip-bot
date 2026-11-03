import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';

// Verify that recoverInterruptedRounds respects recorded outcomes (cashed_out, crashed, autoCashout)
const settledRounds = [];
const walletUpdates = [];

const mockClient = {
  async query(sql, params) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
    if (sql.includes('FROM moonflip_private.game_rounds') && sql.includes("status = 'active'")) {
      return {
        rows: [
          // 1. Cashed out before settlement failure -> should receive winAmount (500)
          {
            round_id: '00000000-0000-4000-8000-000000000001',
            discord_user_id: 'user_cashed_out',
            wager: '100',
            game_state: { outcome: 'cashed_out', cashoutMult: 5.0, winAmount: 500 },
            version: '0',
          },
          // 2. Crashed before settlement failure -> should receive 0
          {
            round_id: '00000000-0000-4000-8000-000000000002',
            discord_user_id: 'user_crashed',
            wager: '100',
            game_state: { outcome: 'crashed', winAmount: 0 },
            version: '0',
          },
          // 3. Flight interrupted mid-flight before reaching auto-cashout (no terminal outcome) -> refund 100
          {
            round_id: '00000000-0000-4000-8000-000000000003',
            discord_user_id: 'user_interrupted_with_target',
            wager: '100',
            game_state: { autoCashout: 2.0, crashPoint: 3.5 },
            version: '0',
          },
          // 4. Truly interrupted mid-flight (no outcome, autoCashout not reached) -> refund 100
          {
            round_id: '00000000-0000-4000-8000-000000000004',
            discord_user_id: 'user_interrupted',
            wager: '100',
            game_state: { autoCashout: 5.0, crashPoint: 3.5 },
            version: '0',
          },
        ],
      };
    }
    if (sql.includes('UPDATE moonflip_private.wallets') && sql.includes('balance = balance + $2')) {
      walletUpdates.push({ userId: params[0], payout: params[1] });
      return { rows: [{ balance: '1000' }] };
    }
    if (sql.includes('SELECT balance FROM moonflip_private.wallets')) {
      return { rows: [{ balance: '500' }] };
    }
    if (sql.includes('UPDATE moonflip_private.game_rounds') && sql.includes("status = 'settled'")) {
      settledRounds.push({ roundId: params[0], payout: params[1], balance: params[2] });
      return { rows: [] };
    }
    throw new Error('Unexpected query: ' + sql);
  },
  release() {},
};

const economy = new PostgresEconomy({
  query() {},
  async connect() {
    return mockClient;
  },
});

const recovered = await economy.recoverInterruptedRounds('crash', true, 1200);
assert.equal(recovered, 4);

// 1. user_cashed_out received 500
assert.equal(walletUpdates.find(u => u.userId === 'user_cashed_out')?.payout, '500');
assert.equal(settledRounds.find(r => r.roundId === '00000000-0000-4000-8000-000000000001')?.payout, '500');

// 2. user_crashed received 0 (no wallet credit, settled at 0)
assert.equal(walletUpdates.some(u => u.userId === 'user_crashed'), false);
assert.equal(settledRounds.find(r => r.roundId === '00000000-0000-4000-8000-000000000002')?.payout, '0');

// 3. user_interrupted_with_target received 100 refund (flight did not reach target before interruption)
assert.equal(walletUpdates.find(u => u.userId === 'user_interrupted_with_target')?.payout, '100');
assert.equal(settledRounds.find(r => r.roundId === '00000000-0000-4000-8000-000000000003')?.payout, '100');

// 4. user_interrupted received 100 refund
assert.equal(walletUpdates.find(u => u.userId === 'user_interrupted')?.payout, '100');
assert.equal(settledRounds.find(r => r.roundId === '00000000-0000-4000-8000-000000000004')?.payout, '100');

console.log('Crash settlement recovery with state preservation passed');
