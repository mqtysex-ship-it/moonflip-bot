import assert from 'node:assert/strict';
import { createCoinflipPreferences } from '../src/games/coinflipPreferences.js';

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

const prefs = createCoinflipPreferences(store);
await prefs.save('user_1', 4);
assert.equal(await createCoinflipPreferences(store).load('user_1'), 4);

const failing = createCoinflipPreferences({
  ...store,
  async update() {
    throw new Error('database unavailable');
  },
});
await assert.rejects(failing.save('user_1', 5), /database unavailable/);
assert.equal(await prefs.load('user_1'), 4);
console.log('Coinflip preferences survive reload and fail closed');
