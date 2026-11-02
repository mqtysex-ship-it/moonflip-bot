import assert from 'node:assert/strict';
import { PersistentMines } from '../src/games/persistentMines.js';

const rounds = new Map(); const operations = new Map(); let balance = 1000;
const db = {
  async startRound(id, user, game, wager, state) {
    if (rounds.has(id)) return { balance: 800, applied: false };
    balance -= wager; rounds.set(id, { roundId: id, userId: user, game, wager, state: structuredClone(state), status: 'active', version: 0, balanceAfterWager: balance });
    return { balance, applied: true };
  },
  async loadRound(id, user) { const round = rounds.get(id); return round?.userId === user ? structuredClone(round) : null; },
  async advanceRound(op, id, user, version, state, payout) {
    if (operations.has(op)) return { ...operations.get(op), applied: false };
    const round = rounds.get(id);
    if (!round || round.userId !== user) throw new Error('round not found');
    if (round.status !== 'active') throw new Error('round already settled');
    if (round.version !== version) throw new Error('stale game state');
    round.version++; round.state = structuredClone(state);
    if (payout !== null) { balance += payout; round.status = 'settled'; }
    const result = { version: round.version, balance, applied: true }; operations.set(op, { ...result, roundId: id, userId: user, state: structuredClone(state), payout }); return result;
  },
  async loadTransition(op, id, user) { const item = operations.get(op); return item?.roundId === id && item.userId === user ? structuredClone(item) : null; },
};
const service = new PersistentMines(db, () => new Set([0, 1, 2]));
const round = '00000000-0000-4000-8000-000000000701';
const reveal = '00000000-0000-4000-8000-000000000702';
const cashout = '00000000-0000-4000-8000-000000000703';
const started = await service.start(round, '123456789', 200, 3);
assert.equal(started.balance, 800);
assert.equal((await service.start(round, '123456789', 200, 3)).balance, 800);
await assert.rejects(service.start(round, '123456789', 201, 3), /reused/);
assert(!('bombIndices' in started), 'active response must not leak bombs');
await assert.rejects(service.reveal(reveal, round, '123456789', 1.5), /tile/);
const safe = await service.reveal(reveal, round, '123456789', 3);
assert.equal(safe.gameOver, false);
assert(!('bombIndices' in safe));
// A new service instance must recover the game from the shared store.
const restarted = new PersistentMines(db, () => { throw new Error('unexpected new draw'); });
const settled = await restarted.cashout(cashout, round, '123456789');
assert.equal(settled.balance, 800 + settled.payout);
assert.equal(rounds.get(round).status, 'settled');
assert.equal(balance, 800 + settled.payout);
const retry = await restarted.cashout(cashout, round, '123456789');
assert.equal(retry.payout, settled.payout);
assert.equal(balance, 800 + settled.payout);
let firstTransitionLookup = true;
const delayedRetry = new PersistentMines({
  ...db,
  async loadTransition(...args) { if (firstTransitionLookup) { firstTransitionLookup = false; return null; } return db.loadTransition(...args); },
});
assert.equal((await delayedRetry.cashout(cashout, round, '123456789')).payout, settled.payout);
await assert.rejects(restarted.cashout('00000000-0000-4000-8000-000000000704', round, '123456789'), /settled/);
let firstLoad = true;
const racing = new PersistentMines({
  async loadRound() { if (firstLoad) { firstLoad = false; return null; } return structuredClone(rounds.get(round)); },
  async startRound() { throw new Error('round id already used with different parameters'); },
}, () => new Set([5, 6, 7]));
assert.equal((await racing.start(round, '123456789', 200, 3)).balance, 800);
console.log('Persistent Mines recovery and settlement passed');
