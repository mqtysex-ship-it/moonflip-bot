import { PersistentInstantGames } from '../games/persistentInstantGames.js';
import { plinkoMultipliers } from '../games/instantGames.js';
export function setupInstantGameApi(app,{resolvePlayer,pool,economyEvents,onRound}) {
  const games=pool?new PersistentInstantGames(pool):null;
  app.get('/api/play/instant/config',(_req,res)=>res.json({coinflip:{winMultiplier:1.92,houseEdge:.04},
    plinko:Object.fromEntries(Array.from({length:9},(_,i)=>[i+8,Object.fromEntries(['low','medium','high'].map(risk=>[risk,plinkoMultipliers(i+8,risk)]))])),maxWager:1000000,minWager:10}));
  for(const game of ['coinflip','plinko']) app.post(`/api/play/${game}/play`,async(req,res)=>{
    try {
      const player=await resolvePlayer(req);
      if(!player.authenticated) return res.status(401).json({error:'Link your Discord wallet to play.'});
      if(!games) return res.status(503).json({error:'Game storage is unavailable. No wager was accepted.'});
      const result=await games.play(player.session.userId,game,req.body || {});
      // Never publish an uncommitted wallet change or trigger side effects on replay.
      if(result.applied) {
        try {
          economyEvents?.emit('balanceChanged',{userId:player.session.userId,balance:result.balance,action:game,amount:result.profit});
          onRound?.({gameName:game==='coinflip'?'Coinflip':'Plinko',username:player.session.username,avatarUrl:player.session.avatarUrl,
            wager:result.wager,payout:result.payout,profit:result.profit,multiplier:result.multiplier,timestamp:Date.now()});
        } catch(error) { console.error('[Instant game event]',error.message); }
      }
      res.json(result);
    } catch(error) {
      const invalid=/Wager must|Choose |valid round ID|different parameters/.test(error.message);
      const insufficient=/insufficient balance/i.test(error.message);
      if(invalid || insufficient) return res.status(400).json({error:insufficient?'Insufficient balance.':error.message});
      console.error('[Instant game settlement]',error.code || error.message);
      res.status(503).json({error:'Could not confirm the round. Retry the same request to recover its result.'});
    }
  });
  app.get('/api/play/instant/activity',async(_req,res)=>{
    if(!games) return res.status(503).json({error:'Game storage is unavailable.'});
    try { res.json({rounds:await games.activity()}); }
    catch { res.status(503).json({error:'Game activity is unavailable.'}); }
  });
  app.get('/api/play/instant/history',async(req,res)=>{
    try {
      const player=await resolvePlayer(req);
      if(!player.authenticated) return res.status(401).json({error:'Link your Discord wallet to view your rounds.'});
      if(!games) return res.status(503).json({error:'Game storage is unavailable.'});
      res.json({rounds:await games.history(player.session.userId)});
    } catch { res.status(503).json({error:'Round history is unavailable. Please retry.'}); }
  });
}
