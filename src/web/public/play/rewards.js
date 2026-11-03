window.createRewardsUI = function ({api, state, updateBalance, refreshProfile}) {
  const modal = document.getElementById('rewardsModal');
  const tabDaily = document.getElementById('tabDailyReward');
  const tabRakeback = document.getElementById('tabRakeback');
  const panelDaily = document.getElementById('panelDailyReward');
  const panelRakeback = document.getElementById('panelRakeback');

  const dailyButton = document.getElementById('claimDailyReward');
  const dailyStatus = document.getElementById('rewardsStatus');

  const rakebackButton = document.getElementById('claimRakeback');
  const rakebackStatus = document.getElementById('rakebackStatus');
  const rakebackAmountEl = document.getElementById('rakebackAmount');
  const rakebackWageredEl = document.getElementById('rakebackWagered');
  const rakebackClaimedEl = document.getElementById('rakebackClaimed');

  let loadingDaily = false;
  let loadingRakeback = false;
  let availableAt = null;
  let clockOffset = 0;
  let timer = null;
  let returnFocus = null;
  let rakebackData = null;

  const dailyKey = () => `moonflip_pending_daily_${state.userId}`;
  const dailyPending = () => localStorage.getItem(dailyKey());

  const rakebackKey = () => `moonflip_pending_rakeback_${state.userId}`;
  const rakebackPending = () => localStorage.getItem(rakebackKey());

  const isOpen = () => modal.classList.contains('active');

  function switchTab(tab) {
    if (tab === 'daily') {
      tabDaily?.classList.add('active');
      tabDaily?.setAttribute('aria-selected', 'true');
      tabRakeback?.classList.remove('active');
      tabRakeback?.setAttribute('aria-selected', 'false');
      if (panelDaily) panelDaily.hidden = false;
      if (panelRakeback) panelRakeback.hidden = true;
    } else {
      tabRakeback?.classList.add('active');
      tabRakeback?.setAttribute('aria-selected', 'true');
      tabDaily?.classList.remove('active');
      tabDaily?.setAttribute('aria-selected', 'false');
      if (panelRakeback) panelRakeback.hidden = false;
      if (panelDaily) panelDaily.hidden = true;
    }
  }

  tabDaily?.addEventListener('click', () => switchTab('daily'));
  tabRakeback?.addEventListener('click', () => switchTab('rakeback'));

  function renderDaily() {
    clearTimeout(timer);
    const remaining = Math.max(0, (availableAt || 0) - Date.now() - clockOffset);
    dailyButton.disabled = loadingDaily || !state.authenticated || availableAt === null || (remaining > 0 && !dailyPending());
    dailyButton.textContent = loadingDaily ? 'Please wait…' : dailyPending() ? 'Recover reward' : remaining > 0 ? 'Claimed' : 'Claim 500 tokens';
    if (isOpen() && remaining > 0 && !loadingDaily) {
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      dailyStatus.textContent = `Next reward in ${hours}h ${minutes}m ${seconds}s`;
      timer = setTimeout(renderDaily, 1000);
    }
  }

  function renderRakeback() {
    if (!rakebackButton) return;
    const available = rakebackData?.available || 0;
    const totalWagered = rakebackData?.totalWagered || 0;
    const lifetimeClaimed = rakebackData?.lifetimeClaimed || 0;

    if (rakebackAmountEl) rakebackAmountEl.textContent = available.toLocaleString();
    if (rakebackWageredEl) rakebackWageredEl.textContent = totalWagered.toLocaleString();
    if (rakebackClaimedEl) rakebackClaimedEl.textContent = lifetimeClaimed.toLocaleString();

    if (!state.authenticated) {
      rakebackButton.disabled = true;
      rakebackButton.textContent = 'Claim Rakeback';
      if (rakebackStatus) rakebackStatus.textContent = 'Link your Discord wallet to claim rakeback.';
      return;
    }

    if (loadingRakeback) {
      rakebackButton.disabled = true;
      rakebackButton.textContent = 'Please wait…';
      return;
    }

    if (rakebackPending()) {
      rakebackButton.disabled = false;
      rakebackButton.textContent = 'Recover rakeback';
      if (rakebackStatus) rakebackStatus.textContent = 'Recovering your pending rakeback claim…';
      return;
    }

    if (available >= 1) {
      rakebackButton.disabled = false;
      rakebackButton.textContent = `Claim ${available.toLocaleString()} tokens`;
      if (rakebackStatus) rakebackStatus.textContent = `${available.toLocaleString()} rakeback tokens ready to claim!`;
    } else {
      rakebackButton.disabled = true;
      rakebackButton.textContent = 'Claim Rakeback';
      if (rakebackStatus) rakebackStatus.textContent = 'Wager tokens across any game to accumulate rakeback.';
    }
  }

  function render() {
    renderDaily();
    renderRakeback();
  }

  async function load() {
    if (!state.authenticated) {
      availableAt = null;
      rakebackData = null;
      dailyStatus.textContent = 'Link your Discord wallet to claim.';
      if (rakebackStatus) rakebackStatus.textContent = 'Link your Discord wallet to claim.';
      render();
      return;
    }
    loadingDaily = true;
    loadingRakeback = true;
    dailyStatus.textContent = 'Checking rewards…';
    if (rakebackStatus) rakebackStatus.textContent = 'Loading rakeback…';
    render();
    try {
      const data = await api('/rewards');
      availableAt = data.availableAt;
      clockOffset = data.serverNow - Date.now();
      dailyStatus.textContent = data.available ? 'Your daily reward is ready.' : '';
      if (data.rakeback) {
        rakebackData = data.rakeback;
      }
    } catch (error) {
      availableAt = null;
      dailyStatus.textContent = error.message;
      if (rakebackStatus) rakebackStatus.textContent = error.message;
    } finally {
      loadingDaily = false;
      loadingRakeback = false;
      render();
    }
  }

  dailyButton.addEventListener('click', async () => {
    if (loadingDaily || !state.authenticated) return;
    let operationId;
    try {
      operationId = dailyPending() || crypto.randomUUID();
      localStorage.setItem(dailyKey(), operationId);
    } catch {
      dailyStatus.textContent = 'Enable browser storage to recover your claim.';
      return;
    }
    loadingDaily = true;
    dailyStatus.textContent = 'Claiming your reward…';
    renderDaily();
    try {
      const result = await api('/rewards/claim', 'POST', {operationId});
      localStorage.removeItem(dailyKey());
      availableAt = result.availableAt;
      clockOffset = result.serverNow - Date.now();
      updateBalance(result.balance, true);
      dailyStatus.textContent = result.success ? '500 tokens added to your wallet.' : 'Your daily reward has already been claimed.';
      refreshProfile();
    } catch (error) {
      dailyStatus.textContent = error.message;
    } finally {
      loadingDaily = false;
      renderDaily();
    }
  });

  rakebackButton?.addEventListener('click', async () => {
    if (loadingRakeback || !state.authenticated) return;
    let operationId;
    try {
      operationId = rakebackPending() || crypto.randomUUID();
      localStorage.setItem(rakebackKey(), operationId);
    } catch {
      if (rakebackStatus) rakebackStatus.textContent = 'Enable browser storage to recover your claim.';
      return;
    }
    loadingRakeback = true;
    if (rakebackStatus) rakebackStatus.textContent = 'Claiming rakeback…';
    renderRakeback();
    try {
      const result = await api('/rewards/rakeback/claim', 'POST', {operationId});
      localStorage.removeItem(rakebackKey());
      if (result.rakeback) {
        rakebackData = result.rakeback;
      } else if (rakebackData) {
        rakebackData.available = 0;
        rakebackData.claimedWager = (rakebackData.claimedWager || 0) + Math.floor((result.amount || 0) / 0.005);
        rakebackData.lifetimeClaimed = result.lifetimeClaimed ?? ((rakebackData.lifetimeClaimed || 0) + (result.amount || 0));
      }
      updateBalance(result.balance, true);
      if (rakebackStatus) {
        rakebackStatus.textContent = result.success
          ? `+${result.amount.toLocaleString()} tokens added from rakeback!`
          : (result.reason || 'No rakeback available to claim.');
      }
      refreshProfile();
    } catch (error) {
      if (rakebackStatus) rakebackStatus.textContent = error.message;
    } finally {
      loadingRakeback = false;
      renderRakeback();
    }
  });

  function close() {
    modal.classList.remove('active');
    clearTimeout(timer);
    returnFocus?.focus();
  }
  document.getElementById('closeRewards').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not(:disabled)')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  return {
    open() {
      returnFocus = document.activeElement;
      modal.classList.add('active');
      document.getElementById('closeRewards').focus();
      load();
    },
    profile() {
      if (isOpen() && !loadingDaily && !loadingRakeback) load();
    }
  };
};
