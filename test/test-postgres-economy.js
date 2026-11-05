import assert from 'node:assert/strict';
import { PostgresEconomy } from '../src/games/postgresEconomy.js';

const calls = [];
const pool = { async query(sql, params) {
  calls.push({ sql, params });
  if (sql.includes('start_game_round')) return { rows: [{ balance_after: '800', applied: true }] };
  if (sql.includes('advance_game_round')) return { rows: [{ version: '1', balance_after: '900', applied: false }] };
  if (sql.includes('transfer_wallet_tokens')) return { rows: [{ sender_balance: '700', receiver_balance: '1300', applied: true }] };
  if (sql.includes('claim_wallet_daily')) return { rows: [{ balance_after: '1500', applied: true, success: true, available_at: new Date('2026-11-03T00:00:00Z') }] };
  if (sql.includes('add_wallet_xp')) return { rows: [{ balance_after: '1100', xp_after: '0', level_after: 2, token_bonus: '100', applied: true }] };
  if (sql.includes('adjust_wallet')) return { rows: [{ old_balance: '1000', new_balance: '1200', applied: true }] };
  if (sql.includes('RETURNING discord_user_id')) return { rows: [{ discord_user_id: '123456789', balance: '1200', total_bet: '200', total_won: '50', games_played: '2', last_daily: null, xp: '5', level: 2, created_at: new Date('2026-01-01T00:00:00Z'), username: 'Player', avatar_url: null }] };
  if (sql.includes('UPDATE moonflip_private.wallets SET username')) return { rows: [] };
  if (sql.includes('FROM moonflip_private.game_transitions')) return { rows: [{ round_id: 'round', discord_user_id: '123456789', next_state: { revealed: [3] }, payout: '200', resulting_version: '1', balance_after: '1000' }] };
  if (sql.includes('FROM moonflip_private.game_rounds')) return { rows: [{ round_id: 'round', discord_user_id: '123456789', game_type: 'mines', wager: '200', game_state: { bombs: [1] }, status: 'active', version: '2', balance_after_wager: '800' }] };
  throw new Error('unexpected query');
} };
const db = new PostgresEconomy(pool);
const reads = new PostgresEconomy({ async query(sql) {
  if (sql.includes('sum(balance)')) return { rows: [{ total_tokens: '1200', total_wagered: '200', total_games: '2', total_users: '1' }] };
  return { rows: [{ discord_user_id: '123456789', balance: '1200', total_bet: '200', total_won: '50', games_played: '2', last_daily: null, created_at: new Date('2026-01-01T00:00:00Z'), username: 'Player', avatar_url: null }] };
} });
assert.deepEqual(await reads.getEconomyStats(), { totalTokens: 1200, totalWagered: 200, totalGamesPlayed: 2, totalUsers: 1 });
assert.deepEqual(await reads.getEconomyPlayers(), [{ userId: '123456789', balance: 1200, totalBet: 200, totalWon: 50, gamesPlayed: 2, lastDaily: null, createdAt: Date.parse('2026-01-01T00:00:00Z'), username: 'Player', avatarUrl: null }]);
const round = '00000000-0000-4000-8000-000000000201';
const op = '00000000-0000-4000-8000-000000000202';
assert.deepEqual(await db.startRound(round, '123456789', 'mines', 200, { bombs: [1] }), { balance: 800, applied: true });
assert.deepEqual(await db.advanceRound(op, round, '123456789', 0, { revealed: [2] }, null), { version: 1, balance: 900, applied: false });
assert.deepEqual(await db.transfer(op, '123456789', '234567891', 300), { senderBalance: 700, receiverBalance: 1300, applied: true });
assert.deepEqual(await db.claimDaily(op, '123456789'), { balance: 1500, applied: true, success: true, availableAt: new Date('2026-11-03T00:00:00Z') });
assert.deepEqual(await db.addXp(op, '123456789', 100), { balance: 1100, xp: 0, level: 2, bonus: 100, applied: true });
assert.deepEqual(await db.adjust(op, '123456789', 'add', 200), { previousBalance: 1000, balance: 1200, applied: true });
assert.deepEqual(await db.getUser('123456789'), { userId: '123456789', balance: 1200, totalBet: 200, totalWon: 50, gamesPlayed: 2, lastDaily: 0, xp: 5, level: 2, createdAt: Date.parse('2026-01-01T00:00:00Z'), username: 'Player', avatarUrl: null });
await db.setUserMeta('123456789', 'Player', 'https://example.com/avatar.png');
assert.deepEqual(await db.loadRound(round, '123456789'), { roundId: 'round', userId: '123456789', game: 'mines', wager: 200, state: { bombs: [1] }, status: 'active', version: 2, balanceAfterWager: 800 });
assert.deepEqual(await db.loadTransition(op, round, '123456789'), { roundId: 'round', userId: '123456789', state: { revealed: [3] }, payout: 200, version: 1, balance: 1000 });
assert.equal(calls[0].params[1], '123456789');
await assert.rejects(db.startRound(round, '123456789', 'mines', -1, {}), /wager/);
await assert.rejects(db.transfer(op, '123456789', '123456789', 1), /transfer/);
await assert.rejects(db.advanceRound(op, round, '123456789', 0, {}, -1), /payout/);
await assert.rejects(db.adjust(op, '123456789', 'invalid', 200), /action/);
assert.deepEqual(calls[9].params, [round, '123456789']);
assert.equal(calls.length, 11, 'invalid input must not reach database');
console.log('Postgres economy adapter passed');
let activeQueries = 0;
const activeStore = new PostgresEconomy({ async query(sql, params) {
  activeQueries++;
  assert.match(sql, /game_type = 'mines'|game_type = 'blackjack'|game_type = 'crash'/);
  assert.deepEqual(params, ['123456789']);
  return { rows: [{ round_id: 'round', discord_user_id: '123456789', game_type: 'mines', wager: '200', game_state: { bombs: 3 }, status: 'active', version: '2', balance_after_wager: '800' }] };
} });
assert.equal((await activeStore.loadActiveMines('123456789')).balanceAfterWager, 800);
assert.equal((await activeStore.loadActiveBlackjack('123456789')).balanceAfterWager, 800);
assert.equal((await activeStore.loadActiveCrash('123456789')).balanceAfterWager, 800);
assert.equal(activeQueries, 3);

