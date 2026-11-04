import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
if(process.env.MOONFLIP_DB_INTEGRATION !== '1') throw Error('Explicit integration-test opt-in required');
const {databasePool:pool,closeDatabase}=await import('../src/database.js');
const {PostgresEconomy}=await import('../src/games/postgresEconomy.js');
const c=await pool.connect();
const wrapped={query:(...args)=>c.query(...args),async connect(){return {async query(sql,params){if(sql==='BEGIN')return c.query('SAVEPOINT integration_test');if(sql==='COMMIT')return c.query('RELEASE SAVEPOINT integration_test');if(sql==='ROLLBACK')return c.query('ROLLBACK TO SAVEPOINT integration_test');return c.query(sql,params)},release(){}}}};
const db=new PostgresEconomy(wrapped);
const ids=[randomUUID(),randomUUID()];
const users=ids.map(id=>'00'+BigInt('0x'+id.replaceAll('-','').slice(0,14)).toString().padStart(18,'0'));
const testGame='recovery-test-'+randomUUID();
try {
 await c.query('BEGIN');
 for(let i=0;i<2;i++) await db.startRound(ids[i],users[i],'crash',100,{phase:'BETTING'});
 const state=(target)=>({engine:'web-global-v1',phase:'IN_FLIGHT',crashPoint:2,autoCashout:target,flightStartTime:Date.now()-2000000,flightDurationMs:12000});
 await assert.rejects(db.recordCrashFlight([{roundId:ids[0],userId:users[0],state:state(1.5)},{roundId:randomUUID(),userId:users[1],state:state(3)}]));
 assert.equal((await c.query('SELECT game_state FROM moonflip_private.game_rounds WHERE round_id=$1',[ids[0]])).rows[0].game_state.phase,'BETTING');
 await db.recordCrashFlight(ids.map((roundId,i)=>({roundId,userId:users[i],state:state(i?3:1.5)})));
 await c.query("UPDATE moonflip_private.game_rounds SET game_type=$2, created_at=now()-interval '1 minute' WHERE round_id=ANY($1::uuid[])",[ids,testGame]);
 assert.equal(await db.recoverInterruptedRounds(testGame,true,0),2);
 assert.equal(await db.recoverInterruptedRounds(testGame,true,0),0);
 const rows=(await c.query('SELECT round_id,payout FROM moonflip_private.game_rounds WHERE round_id=ANY($1::uuid[])',[ids])).rows;
 assert.equal(Number(rows.find(r=>r.round_id===ids[0]).payout),150);
 assert.equal(Number(rows.find(r=>r.round_id===ids[1]).payout),0);
 console.log('PostgreSQL flight persistence rollback and retry-safe recovery passed');
} finally {await c.query('ROLLBACK');c.release();await closeDatabase()}
