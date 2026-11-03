/* Wallet settlement is server-owned; each drop reveals only when its animation lands. */
window.createInstantGamesUI = function ({api, updateBalance, refreshProfile, state, onPendingChange = () => {}}) {
  const $ = id => document.getElementById(id);
  const root = $('instantChassis'), form = $('instantForm'), play = $('instantPlay');
  const jobs = new Map();
  const maxDrops = 32;
  let game = 'coinflip', config = null, coinAnimation = null;
  let historyVersion = 0;
  let plinkoMode = 'manual';
  const auto = window.createPlinkoAutobet({api,onDrop:placeAutoDrop,onChange:renderAuto,onError:error=>message(error.message,true)});
  const ns = 'http://www.w3.org/2000/svg';
  const format = n => Number(n).toLocaleString();
  const mult = n => Number(n).toFixed(6).replace(/0+$/, '').replace(/\.$/, '') + '×';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const storageKey = () => `moonflip_pending_instant_${state.userId}_${game}`;

  function message(text, error = false) {
    $('instantMessage').textContent = text;
    $('instantMessage').classList.toggle('is-error', error);
  }
  function saved(key = storageKey()) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(value) ? value : value ? [value] : [];
    } catch { return []; }
  }
  function storeRequests(requests, key = storageKey()) {
    if (requests.length) localStorage.setItem(key, JSON.stringify(requests));
    else localStorage.removeItem(key);
  }
  function removeRequest(job) {
    storeRequests(saved(job.key).filter(r => r.roundId !== job.request.roundId), job.key);
  }
  function unresolved() { return saved().filter(r => !jobs.has(r.roundId)); }
  function restorePending() {
    const request = saved()[0];
    if (!request) return;
    $('instantWager').value = request.wager;
    if (game === 'plinko') {
      $('plinkoRows').value = request.rows;
      $('plinkoRisk').value = request.risk;
    } else {
      const side = form.querySelector(`input[name="coinSide"][value="${request.choice === 'tails' ? 'tails' : 'heads'}"]`);
      if (side) side.checked = true;
    }
  }
  function sync() {
    restorePending();
    const recovery = unresolved().length;
    const automation = auto.state();
    const autoMode = game === 'plinko' && plinkoMode === 'auto';
    const blocked = game === 'coinflip' ? jobs.size > 0 : jobs.size >= maxDrops;
    play.textContent = recovery ? 'Recover round' : autoMode ? (automation.running ? 'Stop autobet' : automation.run?.status === 'running' ? 'Resume autobet' : 'Start autobet') : game === 'coinflip' ? (jobs.size ? 'Flipping…' : 'Flip coin') : 'Drop ball';
    play.disabled = !state.authenticated || !config || automation.busy || (!automation.running && (blocked || autoMode && jobs.size > 0));
    const locked = jobs.size > 0 || saved().length > 0 || game === 'plinko' && (automation.running || automation.busy || automation.run?.status === 'running');
    form.querySelectorAll('input,select,button[data-instant-adjust]').forEach(el => el.disabled = locked);
    document.querySelectorAll('[data-plinko-mode]').forEach(button => {
      button.classList.toggle('active', button.dataset.plinkoMode === plinkoMode);
      button.setAttribute('aria-pressed', String(button.dataset.plinkoMode === plinkoMode));
      button.disabled = jobs.size > 0 || automation.busy || automation.running;
    });
    $('instantRefresh').disabled = false;
  }
  function renderAuto() {
    const {run,running} = auto.state();
    $('plinkoAutoFields').hidden = game !== 'plinko' || plinkoMode !== 'auto';
    $('plinkoAutoProgress').hidden = game !== 'plinko' || plinkoMode !== 'auto' || !run;
    $('plinkoCancelRun').hidden = game !== 'plinko' || running || run?.status !== 'running';
    $('plinkoCancelRun').disabled = auto.state().busy;
    if (run) {
      $('plinkoAutoCount').textContent = `${run.nextIndex} / ${run.settings.totalBets} bets`;
      $('plinkoAutoMeter').max = run.settings.totalBets;
      $('plinkoAutoMeter').value = run.nextIndex;
      if (game === 'plinko' && run.status === 'running' && !jobs.size) {
        $('instantWager').value = run.settings.wager;
        $('plinkoRows').value = run.settings.rows;
        $('plinkoRisk').value = run.settings.risk;
        $('plinkoAutoBets').value = run.settings.totalBets;
        $('plinkoAutoInterval').value = run.settings.intervalMs;
        drawBoard();
      }
    }
    sync();
  }
  async function placeAutoDrop(settings) {
    if (document.hidden || !state.authenticated || game !== 'plinko' || unresolved().length || jobs.size >= maxDrops) throw new Error('Autobet paused. Recover any pending rounds before resuming.');
    const request = {roundId:crypto.randomUUID(),wager:settings.wager,rows:settings.rows,risk:settings.risk,autoRunId:settings.autoRunId,autoIndex:settings.autoIndex};
    storeRequests([...saved(),request]);
    const resultPromise = enqueue(request);
    sync();onPendingChange();
    return resultPromise;
  }
  function isHiddenRound(roundId) {
    if (!roundId) return false;
    if (jobs.has(roundId)) return true;
    // A pending round stays private even while another view/profile is loading.
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith('moonflip_pending_instant_') && saved(key).some(r => r.roundId === roundId)) return true;
    }
    return false;
  }
  function svg(tag, attributes = {}, parent = $('plinkoBoard')) {
    const element = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    parent.appendChild(element);
    return element;
  }
  function geometry(rows) { return {gap: Math.min(36, 640 / (rows + 2)), dy: 410 / rows, top: 62}; }
  function drawBoard() {
    if (jobs.size) return;
    const board = $('plinkoBoard');
    board.replaceChildren();
    const rows = Number($('plinkoRows').value), risk = $('plinkoRisk').value;
    const payouts = config?.plinko[rows]?.[risk];
    if (!payouts) return;
    const {gap, dy, top} = geometry(rows);
    for (let r = 0; r < rows; r++) for (let j = 0; j < r + 3; j++) {
      svg('circle', {cx: 360 + (j - (r + 2) / 2) * gap, cy: top + r * dy, r: 3.4, fill: '#aebbc7'});
    }
    payouts.forEach((value, k) => {
      const distance = Math.abs(k - rows / 2) / (rows / 2);
      const fill = distance > .75 ? '#e96b54' : distance > .45 ? '#e8a34e' : '#d9bd63';
      const group = svg('g', {tabindex: 0, role: 'button', 'aria-label': `Bucket ${k + 1}: ${mult(value)}`, 'data-bucket': k});
      svg('rect', {x: 360 + (k - rows / 2) * gap - gap * .46, y: top + rows * dy + 10, width: gap * .92, height: 30, rx: 4, fill, stroke: 'none', 'stroke-width': 2}, group);
      const label = svg('text', {x: 360 + (k - rows / 2) * gap, y: top + rows * dy + 29, 'text-anchor': 'middle', fill: '#241a0d', 'font-size': rows > 12 ? 9 : 11, 'font-family': 'Inter, sans-serif', 'font-weight': 700}, group);
      label.textContent = Number(value.toFixed(1)) + '×';
      const show = () => { $('plinkoBucketDetail').textContent = mult(value); };
      group.addEventListener('click', show);
      group.addEventListener('focus', show);
      group.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(); } });
    });
  }
  async function animate(result) {
    const duration = reduced() ? 0 : result.game === 'coinflip' ? 1250 : 1800;
    if (result.game === 'coinflip') {
      coinAnimation?.cancel();
      const coin = $('instantCoin'), end = result.outcome === 'tails' ? 180 : 0;
      coin.style.transform = `rotateY(${end}deg)`;
      coinAnimation = coin.animate([{transform: 'translateY(0) rotateY(0)'}, {transform: 'translateY(-36px) rotateY(720deg)', offset: .45}, {transform: `translateY(0) rotateY(${1440 + end}deg)`}], {duration, easing: 'cubic-bezier(.2,.65,.3,1)'});
      await coinAnimation.finished;
      return;
    }
    const {gap, dy, top} = geometry(result.rows);
    const ball = svg('circle', {'data-plinko-ball': result.roundId, cx: 360, cy: top - 25, r: 7, fill: '#2ef2b8'});
    let x = 360;
    const points = [{x, y: top - 25}];
    for (let i = 0; i < result.path.length; i++) {
      x += (result.path[i] === 1 ? 1 : -1) * gap / 2;
      points.push({x, y: top + (i + .7) * dy});
    }
    points.push({x, y: top + result.rows * dy + 20});
    try {
      if (duration) await new Promise((resolve, reject) => {
        const start = performance.now();
        const frame = now => {
          try {
          const progress = Math.max(0, Math.min(1, (now - start) / duration)), scaled = progress * (points.length - 1);
          const index = Math.min(points.length - 2, Math.floor(scaled)), t = scaled - index;
          const a = points[index], b = points[index + 1];
          ball.setAttribute('cx', a.x + (b.x - a.x) * t);
          ball.setAttribute('cy', a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * 5);
          if (progress < 1) requestAnimationFrame(frame); else resolve();
          } catch(error) { reject(error); }
        };
        requestAnimationFrame(frame);
      });
      const bucket = $('plinkoBoard').querySelector(`[data-bucket="${result.bucket}"] rect`);
      bucket?.setAttribute('stroke', '#fff');
    } finally { ball.remove(); }
  }
  function showResult(result) {
    const holder = $('instantResult');
    holder.replaceChildren();
    holder.classList.toggle('is-win', result.profit > 0);
    const title = document.createElement('strong'), detail = document.createElement('span');
    title.textContent = result.game === 'coinflip' ? `${result.outcome === 'heads' ? 'Heads' : 'Tails'} · ${result.payout ? 'You won' : 'No win'}` : `${Number(result.multiplier.toFixed(2))}× · ${format(result.payout)} tokens`;
    detail.textContent = `${result.profit >= 0 ? '+' : ''}${format(result.profit)} net`;
    holder.append(title, detail);
  }
  async function history() {
    if (!state.authenticated) { $('instantHistory').textContent = 'Link your Discord wallet to see your rounds.'; return; }
    const view = game, version = ++historyVersion;
    try {
      const data = await api('/instant/history');
      if (view !== game || version !== historyVersion) return;
      const list = data.rounds.filter(r => r.game === game && !isHiddenRound(r.roundId));
      const host = $('instantHistory');
      host.replaceChildren();
      if (!list.length) { host.textContent = 'Your completed rounds will appear here.'; return; }
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>Result</th><th>Bet</th><th>Returned</th><th>Net</th></tr></thead>';
      const body = document.createElement('tbody');
      for (const result of list.slice(0, 8)) {
        const row = document.createElement('tr');
        for (const value of [result.game === 'coinflip' ? result.outcome : Number(result.multiplier.toFixed(2)) + '×', format(result.wager), format(result.payout), (result.profit >= 0 ? '+' : '') + format(result.profit)]) {
          const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
        }
        if (result.profit > 0) row.lastChild.classList.add('positive');
        body.appendChild(row);
      }
      table.appendChild(body); host.appendChild(table);
    } catch { if (view === game) $('instantHistory').textContent = 'History unavailable. Try Refresh.'; }
  }
  function finish(job, failed = false) {
    jobs.delete(job.request.roundId);
    sync();
    if (!failed) message(jobs.size ? `${jobs.size} balls in play` : '');
    onPendingChange();
    history();
    if (!jobs.size) refreshProfile();
  }
  async function settle(job) {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await api(`/${job.game}/play`, 'POST', job.request, {signal:controller.signal});
      updateBalance(result.balance, true);
      // Each committed drop animates independently from all other requests.
      animate(result).then(() => {
        showResult(result);
        removeRequest(job);
        finish(job);
      }).catch(() => {
        message('Use Recover round to finish this drop.', true);
        finish(job, true);
      });
      return result;
    } catch (error) {
      if (error.status === 400) { removeRequest(job); message(error.message, true); }
      else if (error.status === 401) message('Reconnect your Discord wallet, then recover your rounds.', true);
      else message('Connection interrupted. Use Recover round.', true);
      finish(job, true);
    } finally { clearTimeout(deadline); }
  }
  function enqueue(request) {
    const job = {request, key: storageKey(), game};
    jobs.set(request.roundId, job);
    return settle(job).catch(() => { message('Use Recover round to continue.', true); finish(job, true); });
  }
  function submit(event) {
    event.preventDefault();
    if (game === 'plinko' && plinkoMode === 'auto' && auto.state().running) { auto.stop();return; }
    if (!state.authenticated || !config || jobs.size >= maxDrops || game === 'coinflip' && jobs.size) return;
    if (game === 'plinko' && plinkoMode === 'auto' && !unresolved().length) {
      if (jobs.size || auto.state().busy) return;
      const totalBets=Number($('plinkoAutoBets').value), intervalMs=Number($('plinkoAutoInterval').value);
      if (!Number.isInteger(totalBets) || totalBets < 1 || totalBets > 1000) { message('Choose between 1 and 1,000 bets.',true);return; }
      auto.start({wager:Number($('instantWager').value),rows:Number($('plinkoRows').value),risk:$('plinkoRisk').value,totalBets,intervalMs});
      return;
    }
    const recovery = unresolved();
    if (recovery.length) {
      recovery.slice(0, maxDrops - jobs.size).forEach(enqueue);
    } else {
      const request = {roundId: crypto.randomUUID(), wager: Number($('instantWager').value), ...(game === 'coinflip' ? {choice: form.elements.coinSide.value} : {rows: Number($('plinkoRows').value), risk: $('plinkoRisk').value})};
      if (!Number.isSafeInteger(request.wager) || request.wager < 10 || request.wager > 1000000) { message('Enter a whole-token bet from 10 to 1,000,000.', true); return; }
      try { storeRequests([...saved(), request]); }
      catch { message('Enable browser storage to recover interrupted rounds.', true); return; }
      enqueue(request);
    }
    if (game === 'plinko') $('plinkoBoard').querySelectorAll('rect').forEach(rect => rect.setAttribute('stroke', 'none'));
    sync(); onPendingChange();
    message(game === 'plinko' ? `${jobs.size} ${jobs.size === 1 ? 'ball' : 'balls'} in play` : 'Flipping…');
  }
  form.addEventListener('submit', submit);
  $('instantRefresh').addEventListener('click', history);
  $('plinkoCancelRun').addEventListener('click',()=>auto.stop());
  document.querySelectorAll('[data-plinko-mode]').forEach(button=>button.addEventListener('click',async()=>{
    if(jobs.size || auto.state().running || auto.state().busy)return;
    if(button.dataset.plinkoMode==='manual' && auto.state().run?.status==='running') {
      await auto.stop();if(auto.state().run?.status==='running')return;
    }
    plinkoMode=button.dataset.plinkoMode;renderAuto();
  }));
  document.addEventListener('visibilitychange',()=>{if(document.hidden && auto.state().running)auto.stop();});
  for (const id of ['plinkoRows', 'plinkoRisk']) $(id).addEventListener('change', drawBoard);
  form.querySelectorAll('[data-instant-adjust]').forEach(button => button.addEventListener('click', () => {
    const current = Number($('instantWager').value) || 10;
    $('instantWager').value = Math.min(1000000, Math.max(10, Math.floor(button.dataset.instantAdjust === 'half' ? current / 2 : current * 2)));
  }));
  return {
    async show(next) {
      if (jobs.size || auto.state().running || auto.state().busy) return false;
      game = next; root.hidden = false;
      $('instantTitle').textContent = $('instantArenaLabel').textContent = game === 'coinflip' ? 'Coinflip' : 'Plinko';
      $('coinflipOptions').hidden = $('coinStage').hidden = game !== 'coinflip';
      $('plinkoOptions').hidden = $('plinkoStage').hidden = $('plinkoModeTabs').hidden = game !== 'plinko';
      renderAuto();
      $('instantResult').replaceChildren();
      message(state.authenticated ? '' : 'Link your Discord wallet to play.');
      sync();
      try {
        config ||= await api('/instant/config');
        restorePending(); drawBoard(); sync();
        if (saved().length) message('Use Recover round to finish your interrupted drops.');
      } catch { message('Game unavailable. Reopen it to retry.', true); }
      if(game==='plinko' && state.authenticated)auto.load().then(run=>{if(run?.status==='running'){plinkoMode='auto';renderAuto();message('Autobet paused. Choose Resume or switch to Manual to stop.');}}).catch(()=>message('Autobet status unavailable.',true));
      history(); return true;
    },
    hide() { if (jobs.size || auto.state().running || auto.state().busy) return false; root.hidden = true; return true; },
    isBusy: () => jobs.size > 0 || auto.state().running || auto.state().busy,
    isHiddenRound,
    sync,
    profile() {
      sync();
      if (!root.hidden) {
        if(game==='plinko' && state.authenticated && !auto.state().running && !auto.state().busy)auto.load().then(run=>{if(run?.status==='running'&&!auto.state().running){plinkoMode='auto';renderAuto();}}).catch(()=>{});
        if (!jobs.size && saved().length) { drawBoard(); message('Use Recover round to finish your interrupted drops.'); }
        history();
      }
    }
  };
};
