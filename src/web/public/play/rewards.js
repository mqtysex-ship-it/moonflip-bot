window.createRewardsUI = function ({api, state, updateBalance, refreshProfile}) {
  const modal = document.getElementById('rewardsModal');
  const button = document.getElementById('claimDailyReward');
  const status = document.getElementById('rewardsStatus');
  let loading = false, availableAt = null, clockOffset = 0, timer = null, returnFocus = null;
  const key = () => `moonflip_pending_daily_${state.userId}`;
  const pending = () => localStorage.getItem(key());
  const isOpen = () => modal.classList.contains('active');
  function render() {
    clearTimeout(timer);
    const remaining = Math.max(0, (availableAt || 0) - Date.now() - clockOffset);
    button.disabled = loading || !state.authenticated || availableAt === null || remaining > 0 && !pending();
    button.textContent = loading ? 'Please wait…' : pending() ? 'Recover reward' : remaining > 0 ? 'Claimed' : 'Claim 500 tokens';
    if (isOpen() && remaining > 0 && !loading) {
      const hours = Math.floor(remaining / 3600000), minutes = Math.floor(remaining % 3600000 / 60000), seconds = Math.floor(remaining % 60000 / 1000);
      status.textContent = `Next reward in ${hours}h ${minutes}m ${seconds}s`;
      timer = setTimeout(render, 1000);
    }
  }
  async function load() {
    if (!state.authenticated) { availableAt = null; status.textContent = 'Link your Discord wallet to claim.'; render(); return; }
    loading = true; status.textContent = 'Checking your reward…'; render();
    try {
      const data = await api('/rewards');
      availableAt = data.availableAt; clockOffset = data.serverNow - Date.now();
      status.textContent = data.available ? 'Your daily reward is ready.' : '';
    } catch (error) { availableAt = null; status.textContent = error.message; }
    finally { loading = false; render(); }
  }
  button.addEventListener('click', async () => {
    if (loading || !state.authenticated) return;
    let operationId;
    try { operationId = pending() || crypto.randomUUID(); localStorage.setItem(key(), operationId); }
    catch { status.textContent = 'Enable browser storage to recover your claim.'; return; }
    loading = true; status.textContent = 'Claiming your reward…'; render();
    try {
      const result = await api('/rewards/claim', 'POST', {operationId});
      localStorage.removeItem(key());
      availableAt = result.availableAt; clockOffset = result.serverNow - Date.now();
      updateBalance(result.balance, true);
      status.textContent = result.success ? '500 tokens added to your wallet.' : 'Your daily reward has already been claimed.';
      refreshProfile();
    } catch (error) { status.textContent = error.message; }
    finally { loading = false; render(); }
  });
  function close() { modal.classList.remove('active'); clearTimeout(timer); returnFocus?.focus(); }
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
    open() { returnFocus = document.activeElement; modal.classList.add('active'); document.getElementById('closeRewards').focus(); load(); },
    profile() { if (isOpen() && !loading) load(); }
  };
};
