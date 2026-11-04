import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(process.env.MOONFLIP_DB_INTEGRATION!=='1')throw Error('Explicit integration-test opt-in required');
const {databasePool:pool,closeDatabase}=await import('../src/database.js');
const {LiveChatStore}=await import('../src/games/liveChatStore.js');
const user='00'+BigInt('0x'+randomUUID().replaceAll('-','').slice(0,14)).toString().padStart(18,'0');
const other='00'+BigInt('0x'+randomUUID().replaceAll('-','').slice(0,14)).toString().padStart(18,'0');
const id=randomUUID();const store=new LiveChatStore(pool);
try {
 await pool.query("INSERT INTO moonflip_private.wallets(discord_user_id,username,level) VALUES($1,'Synthetic concurrency test',2)",[user]);
 await pool.query("INSERT INTO moonflip_private.wallets(discord_user_id,username,level) VALUES($1,'Synthetic concurrency test',2)",[other]);
 const early=await pool.connect();
 await early.query('BEGIN');
 try {
  await new Promise(resolve=>setTimeout(resolve,25));
  await store.post({userId:other},{id:randomUUID(),text:'first message',origin:'discord'});
  const earlyStore=new LiveChatStore({connect:async()=>({query:(sql,...args)=>sql==='BEGIN'?Promise.resolve():early.query(sql,...args),release:()=>{}})});
  await assert.rejects(earlyStore.post({userId:other},{id:randomUUID(),text:'second message',origin:'discord'}),error=>error.code==='CHAT_RATE_LIMIT');
 } finally { await early.query('ROLLBACK').catch(()=>{}); early.release(); }
 const same=await Promise.all([store.post({userId:user},{id,text:'retry-safe synthetic',origin:'discord'}),store.post({userId:user},{id,text:'retry-safe synthetic',origin:'discord'})]);
 assert.deepEqual(same.map(x=>x.applied).sort(),[false,true]);
 const attempts=await Promise.allSettled([store.post({userId:user},{id:randomUUID(),text:'rapid one',origin:'discord'}),store.post({userId:user},{id:randomUUID(),text:'rapid two',origin:'discord'})]);
 assert(attempts.every(x=>x.status==='rejected'&&x.reason.code==='CHAT_RATE_LIMIT'));
 const rows=await pool.query('SELECT count(*)::int AS count FROM moonflip_private.live_chat_messages WHERE discord_user_id=$1',[user]);assert.equal(rows.rows[0].count,1);
 console.log('Concurrent chat retries and spam limits passed against PostgreSQL');
}finally {
 await pool.query('DELETE FROM moonflip_private.live_chat_messages WHERE discord_user_id=ANY($1::text[])',[[user,other]]);
 await pool.query('DELETE FROM moonflip_private.wallets WHERE discord_user_id=ANY($1::text[])',[[user,other]]);
 await closeDatabase();
}
