import { createHash } from 'node:crypto';
export const LIVE_CHAT_CHANNEL_ID = process.env.LIVE_CHAT_CHANNEL_ID || '1567516974270124172';
export function discordChatMessageId(discordId) {
  const bytes=createHash('sha256').update('moonflip-discord-chat:'+discordId).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|0x50;bytes[8]=(bytes[8]&63)|0x80;
  const hex=bytes.toString('hex');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function ingestDiscordChat(message,{store,broadcast}) {
  if(!store || message.author?.bot || message.webhookId || message.channelId!==LIVE_CHAT_CHANNEL_ID || !message.guildId) return false;
  const text=typeof message.content==='string'?message.content.trim():'';
  if(!text||text.length>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text))return false;
  try {
    const result=await store.post({userId:message.author.id,username:message.author.username,avatarUrl:message.author.displayAvatarURL?.({extension:'png',size:128})},
      {id:discordChatMessageId(message.id),text,origin:'discord',discordMessageId:message.id,createdAt:message.createdAt || null});
    if(result.applied)broadcast?.(result.message);
    return result.applied;
  } catch(error) { if(['LEVEL_REQUIRED','CHAT_RATE_LIMIT'].includes(error.code))return false; throw error; }
}
export async function deliverChatOutbox(pool,channel) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const row=(await client.query(`SELECT o.message_id,o.attempts,m.username,m.level,m.message_text FROM moonflip_private.live_chat_discord_outbox o JOIN moonflip_private.live_chat_messages m ON m.message_id=o.message_id WHERE o.state='pending' AND o.next_attempt_at<=now() ORDER BY m.created_at FOR UPDATE OF o SKIP LOCKED LIMIT 1`)).rows[0];
    if(!row){await client.query('COMMIT');return false;}
    try {
      const nonce=Buffer.from(row.message_id.replaceAll('-',''),'hex').toString('base64url');
      const posted=await channel.send({content:`${row.username} · Level ${row.level}\n${row.message_text}`,allowedMentions:{parse:[]},nonce,enforceNonce:true});
      await client.query("UPDATE moonflip_private.live_chat_discord_outbox SET state='delivered',discord_message_id=$2,delivered_at=now(),attempts=attempts+1 WHERE message_id=$1::uuid",[row.message_id,posted.id]);
    } catch(error) {
      await client.query("UPDATE moonflip_private.live_chat_discord_outbox SET attempts=attempts+1,next_attempt_at=now()+interval '30 seconds' WHERE message_id=$1::uuid",[row.message_id]);
      console.error('[Live chat Discord delivery]',error.message);
    }
    await client.query('COMMIT');return true;
  } catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}

// Replay from a durable snowflake cursor after reconnects; each message is
// idempotent, and the cursor only advances after a whole fetched batch.
export async function syncDiscordChat(pool,channel,{store,broadcast}) {
  await pool.query('INSERT INTO moonflip_private.live_chat_discord_cursors(channel_id,last_message_id) VALUES($1,$1) ON CONFLICT(channel_id) DO NOTHING',[channel.id]);
  let cursor=(await pool.query('SELECT last_message_id FROM moonflip_private.live_chat_discord_cursors WHERE channel_id=$1',[channel.id])).rows[0].last_message_id;
  for(let page=0;page<5;page++) {
    const fetched=await channel.messages.fetch({after:cursor,limit:100});
    const items=[...fetched.values()].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
    if(!items.length)return true;
    for(const message of items)await ingestDiscordChat(message,{store,broadcast});
    const last=items.at(-1).id;
    await pool.query(
      `UPDATE moonflip_private.live_chat_discord_cursors
       SET last_message_id = $2::text, updated_at = now()
       WHERE channel_id = $1 AND last_message_id::numeric < $2::text::numeric`,
      [channel.id, last]
    );
    cursor=last;
    if(items.length<100)return true;
  }
  return false;
}
