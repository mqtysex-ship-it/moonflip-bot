const fail=(code,message)=>Object.assign(new Error(message),{code});
function publicMessage(row){return {id:row.message_id,userId:row.discord_user_id,username:row.username,avatarUrl:row.avatar_url,level:row.level,text:row.message_text,origin:row.origin,createdAt:new Date(row.created_at).toISOString()};}
export class LiveChatStore {
  constructor(pool){this.pool=pool;}
  async status(userId){const result=await this.pool.query('SELECT level FROM moonflip_private.wallets WHERE discord_user_id=$1',[userId]);return {level:result.rows[0]?.level || 1,minLevel:2};}
  async history(){const result=await this.pool.query(`SELECT * FROM (SELECT * FROM moonflip_private.live_chat_messages WHERE deleted_at IS NULL ORDER BY created_at DESC, message_id DESC LIMIT 100) recent ORDER BY created_at, message_id`);return result.rows.map(publicMessage);}
  async removeDiscordMessage(discordMessageId){
    const result=await this.pool.query(`UPDATE moonflip_private.live_chat_messages SET deleted_at=now()
      WHERE deleted_at IS NULL AND (discord_message_id=$1 OR message_id=(SELECT message_id FROM moonflip_private.live_chat_discord_outbox WHERE discord_message_id=$1)) RETURNING message_id`,[discordMessageId]);
    return result.rows.map(row=>row.message_id);
  }
  async post(session,{id,text,origin='web',discordMessageId=null,createdAt=null}){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,8))',[session.userId]);
      const previous=(await client.query('SELECT * FROM moonflip_private.live_chat_messages WHERE message_id=$1::uuid',[id])).rows[0];
      if(previous){
        if(previous.deleted_at)throw fail('CHAT_ID_CONFLICT','Message was removed');
        if(previous.discord_user_id!==session.userId||previous.message_text!==text||previous.origin!==origin)throw fail('CHAT_ID_CONFLICT','Message ID already used');
        await client.query('COMMIT');return {message:publicMessage(previous),applied:false};
      }
      const wallet=(await client.query('SELECT level,username,avatar_url FROM moonflip_private.wallets WHERE discord_user_id=$1 FOR UPDATE',[session.userId])).rows[0];
      if(!wallet||wallet.level<2)throw fail('LEVEL_REQUIRED','Level 2 required');
      const recent=await client.query("SELECT 1 FROM moonflip_private.live_chat_messages WHERE discord_user_id=$1 AND created_at > coalesce($2::timestamptz,clock_timestamp()) - interval '3 seconds' AND created_at <= coalesce($2::timestamptz,clock_timestamp()) LIMIT 1",[session.userId,createdAt]);
      if(recent.rows.length)throw fail('CHAT_RATE_LIMIT','Please wait');
      const inserted=await client.query(`INSERT INTO moonflip_private.live_chat_messages (message_id,discord_user_id,message_text,username,avatar_url,level,origin,discord_message_id,created_at) VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,coalesce($9::timestamptz,clock_timestamp())) RETURNING *`,[id,session.userId,text,wallet.username||session.username||'Player',wallet.avatar_url||session.avatarUrl||null,wallet.level,origin,discordMessageId,createdAt]);
      if(origin==='web')await client.query('INSERT INTO moonflip_private.live_chat_discord_outbox(message_id) VALUES($1::uuid)',[id]);
      await client.query('COMMIT');return {message:publicMessage(inserted.rows[0]),applied:true};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }
}