// Rakeback tests
let docStore = { 'rakeback/123456789': { claimedWager: 0, lifetimeClaimed: 0, claims: {} } };
let walletBalance = 1000n;
let walletTotalBet = 2000n;
const rakebackClient = {
  async query(sql, params) {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
    if (sql.includes('RETURNING discord_user_id')) {
      return { rows: [{ discord_user_id: params[0], balance: walletBalance.toString(), total_bet: walletTotalBet.toString(), total_won: '0', games_played: '1', last_daily: null, xp: '0', level: 1, created_at: new Date('2026-01-01T00:00:00Z'), username: 'Player', avatar_url: null }] };
    }
    if (sql.includes('FROM moonflip_private.documents WHERE key = $1')) {
      const val = docStore[params[0]];
      return { rows: val ? [{ value: structuredClone(val) }] : [] };
    }
    if (sql.includes('INSERT INTO moonflip_private.documents')) {
      if (!docStore[params[0]]) docStore[params[0]] = JSON.parse(params[1]);
      return { rows: [] };
    }
    if (sql.includes('UPDATE moonflip_private.documents')) {
      docStore[params[0]] = JSON.parse(params[1]);
      return { rows: [] };
    }
    if (sql.includes('FROM moonflip_private.wallets WHERE discord_user_id = $1 FOR UPDATE')) {
      return { rows: [{ balance: walletBalance.toString(), total_bet: walletTotalBet.toString() }] };
    }
    if (sql.includes('UPDATE moonflip_private.wallets SET balance')) {
      walletBalance += BigInt(params[1]);
      return { rows: [] };
    }
    if (sql.includes('AS excluded_wager')) return { rows: [{ excluded_wager: '0' }] };
    throw new Error('unexpected rakeback query: ' + sql);
  },
  release() {}
};
const rakebackPool = {
  async query(sql, params) { return rakebackClient.query(sql, params); },
  async connect() { return rakebackClient; }
};
const rakebackEconomy = new PostgresEconomy(rakebackPool);
const rbInfo = await rakebackEconomy.getRakeback('123456789');
assert.equal(rbInfo.totalWagered, 2000);
assert.equal(rbInfo.claimedWager, 0);
assert.equal(rbInfo.available, 10); // 2000 * 0.005 = 10 tokens

const claimOp = '00000000-0000-4000-8000-000000000301';
const claimRes = await rakebackEconomy.claimRakeback(claimOp, '123456789');
assert.equal(claimRes.success, true);
assert.equal(claimRes.applied, true);
assert.equal(claimRes.amount, 10);
assert.equal(claimRes.balance, 1010);
assert.equal(walletBalance, 1010n);

// Replay with identical operationId is idempotent
const replayRes = await rakebackEconomy.claimRakeback(claimOp, '123456789');
assert.equal(replayRes.success, true);
assert.equal(replayRes.applied, false);
assert.equal(replayRes.amount, 10);
assert.equal(replayRes.balance, 1010);

// Second claim with new op has 0 available
const claimOp2 = '00000000-0000-4000-8000-000000000302';
const secondRes = await rakebackEconomy.claimRakeback(claimOp2, '123456789');
assert.equal(secondRes.success, false);
assert.equal(secondRes.amount, 0);
console.log('Postgres economy rakeback tests passed');
