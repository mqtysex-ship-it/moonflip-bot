import assert from 'node:assert/strict';
import { createMinesPreferences } from '../src/games/minesPreferences.js';

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

const prefs = createMinesPreferences(store);
await prefs.save('user_1', { bet: 300, bombs: 5 });
assert.deepEqual(await createMinesPreferences(store).load('user_1'), { bet: 300, bombs: 5 });

const failing = createMinesPreferences({
  ...store,
  async update() {
    throw new Error('database unavailable');
  },
});
await assert.rejects(failing.save('user_1', { bet: 500, bombs: 10 }), /database unavailable/);
assert.equal((await prefs.load('user_1')).bet, 300);
console.log('Mines preferences survive reload and fail closed');
