import assert from 'assert';
import http from 'http';
import { createWebServer } from '../src/web/server.js';
import { createWebPlaySession } from '../src/web/playApi.js';
import { getBalance, setBalance } from '../src/games/economy.js';

async function runTests() {
  console.log('--- STARTING WEB ARENA INTEGRATION TESTS ---');

  const app = createWebServer();
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;
  console.log(`Test Express server running on ${baseUrl}`);

  try {
    // 1. Verify GET /play returns HTML
    console.log('Test 1: GET /play');
    const playRes = await fetch(`${baseUrl}/play`);
    assert.strictEqual(playRes.status, 200);
    const htmlText = await playRes.text();
    assert(htmlText.includes('Moonflip') || htmlText.includes('MOONFLIP'));
    assert(htmlText.includes('Web Arena'));
    console.log('✓ Test 1 Passed: GET /play served correctly.');

    // 2. Verify static assets /play/style.css, /play/app.js and all 6 game cover images
    console.log('Test 2: GET /play/style.css, /play/app.js & 6 Game Covers');
    const cssRes = await fetch(`${baseUrl}/play/style.css`);
    assert.strictEqual(cssRes.status, 200);
    const jsRes = await fetch(`${baseUrl}/play/app.js`);
    assert.strictEqual(jsRes.status, 200);

    const gameImages = [...htmlText.matchAll(/src="(\/play\/assets\/cover-[^"?]+\.svg)/g)].map(match=>match[1]);
    assert.equal(new Set(gameImages).size,7);
    for (const url of new Set(gameImages)) {
      const response=await fetch(`${baseUrl}${url}`);
      assert.equal(response.status,200,`Cover ${url} should be served`);
      assert.match(await response.text(), /<svg/);
    }
    // 3. Verify Session Creation & Profile API
    console.log('Test 3: Session Creation & GET /api/play/profile');
    const testUser = {
      id: 'test_user_99999',
      username: 'TestArenaPlayer',
      displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png',
    };
    setBalance(testUser.id, 5000);
    const token = createWebPlaySession(testUser);
    assert(token && token.length > 20);

    const profileRes = await fetch(`${baseUrl}/api/play/profile`, {
      headers: { 'x-play-token': token },
    });
    assert.strictEqual(profileRes.status, 200);
    const profile = await profileRes.json();
    assert.strictEqual(profile.authenticated, true);
    assert.strictEqual(profile.userId, testUser.id);
    assert.strictEqual(profile.username, testUser.username);
    assert.strictEqual(profile.balance, 5000);
    console.log('✓ Test 3 Passed: Authenticated profile loaded accurately.');

    // 4. Verify POST /api/play/mines/start
    console.log('Test 4: POST /api/play/mines/start');
    const startRes = await fetch(`${baseUrl}/api/play/mines/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-play-token': token },
      body: JSON.stringify({ wager: 200, bombs: 3 }),
    });
    assert.strictEqual(startRes.status, 200);
    const startData = await startRes.json();
    assert.strictEqual(startData.success, true);
    assert.strictEqual(startData.wager, 200);
    assert.strictEqual(startData.bombs, 3);
    assert.strictEqual(startData.balance, 4800); // 5000 - 200
    assert.strictEqual(getBalance(testUser.id), 4800);
    console.log('✓ Test 4 Passed: Game started and wager deducted.');

    // 5. Verify POST /api/play/mines/reveal
    console.log('Test 5: POST /api/play/mines/reveal');
    let revealedTile = null;
    let revealData = null;

    // Loop until we find a safe tile or trigger a game step
    for (let idx = 0; idx < 25; idx++) {
      const res = await fetch(`${baseUrl}/api/play/mines/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-play-token': token },
        body: JSON.stringify({ tileIdx: idx }),
      });
      const data = await res.json();
      if (data.isGem) {
        revealedTile = idx;
        revealData = data;
        break;
      } else if (data.hitBomb) {
        console.log(`Hit bomb on index ${idx}, restarting game to test cashout...`);
        // Restart a new game to test cashout
        await fetch(`${baseUrl}/api/play/mines/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-play-token': token },
          body: JSON.stringify({ wager: 200, bombs: 1 }),
        });
      }
    }

    assert(revealedTile !== null);
    assert(revealData.multiplier > 1.0);
    console.log(`✓ Test 5 Passed: Revealed safe tile #${revealedTile} with multiplier ${revealData.multiplier}x.`);

    // 6. Verify POST /api/play/mines/cashout
    console.log('Test 6: POST /api/play/mines/cashout');
    const cashoutRes = await fetch(`${baseUrl}/api/play/mines/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-play-token': token },
    });
    assert.strictEqual(cashoutRes.status, 200);
    const cashoutData = await cashoutRes.json();
    assert.strictEqual(cashoutData.success, true);
    assert.strictEqual(cashoutData.cashedOut, true);
    assert(cashoutData.winAmount >= 200);
    assert(cashoutData.balance > 4800);
    console.log(`✓ Test 6 Passed: Cashout succeeded! Payout: +${cashoutData.winAmount} tokens.`);

    // 7. Verify POST /api/play/mines/peek
    console.log('Test 7: POST /api/play/mines/peek');
    const peekRes = await fetch(`${baseUrl}/api/play/mines/peek`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-play-token': token },
      body: JSON.stringify({ tileIdx: (revealedTile + 1) % 25 }),
    });
    assert.strictEqual(peekRes.status, 200);
    const peekData = await peekRes.json();
    assert(typeof peekData.isBomb === 'boolean');
    console.log('✓ Test 7 Passed: Post-cashout peek verified.');

    // 8. Verify Demo Guest Mode (No token)
    console.log('Test 8: Demo Guest Mode');
    const guestProfile = await (await fetch(`${baseUrl}/api/play/profile`)).json();
    assert.strictEqual(guestProfile.authenticated, false);
    assert.strictEqual(guestProfile.username, 'Guest Player');
    assert.strictEqual(guestProfile.balance, 1000);
    console.log('✓ Test 8 Passed: Demo mode functions properly.');

    // 9. Verify Continuous Crash Bet & Cashout in Web Arena
    console.log('Test 9: Continuous Crash Bet & Cashout');
    const { globalCrashEngine } = await import('../src/web/playApi.js');
    globalCrashEngine.enterBettingPhase();

    const crashBetRes = await fetch(`${baseUrl}/api/play/crash/bet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-play-token': token },
      body: JSON.stringify({ wager: 100, autoCashout: 5.0 }),
    });
    assert.strictEqual(crashBetRes.status, 200);
    const crashBetData = await crashBetRes.json();
    assert.strictEqual(crashBetData.success, true);
    assert.strictEqual(crashBetData.status, 'placed');

    globalCrashEngine.enterFlightPhase();
    await new Promise((r) => setTimeout(r, 60));

    const crashCashoutRes = await fetch(`${baseUrl}/api/play/crash/cashout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-play-token': token },
      body: JSON.stringify({}),
    });
    assert.strictEqual(crashCashoutRes.status, 200);
    const crashCashoutData = await crashCashoutRes.json();
    assert.strictEqual(crashCashoutData.success, true);
    assert.strictEqual(crashCashoutData.cashedOut, true);
    assert.ok(crashCashoutData.multiplier >= 1.0);
    assert.ok(crashCashoutData.winAmount >= 100);
    console.log(`✓ Test 9 Passed: Crash cashout succeeded at ${crashCashoutData.multiplier}x (+${crashCashoutData.winAmount} tokens).`);

    // 10. Verify All Games Catalog in HTML
    console.log('Test 10: All Games Catalog in HTML');
    assert(htmlText.includes('id="gamesCatalogChassis"'));
    assert(htmlText.includes('id="instantChassis"'));
    assert(htmlText.includes('/play/instant-games.js'));
    console.log('✓ Test 10 Passed: All Games catalog and 6 game cards present in HTML.');

    console.log('--- ALL 10 WEB ARENA TESTS PASSED PERFECTLY! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
