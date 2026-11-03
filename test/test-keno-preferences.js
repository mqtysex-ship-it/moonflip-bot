import assert from 'node:assert/strict';
import { createKenoPreferences } from '../src/games/kenoPreferences.js';

let saved = {};
const store = {
  async read(_key, fallback) {
    return structuredClone(Object.keys(saved).length ? saved : fallback);
  },
  async update(_key, _fallback, fn) {
    const draft = structuredClone(saved);
    const result = fn(draft);
    saved = draft;
    return result;
  },
};

const prefs = createKenoPreferences(store);
await prefs.save('user_1', {
  betAmount: 250,
  riskMode: 'high',
  picks: new Set([1, 5, 10, 15, 20]),
  lastDrawn: [1, 2, 3, 4, 5, 6, 7],
  streak: 3,
  roundsPlayed: 12,
});

const loaded = await createKenoPreferences(store).load('user_1');
assert.equal(loaded.betAmount, 250);
assert.equal(loaded.riskMode, 'high');
assert.deepEqual(Array.from(loaded.picks).sort((a, b) => a - b), [1, 5, 10, 15, 20]);
assert.deepEqual(loaded.lastDrawn, [1, 2, 3, 4, 5, 6, 7]);
assert.equal(loaded.streak, 3);
assert.equal(loaded.roundsPlayed, 12);

const failing = createKenoPreferences({
  ...store,
  async update() {
    throw new Error('database unavailable');
  },
});
await assert.rejects(failing.save('user_1', { betAmount: 500 }), /database unavailable/);
assert.equal((await prefs.load('user_1')).betAmount, 250);
console.log('Keno preferences survive reload and fail closed');
