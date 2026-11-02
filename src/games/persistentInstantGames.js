import { isDeepStrictEqual } from 'node:util';
import { resolveInstantGame, validateInstantBet } from './instantGames.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class PersistentInstantGames {
  constructor(pool) { this.pool=pool; }
  async play(userId,game,request) {
    const {wager,options}=validateInstantBet(game,request);
    if(!uuid.test(request.roundId || '')) throw new Error('A valid round ID is required');
    if(typeof userId!=='string' || !userId) throw new Error('Discord sign-in required');
    const roundId=request.roundId.toLowerCase();
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Use the same lock namespace as start_game_round, across all server instances.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,1))',[roundId]);
      const prior=await client.query('SELECT * FROM moonflip_private.game_rounds WHERE round_id=$1::uuid',[roundId]);
      let result, applied=false;
      if(prior.rows[0]) {
        const r=prior.rows[0];
        if(r.discord_user_id!==userId || r.game_type!==game || Number(r.wager)!==wager || !isDeepStrictEqual(r.game_state?.request,options)) throw new Error('Round ID already used with different parameters');
        if(r.status!=='settled') throw new Error('Round is not settled');
        result=r.game_state.result;
      } else {
        result=resolveInstantGame(game,wager,options);
        const state={request:options,result};
        await client.query('SELECT * FROM moonflip_private.start_game_round($1::uuid,$2,$3,$4::bigint,$5::jsonb)',[roundId,userId,game,wager,JSON.stringify(state)]);
        await client.query('SELECT * FROM moonflip_private.settle_game_round($1::uuid,$2,$3::bigint)',[roundId,userId,result.payout]);
        applied=true;
      }
      const wallet=await client.query('SELECT balance FROM moonflip_private.wallets WHERE discord_user_id=$1',[userId]);
      const balance=Number(wallet.rows[0].balance);
      if(!Number.isSafeInteger(balance)) throw new Error('Wallet balance out of range');
      await client.query('COMMIT');
      return {roundId,game,wager,...result,profit:result.payout-wager,balance,applied};
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>{}); throw error;
    } finally { client.release(); }
  }
  async activity() {
    const result=await this.pool.query(`SELECT r.round_id,r.game_type,r.wager,r.payout,r.game_state,r.settled_at,w.username,w.avatar_url
      FROM moonflip_private.game_rounds r JOIN moonflip_private.wallets w ON w.discord_user_id=r.discord_user_id
      WHERE r.game_type IN ('coinflip','plinko') AND r.status='settled' AND r.game_state ? 'result'
      ORDER BY r.settled_at DESC LIMIT 20`);
    return result.rows.map(r=>({roundId:r.round_id,gameName:r.game_type==='coinflip'?'Coinflip':'Plinko',wager:Number(r.wager),
      payout:Number(r.payout),profit:Number(r.payout)-Number(r.wager),multiplier:r.game_state.result.multiplier,
      username:r.username || 'Player',avatarUrl:r.avatar_url,timestamp:new Date(r.settled_at).getTime()}));
  }
  async history(userId) {
    const result=await this.pool.query(`SELECT round_id,game_type,wager,payout,game_state,settled_at
      FROM moonflip_private.game_rounds WHERE discord_user_id=$1 AND game_type IN ('coinflip','plinko')
      AND status='settled' AND game_state ? 'result' ORDER BY settled_at DESC LIMIT 30`,[userId]);
    return result.rows.map(r=>({roundId:r.round_id,game:r.game_type,wager:Number(r.wager),payout:Number(r.payout),
      ...r.game_state.result,profit:Number(r.payout)-Number(r.wager),timestamp:new Date(r.settled_at).getTime()}));
  }
}
