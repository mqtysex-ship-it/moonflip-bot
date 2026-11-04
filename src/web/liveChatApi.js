const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function setupLiveChatApi(app,{store,resolvePlayer,broadcast}) {
  app.get('/api/play/chat/messages',async (req,res)=>{
    try { if(!store)return res.status(503).json({error:'Chat is temporarily unavailable.'});
      const player=await resolvePlayer(req);
      const status=player.authenticated && store.status ? await store.status(player.session.userId) : null;
      return res.json({messages:await store.history(),status});
    } catch { return res.status(503).json({error:'Chat is temporarily unavailable.'}); }
  });
  app.post('/api/play/chat/messages',async(req,res)=>{
    try {
      const player=await resolvePlayer(req);
      if(!player.authenticated)return res.status(401).json({error:'Link your Discord account to chat.'});
      if(!store)return res.status(503).json({error:'Chat is temporarily unavailable.'});
      const id=req.body?.id, input=req.body?.text;
      if(!uuid.test(id||'')||typeof input!=='string'||input.length>500||!input.trim()||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(input))return res.status(400).json({error:'Enter a message of 1 to 500 characters.'});
      const result=await store.post(player.session,{id:id.toLowerCase(),text:input.trim()});
      if(result.applied)try{broadcast?.(result.message)}catch(error){console.error('[Chat broadcast]',error.message)}
      return res.json(result);
    } catch(error) {
      if(error.code==='LEVEL_REQUIRED')return res.status(403).json({error:'Discord level 2 is required to chat.'});
      if(error.code==='CHAT_RATE_LIMIT')return res.status(429).json({error:'Please wait before sending another message.'});
      if(error.code==='CHAT_ID_CONFLICT')return res.status(409).json({error:'Message ID already used.'});
      return res.status(503).json({error:'Could not confirm your message. Retry to recover it.'});
    }
  });
}
