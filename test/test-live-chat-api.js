import assert from 'node:assert/strict';
import express from 'express';
import { setupLiveChatApi } from '../src/web/liveChatApi.js';

let broadcasts=[]; const sent=[];
const store={async history(){return [{id:'old',text:'Hello',level:2}]},async post(user,body){if(user.userId==='low')throw Object.assign(new Error('level'),{code:'LEVEL_REQUIRED'});if(body.text==='fail')throw Error('storage unavailable');const existing=sent.find(m=>m.id===body.id);if(existing)return {message:existing,applied:false};const message={id:body.id,userId:user.userId,level:2,text:body.text};sent.push(message);return {message,applied:true}}};
const app=express();app.use(express.json());setupLiveChatApi(app,{store,resolvePlayer:async req=>req.headers['x-test-user']?{authenticated:true,session:{userId:req.headers['x-test-user']}}:{authenticated:false},broadcast:m=>broadcasts.push(m)});
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
const req=(body,user)=>fetch(base+'/api/play/chat/messages',{method:'POST',headers:{'content-type':'application/json',...(user?{'x-test-user':user}:{})},body:JSON.stringify(body)});
try {
 assert.equal((await (await fetch(base+'/api/play/chat/messages')).json()).messages[0].text,'Hello');
 const id='00000000-0000-4000-8000-000000000001';
 assert.equal((await req({id,text:'hi'})).status,401);
 assert.equal((await req({id,text:'hi'},'low')).status,403);
 assert.equal((await req({id,text:'   '},'ok')).status,400);
 assert.equal((await req({id,text:'x'.repeat(501)},'ok')).status,400);
 let response=await req({id,text:'hi'},'ok');assert.equal(response.status,200);assert.equal((await response.json()).message.text,'hi');
 response=await req({id,text:'hi'},'ok');assert.equal(response.status,200);assert.equal(broadcasts.length,1,'replay must not rebroadcast');
 assert.equal((await req({id:'00000000-0000-4000-8000-000000000002',text:'fail'},'ok')).status,503);
} finally {server.closeAllConnections(); await new Promise(r=>server.close(r));}
console.log('Live chat API authorization and failure handling passed');
