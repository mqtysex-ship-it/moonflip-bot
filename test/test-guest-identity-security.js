import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { setupPlayApi, webPlaySessions, globalCrashEngine, shutdownWebCrash } from '../src/web/playApi.js';
import { economyEvents } from '../src/games/economy.js';

const app = express(); app.use(express.json()); setupPlayApi(app);
const server = createServer(app); await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const victim = '123456789012345678';
webPlaySessions.set('victim-test', {userId:victim, username:'Victim', demoBalance:1000});
try {
  await globalCrashEngine.enterBettingPhase();
  const bet = await fetch(`${base}/api/play/crash/bet`, {method:'POST',headers:{'content-type':'application/json','x-play-token':'victim-test'},body:JSON.stringify({wager:10})});
  assert.equal(bet.status, 200);
  assert.equal((await bet.json()).success, true);
  assert(globalCrashEngine.bets.has(victim), 'victim must have an active bet');
  globalCrashEngine.phase = 'IN_FLIGHT'; globalCrashEngine.flightStartTime = Date.now(); globalCrashEngine.flightDurationMs = 60000; globalCrashEngine.crashPoint = 10;
  const attack = await fetch(`${base}/api/play/crash/cashout`, {method:'POST',headers:{'content-type':'application/json','x-guest-id':victim},body:'{}'});
  assert.notEqual((await attack.json()).success, true, 'guest must not cash out another user’s bet');
  assert.equal(globalCrashEngine.bets.get(victim).cashedOut, false);
  const controller = new AbortController();
  const stream = await fetch(`${base}/api/play/stream?guestId=${victim}`, {signal:controller.signal});
  const reader = stream.body.getReader(); await reader.read();
  economyEvents.emit('balanceChanged',{userId:victim,balance:123,action:'test',amount:1});
  const event = await Promise.race([reader.read().then(x => new TextDecoder().decode(x.value)),new Promise(r=>setTimeout(()=>r(''),100))]);
  assert.doesNotMatch(event, /event: wallet/, 'guest must not receive wallet events');
  controller.abort();
} finally { await shutdownWebCrash(); server.closeAllConnections(); await new Promise(r=>server.close(r)); }
console.log('Guest identity isolation passed');
process.exit(0);
