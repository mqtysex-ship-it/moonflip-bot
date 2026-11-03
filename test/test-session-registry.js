import assert from 'node:assert/strict';
import { createSessionRegistry } from '../src/web/sessionRegistry.js';
const entries = new Map();
const registry = createSessionRegistry({
  async read(key) { return entries.get(key); },
  async write(key, value) { entries.set(key, value); },
});
await registry.activate('123', 'old');
assert.equal(await registry.isActive('123', 'old'), true);
await registry.activate('123', 'new');
assert.equal(await registry.isActive('123', 'old'), false);
assert.equal(await registry.isActive('123', 'new'), true);
console.log('Session replacement revokes previous access');
