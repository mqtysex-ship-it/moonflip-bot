import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import { syncDiscordChat } from '../src/discordLiveChat.js';
if(process.env.MOONFLIP_DB_INTEGRATION!=='1')throw Error('Explicit integration-test opt-in required');
const {databasePool:pool,closeDatabase}=await import('../src/database.js');
const {LiveChatStore}=await import('../src/games/liveChatStore.js');
const {LiveChatRain}=await import('../src/games/liveChatRain.js');
const c=await pool.connect();
const wrapped={query:(...args)=>c.query(...args),async connect(){return {async query(sql,params){if(sql==='BEGIN')return c.query('SAVEPOINT live_chat_test');if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT live_chat_test');if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT live_chat_test');return c.query(sql,params)},release(){}}}};
const user=()=> '00'+BigInt('0x'+randomUUID().replaceAll('-','').slice(0,14)).toString().padStart(18,'0');
const eligible=user(),low=user(),id=randomUUID(),round=randomUUID();
try{
 await c.query('BEGIN');
 const existing=(await c.query("SELECT to_regclass('moonflip_private.live_chat_messages') AS table_name")).rows[0].table_name;
 if(!existing)await c.query(await readFile(new URL('../supabase/migrations/20261104124438_moonflip_live_chat.sql',import.meta.url),'utf8'));
 await c.query("INSERT INTO moonflip_private.wallets(discord_user_id,username,level,balance) VALUES ($1,'Eligible',2,10000),($2,'Low',1,10000)",[eligible,low]);
 const store=new LiveChatStore(wrapped);
 await assert.rejects(store.post({userId:low},{id:randomUUID(),text:'no'}),e=>e.code==='LEVEL_REQUIRED');
 const sent=await store.post({userId:eligible},{id,text:'hello'});assert.equal(sent.applied,true);
 assert.equal((await new LiveChatStore(wrapped).post({userId:eligible},{id,text:'hello'})).applied,false);
 await assert.rejects(store.post({userId:eligible},{id:randomUUID(),text:'spam'}),e=>e.code==='CHAT_RATE_LIMIT');
 assert((await store.history()).some(message=>message.id===id));
 assert.equal(Number((await c.query('SELECT count(*) FROM moonflip_private.live_chat_discord_outbox WHERE message_id=$1',[id])).rows[0].count),1);
 await c.query("UPDATE moonflip_private.live_chat_messages SET created_at=date_trunc('hour',clock_timestamp())-interval '10 minutes' WHERE message_id=$1",[id]);
 await c.query('SELECT * FROM moonflip_private.start_game_round($1::uuid,$2,$3,$4,$5::jsonb)',[round,eligible,'coinflip',2000,JSON.stringify({result:{}})]);
 await c.query('SELECT * FROM moonflip_private.settle_game_round($1::uuid,$2,$3)',[round,eligible,0]);
 await c.query("UPDATE moonflip_private.game_rounds SET settled_at=date_trunc('hour',clock_timestamp())-interval '20 minutes' WHERE round_id=$1",[round]);
 const rain=new LiveChatRain(wrapped);const first=await rain.run();assert.equal(first.awards.length,1);assert.equal(first.awards[0].amount,2);assert.equal(first.awards[0].balance,8002);
 assert.equal((await rain.run()).applied,false);
 await c.query("UPDATE moonflip_private.live_chat_discord_outbox SET discord_message_id='123456789',state='delivered' WHERE message_id=$1",[id]);
 assert.deepEqual(await store.removeDiscordMessage('123456789'),[id]);
 assert(!(await store.history()).some(message=>message.id===id));
 const channelId = user();
 const firstMessageId = (BigInt(channelId) + 1n).toString();
 const lastMessageId = (BigInt(channelId) + 2n).toString();
 const channel = { id: channelId, messages: { async fetch({ after }) {
   return new Map(after === channelId ? [[firstMessageId, { id: firstMessageId }]] : []);
 } } };
 const cursor = async () => (await c.query(
   'SELECT last_message_id FROM moonflip_private.live_chat_discord_cursors WHERE channel_id=$1', [channelId]
 )).rows[0].last_message_id;
 await syncDiscordChat(wrapped, channel, { store });
 assert.equal(await cursor(), firstMessageId);
 // A replay racing a newer fetch must not rewind its committed cursor.
 channel.messages.fetch = async () => {
   await c.query('UPDATE moonflip_private.live_chat_discord_cursors SET last_message_id=$2 WHERE channel_id=$1',
     [channelId, lastMessageId]);
   return new Map([[firstMessageId, { id: firstMessageId }]]);
 };
 await syncDiscordChat(wrapped, channel, { store });
 assert.equal(await cursor(), lastMessageId);
 const access=await c.query("SELECT relrowsecurity,has_table_privilege('anon',oid,'SELECT') AS public_read FROM pg_class WHERE oid='moonflip_private.live_chat_messages'::regclass");assert.equal(access.rows[0].relrowsecurity,true);assert.equal(access.rows[0].public_read,false);
 console.log('PostgreSQL chat, level, idempotency, outbox, rain and privileges passed');
}finally{await c.query('ROLLBACK');c.release();await closeDatabase();}
