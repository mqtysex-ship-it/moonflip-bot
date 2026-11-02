import assert from 'assert';
import express from 'express';
import http from 'http';
import { setupPlayApi, createWebPlaySession, activeWebMines } from '../src/web/playApi.js';
import { recordMinesWin, getMinesLeaderboard } from '../src/games/minesLeaderboard.js';
import { getBalance, addTokens, setBalance } from '../src/games/economy.js';

console.log('=== Starting Mines Game Race Condition & Leaderboard Test Suite ===');

// Setup mock express app
const app = express();
app.use(express.json());
setupPlayApi(app);

const server = http.createServer(app);

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;
const baseUrl = `http://localhost:${port}`;

const testUser = {
  id: 'test_user_race_123',
  username: 'SpeedyPlayer',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/4.png',
};

setBalance(testUser.id, 50000);
const playToken = createWebPlaySession(testUser);

async function request(path, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'x-play-token': playToken,
  };
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// 1. Test Starting a Game and receiving gameId
console.log('\n--- Test 1: Start Game & Receive Unique Game ID ---');
const start1 = await request('/api/play/mines/start', 'POST', { wager: 200, bombs: 5 });
assert.strictEqual(start1.status, 200, 'Game 1 should start successfully');
assert.ok(start1.data.gameId, 'Response should contain gameId');
const gameId1 = start1.data.gameId;
console.log('  [PASS] Game 1 started with gameId:', gameId1);

// 2. Test Rapid Restart / Stale Action Prevention
console.log('\n--- Test 2: Rapid Replay / Race Condition Prevention ---');
// User immediately starts a new game (clicks Bet again rapidly)
const start2 = await request('/api/play/mines/start', 'POST', { wager: 200, bombs: 3 });
assert.strictEqual(start2.status, 200, 'Game 2 should start successfully');
assert.ok(start2.data.gameId, 'Game 2 should have gameId');
const gameId2 = start2.data.gameId;
assert.notStrictEqual(gameId1, gameId2, 'Game IDs must be unique');
console.log('  [PASS] Game 2 started with new gameId:', gameId2);

// Now simulate a delayed in-flight reveal from Game 1 arriving at the server
const staleReveal = await request('/api/play/mines/reveal', 'POST', { tileIdx: 0, gameId: gameId1 });
assert.strictEqual(staleReveal.status, 400, 'Stale reveal from previous round must be rejected');
console.log('  [PASS] Stale reveal with old gameId was rejected:', staleReveal.data.error);

// Ensure Game 2 is still intact and not detonated
const activeGameAfterStale = activeWebMines.get(testUser.id);
assert.strictEqual(activeGameAfterStale.id, gameId2, 'Active game must still be Game 2');
assert.strictEqual(activeGameAfterStale.gameOver, false, 'Game 2 must not be ended by stale click');
console.log('  [PASS] Game 2 remained untouched and active');

// 3. Test Gameplay & Leaderboard Recording
console.log('\n--- Test 3: Safe Gem Uncovered & Cashout with Leaderboard Recording ---');
// Find a safe gem in Game 2
let safeTile = -1;
for (let i = 0; i < 25; i++) {
  if (!activeGameAfterStale.bombIndices.has(i)) {
    safeTile = i;
    break;
  }
}

const revealSafe = await request('/api/play/mines/reveal', 'POST', { tileIdx: safeTile, gameId: gameId2 });
assert.strictEqual(revealSafe.status, 200, 'Safe tile reveal should succeed');
assert.strictEqual(revealSafe.data.isGem, true, 'Tile should be a safe gem');
console.log('  [PASS] Safe gem revealed, multiplier:', revealSafe.data.multiplier);

// Cash out
const cashout = await request('/api/play/mines/cashout', 'POST', { gameId: gameId2 });
assert.strictEqual(cashout.status, 200, 'Cashout should succeed');
assert.strictEqual(cashout.data.cashedOut, true, 'cashedOut should be true');
console.log('  [PASS] Successfully cashed out, profit:', cashout.data.profit);

// 4. Test GET /api/play/mines/leaderboard
console.log('\n--- Test 4: Retrieve Mines Leaderboard via API ---');
const lbRes = await request('/api/play/mines/leaderboard');
assert.strictEqual(lbRes.status, 200, 'Leaderboard endpoint should return 200');
assert.ok(Array.isArray(lbRes.data.topMultipliers), 'topMultipliers should be array');
assert.ok(Array.isArray(lbRes.data.topPayouts), 'topPayouts should be array');
assert.ok(Array.isArray(lbRes.data.topPlayers), 'topPlayers should be array');
assert.ok(Array.isArray(lbRes.data.recentWins), 'recentWins should be array');

// Check that our win is in recentWins
const ourWin = lbRes.data.recentWins.find((w) => w.userId === testUser.id);
assert.ok(ourWin, 'Our recent win must appear in the leaderboard');
assert.strictEqual(ourWin.username, testUser.username);
console.log('  [PASS] Leaderboard contains our win:', ourWin.username, ourWin.multiplier + 'x', '+' + ourWin.profit + ' 🪙');

// 5. Direct test of recordMinesWin helper
console.log('\n--- Test 5: Direct recordMinesWin and Leaderboard Ordering ---');
const highWin = recordMinesWin({
  userId: 'user_high_roller',
  username: 'MegaWinner',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
  wager: 5000,
  bombs: 10,
  gemsFound: 8,
  multiplier: 85.50,
  payout: 427500,
  profit: 422500,
});

const updatedLb = getMinesLeaderboard();
assert.strictEqual(updatedLb.topMultipliers[0].username, 'MegaWinner', 'Top multiplier should be MegaWinner');
assert.strictEqual(updatedLb.topPayouts[0].username, 'MegaWinner', 'Top payout should be MegaWinner');
console.log('  [PASS] MegaWinner ranked #1 in topMultipliers with', updatedLb.topMultipliers[0].multiplier + 'x');

import { flushLeaderboardSync } from '../src/games/minesLeaderboard.js';
import { flushDbSync } from '../src/games/economy.js';

flushLeaderboardSync();
flushDbSync();
await new Promise((resolve) => server.close(resolve));
console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===\n');
