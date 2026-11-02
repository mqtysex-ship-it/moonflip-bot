import assert from 'node:assert/strict';
const rules = await import('../src/games/instantGames.js').catch(() => ({}));
assert.equal(typeof rules.resolveInstantGame, 'function', 'server-owned instant-game rules must exist');
const { resolveInstantGame, validateInstantBet, plinkoMultipliers } = rules;
assert.deepEqual(resolveInstantGame('coinflip', 100, {choice:'heads'}, () => 0), {choice:'heads',outcome:'heads',multiplier:1.92,payout:192});
assert.equal(resolveInstantGame('coinflip', 100, {choice:'tails'}, () => 0).payout, 0);
assert.equal(resolveInstantGame('coinflip', 100, {choice:'tails'}, () => 1).payout, 192);
for (const rows of [8,9,10,11,12,13,14,15,16]) for (const risk of ['low','medium','high']) {
  const m = plinkoMultipliers(rows,risk);
  assert.equal(m.length,rows+1);
  assert.deepEqual(m,[...m].reverse());
  let combinations=1, rtp=0;
  for(let k=0;k<=rows;k++){ if(k) combinations=combinations*(rows-k+1)/k; rtp += combinations/(2**rows)*m[k]; }
  assert(rtp<=0.96 && rtp>0.95999, `${rows}/${risk}: RTP ${rtp}`);
  const result=resolveInstantGame('plinko',100,{rows,risk},()=>1);
  assert.equal(result.bucket,rows); assert.equal(result.path.length,rows);
  assert.equal(result.payout,Math.floor(100*m[rows]));
}
for(const wager of [-1,0,9,1.5,NaN,Infinity,'100',Number.MAX_SAFE_INTEGER]) assert.throws(()=>validateInstantBet('coinflip',{wager,choice:'heads'}));
assert.throws(()=>validateInstantBet('coinflip',{wager:100,choice:'edge'}));
assert.throws(()=>validateInstantBet('plinko',{wager:100,rows:7,risk:'high'}));
assert.throws(()=>validateInstantBet('plinko',{wager:100,rows:16,risk:'extreme'}));
console.log('Instant game rules and all 27 Plinko RTP profiles passed');
