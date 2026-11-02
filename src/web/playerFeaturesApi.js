import {PostgresDocumentStore} from '../postgresDocumentStore.js';
import {PersistentPlinkoAuto} from '../games/plinkoAuto.js';
export function setupPlayerFeaturesApi(app,{resolvePlayer,pool}){
 const documents=pool?new PostgresDocumentStore(pool):null;
 const auto=pool?new PersistentPlinkoAuto(pool):null;
 const themes=['obsidian','midnight','forest'];
 async function route(req,res,action){
  try{
   const player=await resolvePlayer(req);
   if(!player.authenticated)return res.status(401).json({error:'Link your Discord wallet to save settings and use autobet.'});
   if(!pool)return res.status(503).json({error:'Settings storage is unavailable. Please retry.'});
   res.json(await action(player.session.userId));
  }catch(error){
   const invalid=/Invalid |Wager must|Choose |already active|different parameters|not found/.test(error.message);
   res.status(invalid?400:503).json({error:invalid?error.message:'Could not confirm the change. Please retry.'});
  }
 }
 app.get('/api/play/preferences',(req,res)=>route(req,res,async userId=>documents.read(`preferences/${userId}`,{theme:'obsidian'})));
 app.put('/api/play/preferences',(req,res)=>route(req,res,async userId=>{
  if(!themes.includes(req.body?.theme))throw new Error('Invalid theme');
  return documents.update(`preferences/${userId}`,{theme:'obsidian'},preferences=>{preferences.theme=req.body.theme;return {theme:preferences.theme};});
 }));
 app.get('/api/play/plinko/auto',(req,res)=>route(req,res,async userId=>({run:await auto.status(userId)})));
 app.post('/api/play/plinko/auto/start',(req,res)=>route(req,res,async userId=>({run:await auto.start(userId,req.body||{})})));
 app.post('/api/play/plinko/auto/stop',(req,res)=>route(req,res,async userId=>({run:await auto.stop(userId,req.body?.runId)})));
}
