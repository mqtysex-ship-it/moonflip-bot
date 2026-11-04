window.createLiveChatUI = function ({api, state}) {
  const panel=document.getElementById('liveChat'), shell=document.querySelector('.mf-shell');
  const toggle=document.getElementById('liveChatToggle'), close=document.getElementById('liveChatClose');
  const messages=document.getElementById('liveChatMessages'), form=document.getElementById('liveChatForm');
  const input=document.getElementById('liveChatInput'), send=document.getElementById('liveChatSend');
  const status=document.getElementById('liveChatStatus'), count=document.getElementById('liveChatCount');
  if(!panel||!toggle||!messages||!form)return {refresh(){},receive(){}};
  const known=new Set(); let profile=null, pending=null, busy=false, loaded=false;
  function setOpen(open){panel.hidden=!open;shell.classList.toggle('chat-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close live chat':'Open live chat');if(open){refresh();if(matchMedia('(max-width: 1080px)').matches)close.focus();}else toggle.focus();}
  function allowed(){return Boolean(profile && profile.level>=profile.minLevel);}
  function updateComposer(){const enabled=allowed()&&!busy;input.disabled=!enabled;send.disabled=!enabled;if(busy)status.textContent='Sending…';else if(!profile)status.textContent='Link Discord to write';else if(!allowed())status.textContent=`Level ${profile.level} · Level ${profile.minLevel} required`;else status.textContent=`Discord level ${profile.level} · Be respectful`;}
  function renderMessage(message){
    if(!message?.id||known.has(message.id))return; known.add(message.id);
    messages.querySelector('.live-chat-empty')?.remove();
    const row=document.createElement('article');row.className='live-chat-message';row.dataset.messageId=message.id;
    const head=document.createElement('div');head.className='live-chat-message-head';
    const level=document.createElement('span');level.className='live-chat-level';level.textContent=String(message.level);
    const name=document.createElement('span');name.className='live-chat-name';name.textContent=message.username||'Player';
    const time=document.createElement('time');time.className='live-chat-time';const date=new Date(message.createdAt);if(!Number.isNaN(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
    const text=document.createElement('p');text.className='live-chat-text';text.textContent=message.text;
    head.append(level,name,time);row.append(head,text);const nearBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<120;messages.append(row);
    while(messages.children.length>100){const first=messages.firstElementChild;if(first?.dataset.messageId)known.delete(first.dataset.messageId);first?.remove();}
    if(nearBottom||message.userId===state.userId)messages.scrollTop=messages.scrollHeight;
  }
  async function refresh(){const existing=new Set(known);try{const result=await api('/chat/messages');profile=result.status||null;const history=result.messages||[];const present=new Set(history.map(message=>message.id));for(const id of existing)if(!present.has(id))remove(id);for(const message of history)renderMessage(message);if(!known.size){messages.replaceChildren();const empty=document.createElement('p');empty.className='live-chat-empty';empty.textContent='No messages yet. Say hello!';messages.append(empty);}loaded=true;updateComposer();}catch{if(!loaded)messages.textContent='Chat is unavailable. Reconnect to try again.';profile=null;updateComposer();status.textContent='Chat temporarily unavailable';}}
  toggle.addEventListener('click',()=>setOpen(panel.hidden));close?.addEventListener('click',()=>setOpen(false));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden)setOpen(false);});
  input.addEventListener('input',()=>{count.textContent=String(input.value.length);if(pending&&pending.text!==input.value.trim())pending=null;});
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();form.requestSubmit();}});
  form.addEventListener('submit',async event=>{event.preventDefault();const text=input.value.trim();if(!text||!allowed()||busy)return;pending=pending?.text===text?pending:{id:crypto.randomUUID(),text};busy=true;updateComposer();try{const result=await api('/chat/messages','POST',pending);renderMessage(result.message);input.value='';count.textContent='0';pending=null;}catch(error){status.textContent=error.message;if(error.status===401||error.status===403)profile=null;}finally{busy=false;const previous=status.textContent;updateComposer();if(previous&&!previous.startsWith('Sending'))status.textContent=previous;}});
  const initiallyOpen=matchMedia('(min-width: 1440px)').matches;
  if(initiallyOpen){panel.hidden=false;shell.classList.add('chat-open');toggle.setAttribute('aria-expanded','true');toggle.setAttribute('aria-label','Close live chat');}
  refresh();
  function rain(data){if(!data?.total)return;const note=document.createElement('p');note.className='live-chat-empty';note.textContent=`Rain shared ${Number(data.total).toLocaleString()} tokens among ${Number(data.count)} players.`;messages.append(note);messages.scrollTop=messages.scrollHeight;}
  setInterval(()=>{if(!panel.hidden)refresh();},30000);
  function remove(id){for(const row of messages.querySelectorAll('[data-message-id]'))if(row.dataset.messageId===id)row.remove();known.delete(id);}
  return {refresh,receive:renderMessage,remove,rain};
};
