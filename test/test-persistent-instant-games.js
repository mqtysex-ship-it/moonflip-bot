import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const module = await import('../src/games/persistentInstantGames.js').catch(()=>({}));
assert.equal(typeof module.PersistentInstantGames,'function','durable instant-game service must exist');
if(process.env.MOONFLIP_DB_INTEGRATION !== '1') {
  console.log('Live PostgreSQL tests require MOONFLIP_DB_INTEGRATION=1');
} else {
  const {databasePool:pool,closeDatabase}=await import('../src/database.js');
  assert(pool,'PostgreSQL connection required');
  const {PersistentInstantGames}=module;
  const games=new PersistentInstantGames(pool);
  const user='00'+BigInt('0x'+randomUUID().replaceAll('-','').slice(0,14)).toString().padStart(18,'0'); const other='00'+BigInt('0x'+randomUUID().replaceAll('-','').slice(0,14)).toString().padStart(18,'0');
  let inserted=false;
  const ids=[];
  const play=(service,game,params,who=user)=>{if(!ids.includes(params.roundId))ids.push(params.roundId);return service.play(who,game,params);};
  try {
    await pool.query('INSERT INTO moonflip_private.wallets(discord_user_id,balance) VALUES ($1,1000),($2,1000)',[user,other]);
    inserted=true;
    const roundId=randomUUID();
    const request={roundId,wager:100,choice:'heads'};
    const results=await Promise.all(Array.from({length:5},()=>play(games,'coinflip',request)));
    assert(results.every(x=>x.outcome===results[0].outcome && x.payout===results[0].payout));
    const wallet=await pool.query('SELECT * FROM moonflip_private.wallets WHERE discord_user_id=$1',[user]);
    assert.equal(Number(wallet.rows[0].balance),900+results[0].payout);
    assert.equal(Number(wallet.rows[0].games_played),1);
    assert.equal(Number(wallet.rows[0].total_bet),100);
    const recovered=await play(new PersistentInstantGames(pool),'coinflip',request);
    assert.equal(recovered.outcome,results[0].outcome);
    await assert.rejects(play(games,'coinflip',{...request,choice:'tails'}),/different/);
    await assert.rejects(play(games,'coinflip',request,other),/different/);
    const badId=randomUUID();
    await assert.rejects(play(games,'plinko',{roundId:badId,wager:1000000,rows:16,risk:'high'}),/insufficient/i);
    assert.equal((await pool.query('SELECT 1 FROM moonflip_private.game_rounds WHERE round_id=$1',[badId])).rows.length,0,'failed wager rolls back result');
    const race=await Promise.allSettled(Array.from({length:4},()=>play(games,'coinflip',{roundId:randomUUID(),wager:1000,choice:'heads'},other)));
    const paid=race.filter(x=>x.status==='fulfilled');
    const expected=1000+paid.reduce((sum,x)=>sum+x.value.payout-1000,0);
    assert.equal(Number((await pool.query('SELECT balance FROM moonflip_private.wallets WHERE discord_user_id=$1',[other])).rows[0].balance),expected);
    const plinko=await play(games,'plinko',{roundId:randomUUID(),wager:10,rows:16,risk:'high'});
    assert.equal(plinko.bucket,plinko.path.reduce((a,b)=>a+b,0));
    assert.equal((await games.history(user)).length,2);
    const activity=await games.activity();
    assert(activity.some(r=>['Coinflip','Plinko'].includes(r.gameName)));
    assert(activity.every(r=>!('userId' in r)&&!('balance' in r)&&!('path' in r)));
    const disconnected=new PersistentInstantGames({async connect(){throw new Error('database unavailable');}});
    await assert.rejects(disconnected.play(user,'coinflip',{roundId:randomUUID(),wager:100,choice:'heads'}),/unavailable/);
    const {default:express}=await import('express');
    const {EventEmitter}=await import('node:events');
    const {setupInstantGameApi}=await import('../src/web/instantGameApi.js');
    const events=new EventEmitter(),updates=[],activityEvents=[];
    events.on('balanceChanged',event=>updates.push(event));
    const app=express();app.use(express.json());
    setupInstantGameApi(app,{pool,economyEvents:events,onRound:r=>activityEvents.push(r),resolvePlayer:async()=>({authenticated:true,session:{userId:user,username:'Fixture'}})});
    const server=app.listen(0);await new Promise(r=>server.once('listening',r));
    try {
      const apiUrl=`http://127.0.0.1:${server.address().port}`;
      const body=JSON.stringify({roundId:randomUUID(),wager:10,choice:'tails'});
      const post=()=>fetch(apiUrl+'/api/play/coinflip/play',{method:'POST',headers:{'Content-Type':'application/json'},body});
      const firstResponse=await post(); assert.equal(firstResponse.status,200);
      const first=await firstResponse.json();
      const replay=await(await post()).json();
      assert.equal(replay.roundId,first.roundId);assert.equal(replay.payout,first.payout);
      assert.equal(updates.length,1,'wallet event occurs once after committed round');
      assert.equal(activityEvents.length,1,'replayed rounds do not duplicate activity');
      assert.equal(updates[0].balance,first.balance);
      const feed=await(await fetch(apiUrl+'/api/play/instant/activity')).json();
      assert(feed.rounds.some(r=>r.gameName==='Coinflip'));
    } finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
    console.log('PostgreSQL atomic settlement, concurrent retries, restart recovery, rollback and fail-closed checks passed');
  } finally {
    if(inserted) await pool.query('DELETE FROM moonflip_private.game_rounds WHERE discord_user_id=ANY($1::text[])',[[user,other]]);
    if(inserted) await pool.query('DELETE FROM moonflip_private.wallets WHERE discord_user_id=ANY($1::text[])',[[user,other]]);
    await closeDatabase();
  }
}
