import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
const { addXp } = await import('../src/games/levels.js');
const { economyEvents, getBalance } = await import('../src/games/economy.js');

const userId = 'isolated-level-balance-test';
const before = getBalance(userId);
await new Promise((resolve) => setImmediate(resolve));
const events = [];
economyEvents.on('balanceChanged', (event) => events.push(event));
const result = addXp(userId, 100);
await new Promise((resolve) => setImmediate(resolve));
assert.equal(getBalance(userId), before + result.tokenBonus);
assert.ok(events.some((event) => event.userId === userId && event.balance === before + result.tokenBonus),
  'Level bonus must notify connected wallet clients');
console.log('Level bonus wallet sync passed');
