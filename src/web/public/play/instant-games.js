/* Server outcomes drive presentation; animation never chooses or settles a bet. */
window.createInstantGamesUI = function ({api, updateBalance, refreshProfile, state}) {
  const $=id=>document.getElementById(id);
  const root=$('instantChassis'), form=$('instantForm'), play=$('instantPlay');
  let game='coinflip', config=null, busy=false, animation=null, boardAnimation=null;
  const ns='http://www.w3.org/2000/svg';
  const format=n=>Number(n).toLocaleString();
  const mult=n=>Number(n).toFixed(6).replace(/0+$/,'').replace(/\.$/,'')+'×';
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function message(text,error=false){$('instantMessage').textContent=text;$('instantMessage').classList.toggle('is-error',error);}
  const storageKey=()=>`moonflip_pending_instant_${state.userId}_${game}`;
  function pending(){try{return JSON.parse(localStorage.getItem(storageKey()) || 'null');}catch{return null;}}
  function restorePending(){
    const request=pending();if(!request)return;
    $('instantWager').value=request.wager;
    if(game==='plinko'){ $('plinkoRows').value=request.rows; $('plinkoRisk').value=request.risk; }
    else { const side=form.querySelector(`input[name="coinSide"][value="${request.choice==='tails'?'tails':'heads'}"]`); if(side)side.checked=true; }
  }
  function sync(){
    $('instantBalance').textContent=format(state.balance);
    restorePending();
    const p=pending();
    play.textContent=busy?'Settling round…':p?'Recover round':game==='coinflip'?'Flip coin':'Drop ball';
    play.disabled=busy || !state.authenticated || !config;
    form.querySelectorAll('input,select,button[data-instant-adjust]').forEach(x=>x.disabled=busy || Boolean(p));
    $('instantRefresh').disabled=busy;
  }
  function svg(tag,attributes={},parent=$('plinkoBoard')){const el=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attributes))el.setAttribute(k,v);parent.appendChild(el);return el;}
  function geometry(rows){return {gap:Math.min(36,640/(rows+2)),dy:410/rows,top:62};}
  function drawBoard(result=null){
    const board=$('plinkoBoard');board.replaceChildren();
    const rows=result?.rows || Number($('plinkoRows').value),risk=result?.risk || $('plinkoRisk').value;
    const payouts=result?.multipliers || config?.plinko[rows]?.[risk];if(!payouts)return;
    const {gap,dy,top}=geometry(rows);
    for(let r=0;r<rows;r++) for(let j=0;j<r+3;j++) svg('circle',{cx:360+(j-(r+2)/2)*gap,cy:top+r*dy,r:3.4,fill:'#aebbc7'});
    payouts.forEach((value,k)=>{
      const distance=Math.abs(k-rows/2)/(rows/2);
      const fill=distance>.75?'#e96b54':distance>.45?'#e8a34e':'#d9bd63';
      const group=svg('g',{tabindex:0,role:'button','aria-label':`Bucket ${k+1}: ${mult(value)}`,'data-bucket':k});
      svg('rect',{x:360+(k-rows/2)*gap-gap*.46,y:top+rows*dy+10,width:gap*.92,height:30,rx:4,fill,stroke:result?.bucket===k?'#fff':'none','stroke-width':2},group);
      const text=svg('text',{x:360+(k-rows/2)*gap,y:top+rows*dy+29,'text-anchor':'middle',fill:'#241a0d','font-size':rows>12?9:11,'font-family':'Inter, sans-serif','font-weight':700},group);
      text.textContent=Number(value.toFixed(1))+'×';
      const show=()=>{let c=1;for(let i=1;i<=k;i++)c=c*(rows-i+1)/i;$('plinkoBucketDetail').textContent=`Bucket ${k+1} · ${mult(value)} · ${(c/2**rows*100).toFixed(4)}% probability`;};
      group.addEventListener('click',show);group.addEventListener('focus',show);group.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show();}});
    });
    svg('circle',{id:'plinkoBall',cx:360,cy:top-25,r:7,fill:'#2ef2b8'});
  }
  async function animate(result){
    const duration=reduced()?0:game==='coinflip'?1250:1800;
    if(game==='coinflip'){
      animation?.cancel();
      const coin=$('instantCoin');
      const end=result.outcome==='tails'?180:0;
      coin.style.transform=`rotateY(${end}deg)`;
      animation=coin.animate([{transform:'translateY(0) rotateY(0)'},{transform:'translateY(-36px) rotateY(720deg)',offset:.45},{transform:`translateY(0) rotateY(${1440+end}deg)`}],{duration,easing:'cubic-bezier(.2,.65,.3,1)'});
      await animation.finished;
    } else {
      drawBoard(result);
      const ball=$('plinkoBall'),{gap,dy,top}=geometry(result.rows);
      let x=360;const points=[{x,y:top-25}];
      for(let i=0;i<result.path.length;i++){x+=(result.path[i]===1?1:-1)*gap/2;points.push({x,y:top+(i+.7)*dy});}
      points.push({x,y:top+result.rows*dy+20});
      if(!duration){ball.setAttribute('cx',x);ball.setAttribute('cy',points.at(-1).y);return;}
      await new Promise(resolve=>{
        const start=performance.now();
        const frame=now=>{
          const progress=Math.min(1,(now-start)/duration),scaled=progress*(points.length-1),index=Math.min(points.length-2,Math.floor(scaled)),t=scaled-index;
          const a=points[index],b=points[index+1];
          ball.setAttribute('cx',a.x+(b.x-a.x)*t);ball.setAttribute('cy',a.y+(b.y-a.y)*t-Math.sin(t*Math.PI)*5);
          if(progress<1)boardAnimation=requestAnimationFrame(frame);else resolve();
        };boardAnimation=requestAnimationFrame(frame);
      });
      const bucket=$('plinkoBoard').querySelector(`[data-bucket="${result.bucket}"] rect`);bucket?.setAttribute('stroke','#fff');
      bucket?.setAttribute('stroke-width',2);
    }
  }
  function showResult(result){
    const holder=$('instantResult');holder.replaceChildren();holder.classList.toggle('is-win',result.profit>0);
    const title=document.createElement('strong'),detail=document.createElement('span');
    title.textContent=result.game==='coinflip'?`${result.outcome==='heads'?'Heads':'Tails'} · ${result.payout?'You won':'No win'}`:`${mult(result.multiplier)} · ${format(result.payout)} tokens returned`;
    detail.textContent=`${result.profit>=0?'+':''}${format(result.profit)} net · Bet ${format(result.wager)} · Round ${result.roundId.slice(0,8)}`;
    holder.append(title,detail);
  }
  async function history(){
    if(!state.authenticated){$('instantHistory').textContent='Link your Discord wallet to see your rounds.';return;}
    try {
      const data=await api('/instant/history');const list=data.rounds.filter(r=>r.game===game);
      const host=$('instantHistory');host.replaceChildren();
      if(!list.length){host.textContent='No rounds yet. Your completed rounds will appear here.';return;}
      const table=document.createElement('table');table.innerHTML='<thead><tr><th>Result</th><th>Bet</th><th>Returned</th><th>Net</th></tr></thead>';
      const body=document.createElement('tbody');
      for(const r of list.slice(0,8)){
        const row=document.createElement('tr');row.title=`Round ${r.roundId} · ${new Date(r.timestamp).toLocaleString()}`;
        for(const value of [r.game==='coinflip'?r.outcome:mult(r.multiplier),format(r.wager),format(r.payout),(r.profit>=0?'+':'')+format(r.profit)]){const td=document.createElement('td');td.textContent=value;row.appendChild(td);}
        if(r.profit>0)row.lastChild.classList.add('positive');body.appendChild(row);
      }table.appendChild(body);host.appendChild(table);
    }catch{ $('instantHistory').textContent='History unavailable. Use Refresh to try again.'; }
  }
  async function submit(event){
    event.preventDefault();if(busy || !state.authenticated || !config)return;
    let request=pending();
    if(!request){
      request={roundId:crypto.randomUUID(),wager:Number($('instantWager').value),...(game==='coinflip'?{choice:form.elements.coinSide.value}:{rows:Number($('plinkoRows').value),risk:$('plinkoRisk').value})};
      if(!Number.isSafeInteger(request.wager)||request.wager<10||request.wager>1000000){message('Enter a whole-token bet from 10 to 1,000,000.',true);return;}
      try{localStorage.setItem(storageKey(),JSON.stringify(request));}catch{message('Enable browser storage so interrupted requests can be recovered.',true);return;}
    }
    busy=true;sync();message('Confirming your round…');
    let result;
    try{
      result=await api(`/${game}/play`,'POST',request);
      updateBalance(result.balance,true);
      message('Round confirmed.');
      await animate(result);
      showResult(result);
      localStorage.removeItem(storageKey());
      history();
    }catch(error){
      if(error.status===400){localStorage.removeItem(storageKey());message(error.message,true);}
      else if(error.status===401) message('Session expired. Reconnect your Discord wallet, then recover this saved round.',true);
      else message('Connection interrupted. Use Recover round to retrieve this same bet safely.',true);
    }finally{busy=false;sync();refreshProfile();}
  }
  form.addEventListener('submit',submit);
  $('instantRefresh').addEventListener('click',history);
  for(const id of ['plinkoRows','plinkoRisk']) $(id).addEventListener('change',()=>drawBoard());
  form.querySelectorAll('[data-instant-adjust]').forEach(button=>button.addEventListener('click',()=>{
    const current=Number($('instantWager').value)||10;
    $('instantWager').value=Math.min(1000000,Math.max(10,Math.floor(button.dataset.instantAdjust==='half'?current/2:current*2)));
  }));
  return {
    async show(next){
      if(busy && next!==game)return false;
      game=next;root.hidden=false;
      $('instantTitle').textContent=$('instantArenaLabel').textContent=game==='coinflip'?'Coinflip':'Plinko';
      $('coinflipOptions').hidden=$('coinStage').hidden=$('coinflipPayout').hidden=game!=='coinflip';
      $('plinkoOptions').hidden=$('plinkoStage').hidden=game!=='plinko';
      $('instantEdge').textContent=game==='coinflip'?'4%':'1%';
      $('instantDisclosure').textContent=game==='coinflip'?'Heads and tails each have a 50% chance. Winning payout is 1.92× including stake. Payouts round down to whole tokens.':'Each peg is an independent 50/50 step. Theoretical RTP is up to 99% before whole-token rounding. Bucket labels are rounded; select one for its exact rate.';
      $('instantResult').replaceChildren();message(state.authenticated?'Choose your bet to begin.':'Link your Discord wallet to play.');
      sync();
      try{config ||= await api('/instant/config');drawBoard();sync();if(pending())message('An interrupted round is saved. Use Recover round before placing another bet.');}catch{message('Game configuration unavailable. Reopen the game to retry.',true);}
      history();return true;
    },
    hide(){if(busy)return false;root.hidden=true;return true;},
    isBusy:()=>busy,
    sync,
    profile(){sync();if(!root.hidden){if(pending())drawBoard();history();if(state.authenticated && pending())message('An interrupted round is saved. Use Recover round before placing another bet.');}}
  };
};
