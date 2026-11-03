import assert from 'node:assert/strict';
import { createCrashPreferences } from '../src/games/crashPreferences.js';
let saved = {};
const store = {
  async read(_key, fallback) { return structuredClone(Object.keys(saved).length ? saved : fallback); },
  async update(_key, _fallback, fn) { const draft = structuredClone(saved); const result = fn(draft); saved = draft; return result; },
};
const prefs = createCrashPreferences(store);
await prefs.save('123', { betAmount: 200, autoCashout: 2, streak: 1 });
assert.deepEqual(await createCrashPreferences(store).load('123'), { betAmount: 200, autoCashout: 2, streak: 1 });
const failing = createCrashPreferences({ ...store, async update() { throw new Error('database unavailable'); } });
await assert.rejects(failing.save('123', { betAmount: 500 }), /database unavailable/);
assert.equal((await prefs.load('123')).betAmount, 200);
console.log('Crash preferences survive reload and fail closed');
