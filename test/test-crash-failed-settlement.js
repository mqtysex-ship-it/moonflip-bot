import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Isolated test only');
const { globalCrashEngine } = await import('../src/web/playApi.js');
const session = { get demoBalance() { throw new Error('settlement unavailable'); } };
const bet = { wager: 100, authenticated: false, isAmbient: false, session, cashedOut: false };
await assert.rejects(globalCrashEngine.executeBetCashout(bet, 2), /settlement unavailable/);
assert.equal(bet.cashedOut, false, 'A failed settlement must remain retryable');
console.log('Crash failed settlement remains retryable');
