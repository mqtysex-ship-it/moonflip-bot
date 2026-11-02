import assert from 'node:assert/strict';
import express from 'express';
const feature=await import('../src/web/playerFeaturesApi.js').catch(()=>({}));
assert.equal(typeof feature.setupPlayerFeaturesApi,'function','durable preferences and autobet endpoints must exist');
const app=express();app.use(express.json());
feature.setupPlayerFeaturesApi(app,{resolvePlayer:async req=>({authenticated:req.headers['x-test-user']==='linked',session:{userId:'123'}}),pool:null});
const server=app.listen(0);await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
try {
 for(const path of ['/preferences','/plinko/auto']){
  assert.equal((await fetch(base+'/api/play'+path)).status,401);
  assert.equal((await fetch(base+'/api/play'+path,{headers:{'x-test-user':'linked'}})).status,503);
 }
 assert.equal((await fetch(base+'/api/play/plinko/auto/start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 console.log('Preferences/autobet authentication and fail-closed checks passed');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
