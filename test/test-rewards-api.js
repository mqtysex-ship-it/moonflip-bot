import assert from 'node:assert/strict';
import express from 'express';
const module=await import('../src/web/rewardsApi.js').catch(()=>({}));
assert.equal(typeof module.setupRewardsApi,'function','Rewards must have its own authenticated daily-claim API');
const app=express();app.use(express.json());
module.setupRewardsApi(app,{resolvePlayer:async req=>({authenticated:req.headers['x-test-user']==='linked',session:{userId:'123'}}),pool:null});
const server=app.listen(0);await new Promise(r=>server.once('listening',r));
const base=`http://127.0.0.1:${server.address().port}`;
try {
  assert.equal((await fetch(base+'/api/play/rewards')).status,401);
  assert.equal((await fetch(base+'/api/play/rewards',{headers:{'x-test-user':'linked'}})).status,503);
  assert.equal((await fetch(base+'/api/play/rewards/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  console.log('Rewards authentication and database fail-closed checks passed');
} finally {server.closeAllConnections();await new Promise(r=>server.close(r));}
