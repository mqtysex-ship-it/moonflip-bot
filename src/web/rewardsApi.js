import {PostgresEconomy} from '../games/postgresEconomy.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function setupRewardsApi(app,{resolvePlayer,pool,economyEvents}) {
  const economy=pool?new PostgresEconomy(pool):null;
  async function authorize(req,res) {
    const player=await resolvePlayer(req);
    if(!player.authenticated){res.status(401).json({error:'Link your Discord wallet to claim rewards.'});return null;}
    if(!economy){res.status(503).json({error:'Rewards are unavailable. Please retry.'});return null;}
    return player.session;
  }
  app.get('/api/play/rewards',async(req,res)=>{
    try {
      const session=await authorize(req,res);if(!session)return;
      const user=await economy.getUser(session.userId);
      const availableAt=user.lastDaily?user.lastDaily+86400000:0;
      res.json({amount:500,availableAt,serverNow:Date.now(),available:availableAt<=Date.now()});
    } catch {res.status(503).json({error:'Rewards are unavailable. Please retry.'});}
  });
  app.post('/api/play/rewards/claim',async(req,res)=>{
    try {
      const session=await authorize(req,res);if(!session)return;
      if(!uuid.test(req.body?.operationId || ''))return res.status(400).json({error:'A valid claim ID is required.'});
      const result=await economy.claimDaily(req.body.operationId,session.userId);
      const user=await economy.getUser(session.userId);
      if(result.applied&&result.success){
        try{economyEvents?.emit('balanceChanged',{userId:session.userId,balance:user.balance,action:'daily',amount:500});}catch{}
      }
      res.json({success:result.success,amount:result.success?500:0,balance:user.balance,availableAt:new Date(result.availableAt).getTime(),serverNow:Date.now()});
    } catch {res.status(503).json({error:'Could not confirm your reward. Retry to recover this claim.'});}
  });
}
