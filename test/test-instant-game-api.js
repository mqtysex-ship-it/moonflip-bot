import assert from 'node:assert/strict';
import express from 'express';
const module=await import('../src/web/instantGameApi.js').catch(()=>({}));
assert.equal(typeof module.setupInstantGameApi,'function','authenticated instant-game routes must exist');
const app=express();app.use(express.json());
module.setupInstantGameApi(app,{resolvePlayer:async(req)=>({authenticated:req.headers['x-test-user']==='linked',session:{userId:'123456789'}}),pool:null});
const server=app.listen(0); await new Promise(r=>server.once('listening',r));
const url=`http://127.0.0.1:${server.address().port}`;
try {
  let r=await fetch(url+'/api/play/coinflip/play',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(r.status,401);
  r=await fetch(url+'/api/play/coinflip/play',{method:'POST',headers:{'Content-Type':'application/json','x-test-user':'linked'},body:JSON.stringify({wager:100,choice:'heads',roundId:'00000000-0000-4000-8000-000000000123'})});
  assert.equal(r.status,503,'missing database must fail closed');
  r=await fetch(url+'/api/play/instant/config'); const config=await r.json(); assert.equal(config.plinko['16'].high.length,17);
  r=await fetch(url+'/api/play/instant/history');assert.equal(r.status,401);
  r=await fetch(url+'/api/play/instant/activity'); assert.equal(r.status,503);
  console.log('Instant-game API authentication and storage fail-closed checks passed');
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
