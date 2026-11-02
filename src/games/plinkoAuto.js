import {isDeepStrictEqual} from 'node:util';
import {PostgresDocumentStore} from '../postgresDocumentStore.js';
import {validateInstantBet} from './instantGames.js';
export const autoKey=userId=>`plinko-auto/${userId}`;
export const autoRunKey=(userId,runId)=>`plinko-auto-run/${userId}/${runId}`;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function requireUuid(value){if(!uuid.test(value || ''))throw new Error('Invalid run ID');return value.toLowerCase();}
export class PersistentPlinkoAuto {
 constructor(pool){this.pool=pool;this.documents=new PostgresDocumentStore(pool);}
 async status(userId){return this.documents.read(autoKey(userId));}
 async start(userId,request){
  const {wager,options}=validateInstantBet('plinko',request);
  const runId=requireUuid(request.runId);
  if(!Number.isInteger(request.totalBets)||request.totalBets<1||request.totalBets>1000||![250,500,1000].includes(request.intervalMs))throw new Error('Invalid autobet limits');
  const settings={wager,...options,totalBets:request.totalBets,intervalMs:request.intervalMs};
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   await client.query("INSERT INTO moonflip_private.documents(key,value) VALUES($1,'{}') ON CONFLICT(key) DO NOTHING",[autoKey(userId)]);
   const current=(await client.query('SELECT value FROM moonflip_private.documents WHERE key=$1 FOR UPDATE',[autoKey(userId)])).rows[0].value;
   // Archive pre-upgrade/current runs before replacing the pointer. Old IDs remain idempotent forever.
   if(current.runId)await client.query('INSERT INTO moonflip_private.documents(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING',[autoRunKey(userId,current.runId),JSON.stringify(current)]);
   const history=(await client.query('SELECT value FROM moonflip_private.documents WHERE key=$1',[autoRunKey(userId,runId)])).rows[0]?.value;
   if(history){
    if(!isDeepStrictEqual(history.settings,settings))throw new Error('Run ID already used with different parameters');
    await client.query('COMMIT');return history;
   }
   if(current.status==='running')throw new Error('An autobet run is already active');
   const run={runId,settings,nextIndex:0,status:'running',netProfit:0,createdAt:Date.now()};
   await client.query('UPDATE moonflip_private.documents SET value=$2::jsonb,updated_at=now() WHERE key=$1',[autoKey(userId),JSON.stringify(run)]);
   await client.query('INSERT INTO moonflip_private.documents(key,value) VALUES($1,$2::jsonb)',[autoRunKey(userId,runId),JSON.stringify(run)]);
   await client.query('COMMIT');return run;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
 async stop(userId,runId){
  runId=requireUuid(runId);
  const client=await this.pool.connect();
  try{
   await client.query('BEGIN');
   const current=(await client.query('SELECT value FROM moonflip_private.documents WHERE key=$1 FOR UPDATE',[autoKey(userId)])).rows[0]?.value;
   if(!current)throw new Error('Autobet run not found');
   if(current.runId!==runId){
    const old=(await client.query('SELECT value FROM moonflip_private.documents WHERE key=$1',[autoRunKey(userId,runId)])).rows[0]?.value;
    if(!old||old.status==='running')throw new Error('Autobet run not found');
    await client.query('COMMIT');return old;
   }
   if(current.status==='running')current.status='stopped';
   await client.query('UPDATE moonflip_private.documents SET value=$2::jsonb,updated_at=now() WHERE key=$1',[autoKey(userId),JSON.stringify(current)]);
   await client.query('INSERT INTO moonflip_private.documents(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()',[autoRunKey(userId,runId),JSON.stringify(current)]);
   await client.query('COMMIT');return current;
  }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
 }
}
// Called inside the same transaction as the round debit and settlement.
export async function lockAutoBet(client,userId,request,wager,options){
 if(request.autoRunId===undefined&&request.autoIndex===undefined)return null;
 const runId=requireUuid(request.autoRunId);
 if(!Number.isInteger(request.autoIndex)||request.autoIndex<0)throw new Error('Invalid autobet index');
 const loaded=await client.query('SELECT value FROM moonflip_private.documents WHERE key=$1 FOR UPDATE',[autoKey(userId)]);
 const run=loaded.rows[0]?.value;
 if(!run||run.runId!==runId||run.status!=='running'||run.nextIndex!==request.autoIndex)throw new Error('Autobet run stopped or index already used');
 if(run.settings.wager!==wager||run.settings.rows!==options.rows||run.settings.risk!==options.risk)throw new Error('Autobet settings do not match');
 return run;
}
export async function advanceAutoBet(client,userId,run,profit){
 if(!run)return;
 run.nextIndex++;run.netProfit+=profit;
 if(run.nextIndex>=run.settings.totalBets)run.status='completed';
 await client.query('UPDATE moonflip_private.documents SET value=$2::jsonb,updated_at=now() WHERE key=$1',[autoKey(userId),JSON.stringify(run)]);
 await client.query('INSERT INTO moonflip_private.documents(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=now()',[autoRunKey(userId,run.runId),JSON.stringify(run)]);
}
