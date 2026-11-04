import { randomUUID, createHash } from 'node:crypto';
const MIN_WAGER=1000, PER_USER_CAP=25, POOL_CAP=500;
export function calculateRainAwards(candidates, seed='') {
  const eligible=candidates.filter(c=>Number.isSafeInteger(c.wager)&&c.wager>=MIN_WAGER)
    .map(c=>({...c,cap:Math.min(PER_USER_CAP,Math.floor(c.wager/1000))}));
  const total=eligible.reduce((sum,c)=>sum+c.cap,0);
  if(total<=POOL_CAP)return eligible.map(({cap,...c})=>({...c,amount:cap}));
  const portions=eligible.map(c=>({...c,amount:Math.floor(c.cap*POOL_CAP/total),remainder:(c.cap*POOL_CAP)%total,
    tie:createHash('sha256').update(`${seed}:${c.userId}`).digest('hex')}));
  let remaining=POOL_CAP-portions.reduce((sum,c)=>sum+c.amount,0);
  const order=[...portions].sort((a,b)=>b.remainder-a.remainder||a.tie.localeCompare(b.tie));
  for(const candidate of order){if(!remaining)break;if(candidate.amount<candidate.cap){candidate.amount++;remaining--;}}
  return portions.filter(c=>c.amount>0).map(({cap,remainder,tie,...c})=>c);
}
// Replay missed hourly periods after downtime, bounded to the eligibility window.
export function getNextRainPeriod(current,last) {
  const now=new Date(current).getTime();
  if(!Number.isFinite(now))throw new Error('Invalid rain period');
  if(!last)return new Date(now);
  const previous=new Date(last).getTime();
  if(!Number.isFinite(previous))throw new Error('Invalid previous rain period');
  if(previous>=now)return null;
  return new Date(Math.max(previous+3600000,now-24*3600000));
}
export class LiveChatRain {
  constructor(pool){this.pool=pool;}
  async run(){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('moonflip-chat-rain', 14))");
      const clock=(await client.query("SELECT date_trunc('hour', clock_timestamp()) AS period, (SELECT max(period_start) FROM moonflip_private.live_chat_rains) AS last_period")).rows[0];
      const period=getNextRainPeriod(clock.period,clock.last_period);
      if(!period){await client.query('COMMIT');return {applied:false,awards:[]};}
      const inserted=await client.query('INSERT INTO moonflip_private.live_chat_rains(period_start,total_amount) VALUES($1,0) ON CONFLICT DO NOTHING RETURNING period_start',[period]);
      if(!inserted.rows.length){await client.query('COMMIT');return {applied:false,awards:[]};}
      const result=await client.query(`WITH active AS (
        SELECT DISTINCT discord_user_id FROM moonflip_private.live_chat_messages
        WHERE deleted_at IS NULL AND created_at >= $1::timestamptz - interval '1 hour' AND created_at < $1::timestamptz
      ) SELECT a.discord_user_id, LEAST(sum(g.wager), 25000)::bigint AS eligible_wager
        FROM active a JOIN moonflip_private.wallets w ON w.discord_user_id=a.discord_user_id AND w.level>=2
        JOIN moonflip_private.game_rounds g ON g.discord_user_id=a.discord_user_id
        WHERE g.game_type IN ('coinflip','plinko') AND g.status='settled' AND g.game_state ? 'result'
          AND g.settled_at < $1::timestamptz
          AND g.settled_at >= greatest($1::timestamptz - interval '24 hours',coalesce((SELECT max(r.period_start) FROM moonflip_private.live_chat_rain_awards r WHERE r.discord_user_id=a.discord_user_id),$1::timestamptz - interval '24 hours'))
        GROUP BY a.discord_user_id HAVING sum(g.wager)>=1000 ORDER BY a.discord_user_id`,[period]);
      const awards=calculateRainAwards(result.rows.map(r=>({userId:r.discord_user_id,wager:Number(r.eligible_wager)})),new Date(period).toISOString());
      for(const award of awards){
        const operation=randomUUID();
        const wallet=await client.query("SELECT * FROM moonflip_private.apply_wallet_delta($1::uuid,$2,'chat_rain',$3::bigint)",[operation,award.userId,award.amount]);
        await client.query('INSERT INTO moonflip_private.live_chat_rain_awards(period_start,discord_user_id,amount,eligible_wager,operation_id) VALUES($1,$2,$3,$4,$5::uuid)',[period,award.userId,award.amount,award.wager,operation]);
        award.balance=Number(wallet.rows[0].balance_after);
      }
      const total=awards.reduce((sum,a)=>sum+a.amount,0);
      await client.query('UPDATE moonflip_private.live_chat_rains SET total_amount=$2 WHERE period_start=$1',[period,total]);
      await client.query('COMMIT');return {applied:true,period,awards,total};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
}
