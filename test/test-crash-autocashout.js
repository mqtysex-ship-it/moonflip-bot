import assert from 'node:assert/strict';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
const { globalCrashEngine: engine } = await import('../src/web/playApi.js');
const session = { userId: 'isolated-crash', username: 'Test', demoBalance: 900 };
engine.bets.clear();
const bet = { key: 'isolated-crash', userId: session.userId, username: session.username,
  session, authenticated: false, isAmbient: false, wager: 100, autoCashout: 1.5, cashedOut: false };
engine.bets.set(bet.key, bet);
engine.phase = 'IN_FLIGHT';
engine.crashPoint = 1.51;
engine.enterCrashedPhase();
assert.equal(bet.cashedOut, true, 'A target reached between ticks must be paid');
assert.equal(session.demoBalance, 1050);
engine.enterCrashedPhase();
assert.equal(session.demoBalance, 1050, 'Payout must not be credited twice');
console.log('Crash auto cashout settlement passed');
