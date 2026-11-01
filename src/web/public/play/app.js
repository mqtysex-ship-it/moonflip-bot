/**
 * MOONFLIP CASINO — 5x5 MINES ARENA
 * High-Precision Luxury Gaming Engine & Audio Synthesizer
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. STATE & CONSTANTS
  // =========================================================================

  const API_BASE = '/api/play';
  const urlParams = new URLSearchParams(window.location.search);
  const playToken = urlParams.get('token') || localStorage.getItem('moonflip_play_token') || null;

  if (urlParams.get('token')) {
    localStorage.setItem('moonflip_play_token', urlParams.get('token'));
  }

  const state = {
    authenticated: false,
    userId: null,
    username: 'Guest',
    balance: 1000,
    wager: 100,
    bombs: 3,
    activeGame: false,
    cashedOut: false,
    peekMode: false,
    currentMult: 1.0,
    currentWin: 0,
    revealedIndices: new Set(),
    isProcessing: false,
    soundEnabled: localStorage.getItem('moonflip_sound_muted') !== 'true',
  };

  // =========================================================================
  // 2. STUDIO-GRADE WEB AUDIO SYNTHESIZER
  // =========================================================================

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  const Sound = {
    // Mechanical key click
    click() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.03);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.03);
    },

    // Crystalline ascending gem chime
    gem(streak = 1) {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
      const freq = scale[Math.min(streak - 1, scale.length - 1)];

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(freq, ctx.currentTime);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.5);
      osc2.stop(ctx.currentTime + 0.5);
    },

    // Deep 808 cinematic mine detonation
    bomb() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      // Sub drop
      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(130, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.6);

      subGain.gain.setValueAtTime(0.4, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start();
      sub.stop(ctx.currentTime + 0.6);

      // Distorted noise blast
      const bufferSize = ctx.sampleRate * 0.45;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.45);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
    },

    // Victorious Cashout Fanfare & Coin Cascade
    cashout() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const chord = [523.25, 659.25, 783.99, 1046.5];
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.08);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.08);
        osc.stop(ctx.currentTime + i * 0.08 + 0.45);
      });
    },
  };

  // =========================================================================
  // 3. BESPOKE 3D VECTOR GRAPHICS (Luxury Gems & Deadly Naval Mines)
  // =========================================================================

  const SVG_GEM = `
    <svg class="diamond-3d-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="gemInnerGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#00f0ff" stop-opacity="0.8"/>
          <stop offset="60%" stop-color="#00b4d8" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#0077b6" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="facetCenter" x1="50" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#00f0ff"/>
          <stop offset="1" stop-color="#023e8a"/>
        </linearGradient>
        <linearGradient id="facetLeft" x1="16" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#0096c7"/>
          <stop offset="1" stop-color="#03045e"/>
        </linearGradient>
        <linearGradient id="facetRight" x1="84" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#48cae4"/>
          <stop offset="1" stop-color="#0077b6"/>
        </linearGradient>
        <linearGradient id="facetCrown" x1="50" y1="16" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#caf0f8"/>
          <stop offset="1" stop-color="#00b4d8"/>
        </linearGradient>
      </defs>
      <!-- Ambient Glow Disk -->
      <circle cx="50" cy="50" r="44" fill="url(#gemInnerGlow)"/>
      <!-- Bottom Pavillion Center -->
      <polygon points="50,88 32,42 68,42" fill="url(#facetCenter)"/>
      <!-- Bottom Pavillion Left -->
      <polygon points="14,42 32,42 50,88" fill="url(#facetLeft)"/>
      <!-- Bottom Pavillion Right -->
      <polygon points="86,42 68,42 50,88" fill="url(#facetRight)"/>
      <!-- Top Crown Table -->
      <polygon points="34,16 66,16 68,42 32,42" fill="url(#facetCrown)"/>
      <!-- Top Crown Left Triangle -->
      <polygon points="20,24 34,16 32,42 14,42" fill="#48cae4"/>
      <!-- Top Crown Right Triangle -->
      <polygon points="80,24 66,16 68,42 86,42" fill="#ade8f4"/>
      <!-- Specular Shimmer Star -->
      <polygon points="40,22 46,20 44,28 38,26" fill="#ffffff" opacity="0.9"/>
      <circle cx="60" cy="30" r="1.5" fill="#ffffff" opacity="0.75"/>
    </svg>
  `;

  const SVG_MINE = `
    <svg class="mine-3d-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="mineShell" cx="42%" cy="38%" r="60%">
          <stop offset="0%" stop-color="#3d4952"/>
          <stop offset="60%" stop-color="#1c242b"/>
          <stop offset="100%" stop-color="#0a0e12"/>
        </radialGradient>
        <radialGradient id="sensorGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#ff1f44"/>
          <stop offset="70%" stop-color="#b91c1c"/>
          <stop offset="100%" stop-color="#450a0a"/>
        </radialGradient>
        <linearGradient id="spikeMetal" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ff3355"/>
          <stop offset="1" stop-color="#450a0a"/>
        </linearGradient>
      </defs>
      <!-- Perimeter Contact Horns / Spikes -->
      <rect x="47" y="6" width="6" height="14" rx="2" fill="url(#spikeMetal)"/>
      <rect x="47" y="80" width="6" height="14" rx="2" fill="url(#spikeMetal)"/>
      <rect x="6" y="47" width="14" height="6" rx="2" fill="url(#spikeMetal)"/>
      <rect x="80" y="47" width="14" height="6" rx="2" fill="url(#spikeMetal)"/>
      <rect x="18" y="18" width="10" height="6" rx="2" transform="rotate(45 23 21)" fill="url(#spikeMetal)"/>
      <rect x="72" y="18" width="10" height="6" rx="2" transform="rotate(-45 77 21)" fill="url(#spikeMetal)"/>
      <rect x="18" y="76" width="10" height="6" rx="2" transform="rotate(-45 23 79)" fill="url(#spikeMetal)"/>
      <rect x="72" y="76" width="10" height="6" rx="2" transform="rotate(45 77 79)" fill="url(#spikeMetal)"/>
      <!-- Heavy Cast Iron Sphere -->
      <circle cx="50" cy="50" r="32" fill="url(#mineShell)" stroke="#2f3b45" stroke-width="2"/>
      <!-- Rivet Rings -->
      <circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" stroke-dasharray="3 4"/>
      <!-- Pulsing Red LED Detonator Center -->
      <circle cx="50" cy="50" r="13" fill="url(#sensorGlow)" stroke="#ff1f44" stroke-width="1.5"/>
      <!-- Skull / Hazard Crosshair -->
      <path d="M50 43v14M43 50h14" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;

  // =========================================================================
  // 4. PARTICLE CANVAS ENGINE
  // =========================================================================

  const canvas = document.getElementById('particleCanvas');
  const pCtx = canvas.getContext('2d');
  let particles = [];
  let animId = null;

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener('resize', resizeCanvas);

  function spawnMineBlast(x, y) {
    resizeCanvas();
    const colors = ['#ff1f44', '#ff5964', '#f59e0b', '#ffffff', '#450a0a'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.02 + Math.random() * 0.025,
        gravity: 0.12,
      });
    }
    startParticles();
  }

  function spawnGemSparks(x, y) {
    resizeCanvas();
    const colors = ['#00f0ff', '#38bdf8', '#00e701', '#ffffff'];
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        radius: 2 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.03 + Math.random() * 0.03,
        gravity: 0.04,
      });
    }
    startParticles();
  }

  function spawnCoinShower() {
    resizeCanvas();
    const colors = ['#00e701', '#00f0ff', '#f59e0b', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 85; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height * 0.8,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 8,
        radius: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.012 + Math.random() * 0.014,
        gravity: 0.2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        isConfetti: true,
      });
    }
    startParticles();
  }

  function startParticles() {
    if (animId) return;
    function loop() {
      pCtx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.alpha -= p.decay;

        if (p.alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }

        pCtx.save();
        pCtx.globalAlpha = p.alpha;
        pCtx.fillStyle = p.color;

        if (p.isConfetti) {
          p.rotation += p.rotSpeed;
          pCtx.translate(p.x, p.y);
          pCtx.rotate((p.rotation * Math.PI) / 180);
          pCtx.fillRect(-p.radius, -p.radius / 2, p.radius * 2, p.radius);
        } else {
          pCtx.beginPath();
          pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          pCtx.fill();
        }
        pCtx.restore();
      }

      if (particles.length > 0) {
        animId = requestAnimationFrame(loop);
      } else {
        animId = null;
      }
    }
    animId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // 5. DOM ELEMENTS
  // =========================================================================

  const el = {
    balanceNumber: document.getElementById('balanceNumber'),
    auxBalance: document.getElementById('auxBalance'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    historyStream: document.getElementById('historyStream'),
    soundBtn: document.getElementById('soundBtn'),
    soundSvgOn: document.getElementById('soundSvgOn'),
    soundSvgOff: document.getElementById('soundSvgOff'),
    wagerInput: document.getElementById('wagerInput'),
    btnHalf: document.getElementById('btnHalf'),
    btnDouble: document.getElementById('btnDouble'),
    btnMax: document.getElementById('btnMax'),
    quickChips: document.querySelectorAll('.chip-btn'),
    minesCountSelect: document.getElementById('minesCountSelect'),
    auxMineCount: document.getElementById('auxMineCount'),
    minePills: document.querySelectorAll('.mine-pill'),
    teleMines: document.getElementById('teleMines'),
    teleGemsLeft: document.getElementById('teleGemsLeft'),
    teleWinRate: document.getElementById('teleWinRate'),
    teleNextMult: document.getElementById('teleNextMult'),
    mainActionButton: document.getElementById('mainActionButton'),
    actionBtnTitle: document.getElementById('actionBtnTitle'),
    actionBtnSub: document.getElementById('actionBtnSub'),
    minesGrid: document.getElementById('minesGrid'),
    hudStateBadge: document.getElementById('hudStateBadge'),
    hudMessage: document.getElementById('hudMessage'),
    hudProfitBox: document.getElementById('hudProfitBox'),
    hudMultVal: document.getElementById('hudMultVal'),
    hudProfitVal: document.getElementById('hudProfitVal'),
    victoryModal: document.getElementById('victoryModal'),
    modalBadge: document.getElementById('modalBadge'),
    modalMult: document.getElementById('modalMult'),
    modalWinAmount: document.getElementById('modalWinAmount'),
    modalSubtext: document.getElementById('modalSubtext'),
    btnModalPlayAgain: document.getElementById('btnModalPlayAgain'),
    btnModalClose: document.getElementById('btnModalClose'),
    fairnessModal: document.getElementById('fairnessModal'),
    btnOpenFairness: document.getElementById('btnOpenFairness'),
    btnOpenFairness2: document.getElementById('btnOpenFairness2'),
    btnCloseFairness: document.getElementById('btnCloseFairness'),
    btnDoneFairness: document.getElementById('btnDoneFairness'),
  };

  // =========================================================================
  // 6. MATHEMATICAL TELEMETRY & ODDS
  // =========================================================================

  function calculateMinesMultiplier(mines, revealed) {
    if (revealed === 0) return 1.0;
    const total = 25;
    const safeTotal = total - mines;
    if (revealed > safeTotal) return 0;

    let prob = 1.0;
    for (let i = 0; i < revealed; i++) {
      prob *= (safeTotal - i) / (total - i);
    }
    const raw = 0.97 / prob;
    return Math.max(1.01, Math.round(raw * 100) / 100);
  }

  function updateTelemetry() {
    const total = 25;
    const safeTotal = total - state.bombs;
    const currentFound = state.revealedIndices.size;
    const gemsLeft = safeTotal - currentFound;
    const unrevealedTotal = total - currentFound;

    el.teleMines.textContent = state.bombs;
    el.teleGemsLeft.textContent = gemsLeft;

    const winRate = unrevealedTotal > 0 ? (gemsLeft / unrevealedTotal) * 100 : 0;
    el.teleWinRate.textContent = `${winRate.toFixed(1)}%`;

    const nextMult = calculateMinesMultiplier(state.bombs, currentFound + 1);
    el.teleNextMult.textContent = gemsLeft > 0 ? `${nextMult.toFixed(2)}×` : 'MAX';

    if (!state.activeGame) {
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;
    }
  }

  function updateBalanceDisplay(newBalance, animate = false) {
    state.balance = newBalance;
    const formatted = Number(newBalance).toLocaleString();
    if (el.balanceNumber) el.balanceNumber.textContent = formatted;
    if (el.auxBalance) el.auxBalance.textContent = formatted;

    if (animate && el.balanceNumber) {
      el.balanceNumber.classList.remove('pulse');
      void el.balanceNumber.offsetWidth;
      el.balanceNumber.classList.add('pulse');
    }
  }

  function renderHistoryStream(history) {
    if (!el.historyStream) return;
    el.historyStream.innerHTML = '';
    history.forEach((item) => {
      const chip = document.createElement('div');
      const mult = Number(item.multiplier || 0);
      chip.className = 'ribbon-chip';

      if (!item.won || mult === 0) {
        chip.classList.add('chip-loss');
      } else if (mult >= 5.0) {
        chip.classList.add('chip-gold');
      } else if (mult >= 2.0) {
        chip.classList.add('chip-cyan');
      } else {
        chip.classList.add('chip-win');
      }
      chip.textContent = `${mult.toFixed(2)}×`;
      el.historyStream.appendChild(chip);
    });
  }

  // =========================================================================
  // 7. BOARD RENDERING & 3D TILE INTERACTIONS
  // =========================================================================

  function buildGrid() {
    el.minesGrid.innerHTML = '';
    for (let idx = 0; idx < 25; idx++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.idx = idx;

      tile.innerHTML = `
        <div class="tile-inner">
          <div class="tile-front">
            <div class="tile-front-marker"></div>
          </div>
          <div class="tile-back"></div>
        </div>
      `;

      tile.addEventListener('click', () => handleTileClick(idx, tile));
      el.minesGrid.appendChild(tile);
    }
  }

  function getTile(idx) {
    return el.minesGrid.querySelector(`.tile[data-idx="${idx}"]`);
  }

  function revealGem(idx, playSound = true) {
    const tile = getTile(idx);
    if (!tile) return;

    tile.classList.add('revealed', 'is-gem');
    const back = tile.querySelector('.tile-back');
    back.innerHTML = SVG_GEM;

    if (playSound) {
      Sound.gem(state.revealedIndices.size);
      const rect = tile.getBoundingClientRect();
      const parentRect = canvas.getBoundingClientRect();
      spawnGemSparks(rect.left - parentRect.left + rect.width / 2, rect.top - parentRect.top + rect.height / 2);
    }
  }

  function revealBomb(idx, isDetonated = false, isGhost = false) {
    const tile = getTile(idx);
    if (!tile) return;

    tile.classList.add('revealed', 'is-bomb');
    if (isDetonated) tile.classList.add('detonated');
    if (isGhost) tile.classList.add('ghost-mine');

    const back = tile.querySelector('.tile-back');
    back.innerHTML = SVG_MINE;

    if (isDetonated) {
      Sound.bomb();
      const rect = tile.getBoundingClientRect();
      const parentRect = canvas.getBoundingClientRect();
      spawnMineBlast(rect.left - parentRect.left + rect.width / 2, rect.top - parentRect.top + rect.height / 2);
    }
  }

  function revealPeek(idx, isBomb) {
    const tile = getTile(idx);
    if (!tile || tile.classList.contains('revealed')) return;

    tile.classList.add('revealed', 'peek-revealed');
    const back = tile.querySelector('.tile-back');

    if (isBomb) {
      tile.classList.add('is-bomb', 'ghost-mine');
      back.innerHTML = SVG_MINE;
    } else {
      tile.classList.add('is-gem');
      back.innerHTML = SVG_GEM;
    }
    Sound.click();
  }

  // =========================================================================
  // 8. API CLIENT & ENGINE ACTIONS
  // =========================================================================

  async function api(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (playToken) headers['x-play-token'] = playToken;

    const opts = { method, headers };
    if (data) opts.body = JSON.stringify({ ...data, token: playToken });

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  async function loadProfile() {
    try {
      const data = await api('/profile');
      state.authenticated = data.authenticated;
      state.userId = data.userId;
      state.username = data.username || 'Guest';

      if (el.userName) el.userName.textContent = state.username;
      if (el.userAvatar && data.avatarUrl) el.userAvatar.src = data.avatarUrl;
      updateBalanceDisplay(data.balance);

      if (data.history) renderHistoryStream(data.history);

      // Restore active game if exists
      if (data.activeGame) {
        state.activeGame = true;
        state.wager = data.activeGame.wager;
        state.bombs = data.activeGame.bombs;
        state.currentMult = data.activeGame.multiplier;
        state.currentWin = data.activeGame.currentWin;

        el.wagerInput.value = state.wager;
        el.minesCountSelect.value = String(state.bombs);
        syncBombPills(state.bombs);

        buildGrid();
        data.activeGame.revealed.forEach((idx) => {
          state.revealedIndices.add(idx);
          revealGem(idx, false);
        });

        enterActiveGameState();
        setHud('Active', 'Game restored. Pick a tile or cash out your locked profit!', 'active');
      }
    } catch (err) {
      console.warn('[Profile Error]', err.message);
    }
  }

  async function startGame() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 100);
    const bombs = Math.min(24, Math.max(1, Math.floor(Number(el.minesCountSelect.value)) || 3));

    if (state.balance < wager) {
      setHud('Error', `Insufficient balance! You have ${state.balance.toLocaleString()} 🪙.`, 'lost');
      state.isProcessing = false;
      return;
    }

    try {
      const res = await api('/mines/start', 'POST', { wager, bombs });
      state.activeGame = true;
      state.cashedOut = false;
      state.peekMode = false;
      state.wager = res.wager;
      state.bombs = res.bombs;
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      state.revealedIndices.clear();

      updateBalanceDisplay(res.balance);
      buildGrid();
      enterActiveGameState();

      setHud('Active', 'Round in progress. Uncover gems or Cash Out anytime!', 'active');
    } catch (err) {
      setHud('Error', err.message, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  async function handleTileClick(idx, tileEl) {
    if (state.isProcessing) return;

    // Peek Mode
    if (state.peekMode) {
      if (tileEl.classList.contains('revealed')) return;
      state.isProcessing = true;
      try {
        const res = await api('/mines/peek', 'POST', { tileIdx: idx });
        revealPeek(idx, res.isBomb);
      } catch (err) {
        console.error(err);
      } finally {
        state.isProcessing = false;
      }
      return;
    }

    if (!state.activeGame) return;
    if (state.revealedIndices.has(idx)) return;

    state.isProcessing = true;

    try {
      const res = await api('/mines/reveal', 'POST', { tileIdx: idx });

      // Hit Mine!
      if (res.hitBomb) {
        state.activeGame = false;
        revealBomb(idx, true, false);
        updateBalanceDisplay(res.balance);

        // Ghost reveal other hidden mines
        if (Array.isArray(res.allBombs)) {
          res.allBombs.forEach((bIdx, i) => {
            if (bIdx !== idx) {
              setTimeout(() => revealBomb(bIdx, false, true), (i + 1) * 45);
            }
          });
        }

        setHud('Detonated', `Explosion! Lost ${state.wager.toLocaleString()} 🪙. Click Bet to play again.`, 'lost');
        resetToIdleState();
        refreshProfileHistory();
        return;
      }

      // Safe Gem Found!
      state.revealedIndices.add(idx);
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      revealGem(idx, true);
      updateTelemetry();

      // Update CTA with live Cashout amount
      el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;
      el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
      el.hudProfitVal.textContent = `+${Number(res.profit).toLocaleString()} 🪙`;

      // Perfect Clear!
      if (res.won) {
        state.activeGame = false;
        updateBalanceDisplay(res.balance, true);
        Sound.cashout();
        spawnCoinShower();
        showVictory('PERFECT CLEAR!', res.multiplier, res.profit);
        setHud('Perfect', `Cleared all safe gems! Won ${res.winAmount.toLocaleString()} 🪙!`, 'won');
        resetToIdleState();
        refreshProfileHistory();
        return;
      }

      setHud('Safe', `Gem uncovered! Next mult: ${res.nextMultiplier.toFixed(2)}×`, 'active');
    } catch (err) {
      setHud('Error', err.message, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  async function cashOut() {
    if (!state.activeGame || state.isProcessing || state.revealedIndices.size === 0) return;
    state.isProcessing = true;
    Sound.click();

    try {
      const res = await api('/mines/cashout', 'POST');
      state.activeGame = false;
      state.cashedOut = true;
      state.peekMode = true;

      updateBalanceDisplay(res.balance, true);
      Sound.cashout();
      spawnCoinShower();

      showVictory('CASHED OUT', res.multiplier, res.profit);
      setHud('Cashed Out', `Locked in +${res.winAmount.toLocaleString()} 🪙! (Peek remaining tiles)`, 'won');

      // Update CTA to Play Again
      el.mainActionButton.className = 'btn-stake-cta btn-replay';
      el.actionBtnTitle.textContent = 'Play Again';
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;

      refreshProfileHistory();
    } catch (err) {
      setHud('Error', err.message, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  function enterActiveGameState() {
    el.wagerInput.disabled = true;
    el.minesCountSelect.disabled = true;

    el.mainActionButton.className = 'btn-stake-cta btn-cashout';
    el.actionBtnTitle.textContent = 'Cashout';
    el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;

    el.hudProfitBox.style.display = 'flex';
    el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
    el.hudProfitVal.textContent = `+${Math.max(0, state.currentWin - state.wager).toLocaleString()} 🪙`;
    updateTelemetry();
  }

  function resetToIdleState() {
    el.wagerInput.disabled = false;
    el.minesCountSelect.disabled = false;

    el.mainActionButton.className = 'btn-stake-cta btn-bet';
    el.actionBtnTitle.textContent = 'Bet';
    el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;

    el.hudProfitBox.style.display = 'none';
    updateTelemetry();
  }

  function setHud(badge, msg, type = 'ready') {
    el.hudStateBadge.textContent = badge;
    el.hudStateBadge.className = `hud-badge ${type}`;
    el.hudMessage.innerHTML = msg;
  }

  function showVictory(badge, mult, profit) {
    el.modalBadge.textContent = badge;
    el.modalMult.textContent = `${Number(mult).toFixed(2)}×`;
    el.modalWinAmount.textContent = `+${Number(profit).toLocaleString()} 🪙`;
    el.modalSubtext.textContent = 'Winnings credited to your Discord wallet.';
    el.victoryModal.classList.add('active');
  }

  function hideVictory() {
    el.victoryModal.classList.remove('active');
  }

  async function refreshProfileHistory() {
    try {
      const data = await api('/profile');
      if (data.history) renderHistoryStream(data.history);
    } catch {}
  }

  function syncBombPills(val) {
    el.auxMineCount.textContent = `${val} ${val === 1 ? 'Mine' : 'Mines'}`;
    el.minePills.forEach((p) => {
      p.classList.toggle('active', Number(p.dataset.bombs) === val);
    });
  }

  // =========================================================================
  // 9. EVENT LISTENERS
  // =========================================================================

  // CTA Click
  el.mainActionButton.addEventListener('click', () => {
    if (state.activeGame) {
      cashOut();
    } else {
      hideVictory();
      startGame();
    }
  });

  el.btnModalPlayAgain.addEventListener('click', () => {
    hideVictory();
    startGame();
  });

  el.btnModalClose.addEventListener('click', () => {
    hideVictory();
  });

  // Sound Toggle
  el.soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('moonflip_sound_muted', (!state.soundEnabled).toString());
    el.soundSvgOn.style.display = state.soundEnabled ? 'block' : 'none';
    el.soundSvgOff.style.display = state.soundEnabled ? 'none' : 'block';
    if (state.soundEnabled) Sound.click();
  });

  // Provably Fair Modal
  const openFairness = () => {
    Sound.click();
    el.fairnessModal.classList.add('active');
  };
  const closeFairness = () => {
    el.fairnessModal.classList.remove('active');
  };
  el.btnOpenFairness.addEventListener('click', openFairness);
  el.btnOpenFairness2.addEventListener('click', openFairness);
  el.btnCloseFairness.addEventListener('click', closeFairness);
  el.btnDoneFairness.addEventListener('click', closeFairness);

  // Wager Quick Chips
  el.quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Sound.click();
      el.wagerInput.value = chip.dataset.val;
      state.wager = Number(chip.dataset.val);
      updateTelemetry();
    });
  });

  // Math Buttons (1/2, 2x, MAX)
  el.btnHalf.addEventListener('click', () => {
    Sound.click();
    const curr = Number(el.wagerInput.value) || 100;
    el.wagerInput.value = Math.max(10, Math.floor(curr / 2));
    state.wager = Number(el.wagerInput.value);
    updateTelemetry();
  });

  el.btnDouble.addEventListener('click', () => {
    Sound.click();
    const curr = Number(el.wagerInput.value) || 100;
    el.wagerInput.value = Math.min(state.balance, curr * 2);
    state.wager = Number(el.wagerInput.value);
    updateTelemetry();
  });

  el.btnMax.addEventListener('click', () => {
    Sound.click();
    el.wagerInput.value = Math.max(10, state.balance);
    state.wager = Number(el.wagerInput.value);
    updateTelemetry();
  });

  el.wagerInput.addEventListener('input', () => {
    state.wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 10);
    updateTelemetry();
  });

  // Mines Select & Segmented Pills
  el.minesCountSelect.addEventListener('change', () => {
    const val = Number(el.minesCountSelect.value);
    state.bombs = val;
    syncBombPills(val);
    updateTelemetry();
  });

  el.minePills.forEach((p) => {
    p.addEventListener('click', () => {
      Sound.click();
      const val = Number(p.dataset.bombs);
      el.minesCountSelect.value = String(val);
      state.bombs = val;
      syncBombPills(val);
      updateTelemetry();
    });
  });

  // =========================================================================
  // 10. INITIALIZATION
  // =========================================================================

  buildGrid();
  updateTelemetry();
  resizeCanvas();
  loadProfile();

  if (!state.soundEnabled) {
    el.soundSvgOn.style.display = 'none';
    el.soundSvgOff.style.display = 'block';
  }
})();
