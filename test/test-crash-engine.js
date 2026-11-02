import express from 'express';
import http from 'http';
import assert from 'assert';
import { setupPlayApi, webPlaySessions, activeWebCrash, createWebPlaySession } from '../src/web/playApi.js';
import { getCrashLeaderboard, recordCrashWin, flushCrashLeaderboardSync } from '../src/games/crashLeaderboard.js';
import { getBalance, setBalance } from '../src/games/economy.js';

const app = express();
app.use(express.json());
setupPlayApi(app);

const server = http.createServer(app);

async function startServer() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function request(baseUrl, path, method = 'GET', body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-play-token'] = token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== Starting Orbital Crash Engine & Leaderboard Test Suite ===\n');

  const baseUrl = await startServer();
  const testUserId = 'test_crash_user_' + Date.now();
  const testToken = 'crash_token_' + Date.now();

  // Initialize test user wallet to exact 10,000 tokens
  setBalance(testUserId, 10000);

  // Authenticate session
  webPlaySessions.set(testToken, {
    userId: testUserId,
    username: 'OrbitalPilot',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
  });

  try {
    // -----------------------------------------------------------------------
    // Test 1: Start a Crash Flight & Verify Security (No Leaked CrashPoint)
    // -----------------------------------------------------------------------
    console.log('--- Test 1: Start Crash Flight & Secret Verification ---');
    const startRes = await request(baseUrl, '/api/play/crash/start', 'POST', {
      wager: 250,
      autoCashout: 2.5,
    }, testToken);

    assert.strictEqual(startRes.status, 200, 'Start flight should return 200');
    assert.strictEqual(startRes.data.success, true, 'Flight start success should be true');
    assert.ok(startRes.data.flightId, 'Should return flightId');
    assert.strictEqual(startRes.data.wager, 250, 'Wager should match 250');
    assert.strictEqual(startRes.data.autoCashout, 2.5, 'AutoCashout should match 2.5');
    assert.strictEqual(startRes.data.balance, 9750, 'Balance should deduct 250 tokens');
    assert.strictEqual(startRes.data.crashPoint, undefined, 'CRITICAL: Server must NEVER leak crashPoint to client!');
    console.log('  [PASS] Flight started successfully, crashPoint is fully protected.');

    const flightId1 = startRes.data.flightId;

    // -----------------------------------------------------------------------
    // Test 2: Successful Manual Cashout & Leaderboard Recording
    // -----------------------------------------------------------------------
    console.log('\n--- Test 2: In-Flight Cashout & Wallet Payout ---');
    // Wait brief flight duration
    await new Promise((r) => setTimeout(r, 120));

    const cashoutRes = await request(baseUrl, '/api/play/crash/cashout', 'POST', {
      flightId: flightId1,
    }, testToken);

    assert.strictEqual(cashoutRes.status, 200, 'Cashout should return 200');
    assert.strictEqual(cashoutRes.data.success, true, 'Cashout success should be true');
    assert.strictEqual(cashoutRes.data.cashedOut, true, 'CashedOut flag should be true');
    assert.ok(cashoutRes.data.multiplier >= 1.01, 'Multiplier should be >= 1.01');
    assert.ok(cashoutRes.data.winAmount >= 250, 'Win amount should be >= initial wager');
    assert.ok(cashoutRes.data.balance >= 9750 + cashoutRes.data.winAmount, 'Balance should be credited');
    console.log(`  [PASS] Cashed out at ${cashoutRes.data.multiplier}x with payout ${cashoutRes.data.winAmount} 🪙.`);

    // -----------------------------------------------------------------------
    // Test 3: Stale / Duplicate Cashout Rejection
    // -----------------------------------------------------------------------
    console.log('\n--- Test 3: Stale / Duplicate Cashout Prevention ---');
    const dupRes = await request(baseUrl, '/api/play/crash/cashout', 'POST', {
      flightId: flightId1,
    }, testToken);

    assert.strictEqual(dupRes.status, 400, 'Duplicate cashout must be rejected with 400');
    console.log('  [PASS] Duplicate cashout rejected correctly:', dupRes.data.error);

    // -----------------------------------------------------------------------
    // Test 4: Crash Leaderboard Recording & Querying
    // -----------------------------------------------------------------------
    console.log('\n--- Test 4: Crash Leaderboard Integration ---');
    // Inject a high record directly to test ranking
    recordCrashWin({
      userId: 'cosmic_whale_1',
      username: 'GalacticKing',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/4.png',
      wager: 5000,
      multiplier: 142.80,
      payout: 714000,
      profit: 709000,
    });

    flushCrashLeaderboardSync();

    const lbRes = await request(baseUrl, '/api/play/crash/leaderboard', 'GET');
    assert.strictEqual(lbRes.status, 200, 'Crash leaderboard API should return 200');
    assert.ok(Array.isArray(lbRes.data.topMultipliers), 'topMultipliers should be array');
    assert.ok(Array.isArray(lbRes.data.topPayouts), 'topPayouts should be array');
    assert.ok(Array.isArray(lbRes.data.topPlayers), 'topPlayers should be array');
    assert.ok(Array.isArray(lbRes.data.recentWins), 'recentWins should be array');

    const topMult = lbRes.data.topMultipliers[0];
    assert.strictEqual(topMult.username, 'GalacticKing');
    assert.strictEqual(topMult.multiplier, 142.80);
    console.log(`  [PASS] Leaderboard top multiplier verified: ${topMult.username} with ${topMult.multiplier}x.`);

    // -----------------------------------------------------------------------
    // Test 5: User Profile returns activeCrash & crashHistory
    // -----------------------------------------------------------------------
    console.log('\n--- Test 5: Profile Crash Telemetry ---');
    const profileRes = await request(baseUrl, '/api/play/profile', 'GET', null, testToken);
    assert.strictEqual(profileRes.status, 200, 'Profile should return 200');
    assert.ok(Array.isArray(profileRes.data.crashHistory), 'Profile should contain crashHistory array');
    console.log('  [PASS] Profile returned crashHistory count:', profileRes.data.crashHistory.length);

    // -----------------------------------------------------------------------
    // Test 6: Stateless HMAC Token Survives In-Memory Wipe (Server Restart)
    // -----------------------------------------------------------------------
    console.log('\n--- Test 6: Stateless HMAC Token Persistence Across Restarts ---');
    const signedToken = createWebPlaySession(testUserId, 'PersistentPilot', 'https://cdn.discordapp.com/embed/avatars/1.png');
    // Simulate a full server restart / Render redeploy by clearing all in-memory sessions
    webPlaySessions.clear();

    const restartProfileRes = await request(baseUrl, '/api/play/profile', 'GET', null, signedToken);
    assert.strictEqual(restartProfileRes.status, 200, 'Profile after restart should return 200');
    assert.strictEqual(restartProfileRes.data.authenticated, true, 'Token must remain authenticated after server restart!');
    assert.strictEqual(restartProfileRes.data.userId, testUserId, 'UserId must match after server restart');
    assert.strictEqual(restartProfileRes.data.username, 'PersistentPilot', 'Username must match after server restart');
    console.log('  [PASS] Stateless HMAC token survived in-memory wipe with full Discord wallet sync.');

    // -----------------------------------------------------------------------
    // Test 7: 24/7 Continuous Multiplayer Crash State & Betting
    // -----------------------------------------------------------------------
    console.log('\n--- Test 7: 24/7 Continuous Crash Arena State & Betting ---');
    const stateRes = await request(baseUrl, '/api/play/crash/state', 'GET', null, signedToken);
    assert.strictEqual(stateRes.status, 200, 'Crash state should return 200');
    assert.ok(['BETTING', 'IN_FLIGHT', 'CRASHED'].includes(stateRes.data.phase), 'Valid continuous phase required');
    assert.ok(Array.isArray(stateRes.data.players), 'Players telemetry list should be an array');

    const betRes = await request(baseUrl, '/api/play/crash/bet', 'POST', { wager: 100, autoCashout: 2.0 }, signedToken);
    assert.strictEqual(betRes.status, 200, 'Continuous Crash bet/queue should return 200');
    assert.strictEqual(betRes.data.success, true, 'Continuous Crash bet/queue should succeed');
    assert.ok(['placed', 'queued'].includes(betRes.data.status), 'Status should be placed or queued');
    console.log(`  [PASS] Continuous Crash Engine active in phase "${stateRes.data.phase}", bet status: "${betRes.data.status}".`);

    console.log('\n=== ALL CRASH TESTS PASSED SUCCESSFULLY! ===\n');
  } catch (err) {
    console.error('Test failed:', err);
    process.exitCode = 1;
  } finally {
    server.close();
  }
}

runTests();
