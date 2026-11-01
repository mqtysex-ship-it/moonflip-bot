/**
 * MOONFLIP CASINO — 5x5 MINES ARENA
 * High-performance Web Client & Audio Engine
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
    username: 'Guest Player',
    balance: 1000,
    wager: 100,
    bombs: 3,
    activeGame: false,
    cashedOut: false,
    peekMode: false,
    currentMult: 1.0,
    currentWin: 0,
    revealedIndices: new Set(),
    knownBombs: new Set(),
    isProcessing: false,
    soundEnabled: localStorage.getItem('moonflip_sound_muted') !== 'true',
  };

  // =========================================================================
  // 2. WEB AUDIO SYNTHESIZER (No external assets required)
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
    // Gentle blip on tile hover / button click
    click() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    },

    // Crystalline ascending chime on gem uncover
    gem(count = 1) {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const pentatonic = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
      const rootFreq = pentatonic[Math.min(count - 1, pentatonic.length - 1)];

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(rootFreq, ctx.currentTime);

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(rootFreq * 2, ctx.currentTime);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.45);
      osc2.stop(ctx.currentTime + 0.45);
    },

    // Low-pass distorted explosion boom
    bomb() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      // Sub drop
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.5);

      oscGain.gain.setValueAtTime(0.3, ctx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);

      // Noise burst
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.4);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.35, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start();
    },

    // Victorious Cashout Fanfare & Coins
    cashout() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
      });
    },
  };

  // =========================================================================
  // 3. VECTOR ASSETS (HD Gems & Mines)
  // =========================================================================

  const SVG_GEM = `
    <svg class="gem-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gemGradTop" x1="50" y1="12" x2="50" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#38bdf8"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
        <linearGradient id="gemGradCenter" x1="50" y1="40" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#00f0ff"/>
          <stop offset="100%" stop-color="#0369a1"/>
        </linearGradient>
        <linearGradient id="gemFacetL" x1="20" y1="40" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#0ea5e9"/>
          <stop offset="100%" stop-color="#075985"/>
        </linearGradient>
        <linearGradient id="gemFacetR" x1="80" y1="40" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#7dd3fc"/>
          <stop offset="100%" stop-color="#0284c7"/>
        </linearGradient>
      </defs>
      <!-- Center Bottom Point -->
      <polygon points="50,88 32,42 68,42" fill="url(#gemGradCenter)" />
      <!-- Left Wing -->
      <polygon points="14,42 32,42 50,88" fill="url(#gemFacetL)" />
      <!-- Right Wing -->
      <polygon points="86,42 68,42 50,88" fill="url(#gemFacetR)" />
      <!-- Top Crown Center -->
      <polygon points="35,16 65,16 68,42 32,42" fill="url(#gemGradTop)" />
      <!-- Top Crown Left -->
      <polygon points="20,24 35,16 32,42 14,42" fill="#38bdf8" />
      <!-- Top Crown Right -->
      <polygon points="80,24 65,16 68,42 86,42" fill="#bae6fd" />
      <!-- Specular Highlight Glint -->
      <polygon points="38,20 48,18 42,32 35,28" fill="#ffffff" opacity="0.75" />
    </svg>
  `;

  const SVG_BOMB = `
    <svg class="bomb-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="bombBody" cx="45%" cy="40%" r="55%">
          <stop offset="0%" stop-color="#2d3748"/>
          <stop offset="60%" stop-color="#171923"/>
          <stop offset="100%" stop-color="#08080a"/>
        </radialGradient>
        <linearGradient id="spikeGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ef4444"/>
          <stop offset="100%" stop-color="#7f1d1d"/>
        </linearGradient>
      </defs>
      <!-- Spikes -->
      <rect x="47" y="6" width="6" height="12" rx="2" fill="url(#spikeGrad)" />
      <rect x="47" y="82" width="6" height="12" rx="2" fill="url(#spikeGrad)" />
      <rect x="6" y="47" width="12" height="6" rx="2" fill="url(#spikeGrad)" />
      <rect x="82" y="47" width="12" height="6" rx="2" fill="url(#spikeGrad)" />
      <rect x="18" y="18" width="10" height="6" rx="2" transform="rotate(45 23 21)" fill="url(#spikeGrad)" />
      <rect x="72" y="18" width="10" height="6" rx="2" transform="rotate(-45 77 21)" fill="url(#spikeGrad)" />
      <rect x="18" y="76" width="10" height="6" rx="2" transform="rotate(-45 23 79)" fill="url(#spikeGrad)" />
      <rect x="72" y="76" width="10" height="6" rx="2" transform="rotate(45 77 79)" fill="url(#spikeGrad)" />
      <!-- Main Naval Mine Sphere -->
      <circle cx="50" cy="50" r="32" fill="url(#bombBody)" stroke="#ef4444" stroke-width="1.5" />
      <!-- Center Danger Ring -->
      <circle cx="50" cy="50" r="14" fill="#7f1d1d" stroke="#ef4444" stroke-width="1.5" opacity="0.8" />
      <!-- Skull / Exclamation Mark -->
      <path d="M50 42v10M50 56v2" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
    </svg>
  `;

  // =========================================================================
  // 4. PARTICLE CANVAS ENGINE (Explosions, Confetti & Coins)
  // =========================================================================

  const canvas = document.getElementById('particleCanvas');
  const pCtx = canvas.getContext('2d');
  let particles = [];
  let animFrameId = null;

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  window.addEventListener('resize', resizeCanvas);

  function spawnExplosion(x, y) {
    resizeCanvas();
    const colors = ['#ef4444', '#f97316', '#fbbf24', '#ffffff', '#7f1d1d'];
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.02 + Math.random() * 0.03,
        gravity: 0.15,
      });
    }
    startParticleLoop();
  }

  function spawnGemSparks(x, y) {
    resizeCanvas();
    const colors = ['#00f0ff', '#38bdf8', '#00e701', '#ffffff'];
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        radius: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.03 + Math.random() * 0.04,
        gravity: 0.05,
      });
    }
    startParticleLoop();
  }

  function spawnCashoutCelebration() {
    resizeCanvas();
    const colors = ['#00e701', '#00f0ff', '#fbbf24', '#f59e0b', '#ffffff', '#a855f7'];
    for (let i = 0; i < 90; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height * 0.7,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 8,
        radius: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.012 + Math.random() * 0.015,
        gravity: 0.22,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        isConfetti: true,
      });
    }
    startParticleLoop();
  }

  function startParticleLoop() {
    if (animFrameId) return;
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
        animFrameId = requestAnimationFrame(loop);
      } else {
        animFrameId = null;
      }
    }
    animFrameId = requestAnimationFrame(loop);
  }

  // =========================================================================
  // 5. DOM ELEMENTS
  // =========================================================================

  const el = {
    balanceNumber: document.getElementById('balanceNumber'),
    walletPill: document.getElementById('walletPill'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    historyStream: document.getElementById('historyStream'),
    soundBtn: document.getElementById('soundBtn'),
    soundIcon: document.getElementById('soundIcon'),
    wagerInput: document.getElementById('wagerInput'),
    bombsRange: document.getElementById('bombsRange'),
    bombsDisplay: document.getElementById('bombsDisplay'),
    bombPresetBtns: document.querySelectorAll('.bomb-preset-btn'),
    presetChips: document.querySelectorAll('.preset-btn'),
    btnHalf: document.getElementById('btnHalf'),
    btnDouble: document.getElementById('btnDouble'),
    btnMax: document.getElementById('btnMax'),
    statGemsFound: document.getElementById('statGemsFound'),
    statCurrentMult: document.getElementById('statCurrentMult'),
    statNextMult: document.getElementById('statNextMult'),
    mainActionButton: document.getElementById('mainActionButton'),
    actionBtnTitle: document.getElementById('actionBtnTitle'),
    actionBtnSub: document.getElementById('actionBtnSub'),
    minesGrid: document.getElementById('minesGrid'),
    boardBanner: document.getElementById('boardBanner'),
    bannerText: document.getElementById('bannerText'),
    celebrationOverlay: document.getElementById('celebrationOverlay'),
    celebrationTitle: document.getElementById('celebrationTitle'),
    celebrationMult: document.getElementById('celebrationMult'),
    celebrationProfit: document.getElementById('celebrationProfit'),
    btnPlayAgain: document.getElementById('btnPlayAgain'),
    mobileWinVal: document.getElementById('mobileWinVal'),
    mobileMultVal: document.getElementById('mobileMultVal'),
  };

  // =========================================================================
  // 6. UI UPDATE & PROBABILITY HELPERS
  // =========================================================================

  function calculateTheoreticalMult(mines, revealed) {
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

  function updateBalanceDisplay(newBalance, animate = false) {
    state.balance = newBalance;
    if (el.balanceNumber) {
      el.balanceNumber.textContent = Number(newBalance).toLocaleString();
    }
    if (animate && el.walletPill) {
      el.walletPill.classList.remove('pulse');
      void el.walletPill.offsetWidth; // trigger reflow
      el.walletPill.classList.add('pulse');
    }
  }

  function updateLiveMultipliers() {
    const safeTotal = 25 - state.bombs;
    const count = state.revealedIndices.size;
    el.statGemsFound.textContent = `${count} / ${safeTotal}`;

    if (!state.activeGame) {
      el.statCurrentMult.textContent = '1.00×';
      const firstMult = calculateTheoreticalMult(state.bombs, 1);
      el.statNextMult.textContent = `${firstMult.toFixed(2)}×`;
      el.actionBtnSub.textContent = `BET ${Number(state.wager).toLocaleString()} 🪙`;
    } else {
      el.statCurrentMult.textContent = `${state.currentMult.toFixed(2)}×`;
      const nextMult = calculateTheoreticalMult(state.bombs, count + 1);
      el.statNextMult.textContent = count < safeTotal ? `${nextMult.toFixed(2)}×` : 'MAX';

      // Update CTA button to CASHOUT state
      el.mainActionButton.className = 'btn-main-action btn-cashout';
      el.actionBtnTitle.textContent = 'CASH OUT';
      el.actionBtnSub.textContent = `+${Number(state.currentWin).toLocaleString()} 🪙 (${state.currentMult.toFixed(2)}×)`;

      el.mobileWinVal.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;
      el.mobileMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
    }
  }

  function renderHistoryStream(history) {
    if (!el.historyStream) return;
    el.historyStream.innerHTML = '';
    history.forEach((item) => {
      const chip = document.createElement('div');
      const mult = Number(item.multiplier || 0);
      chip.className = 'history-chip';
      if (item.won && mult >= 3.0) {
        chip.classList.add('big-win');
      } else if (item.won && mult > 1.0) {
        chip.classList.add('win');
      } else {
        chip.classList.add('loss');
      }
      chip.textContent = `${mult.toFixed(2)}×`;
      el.historyStream.appendChild(chip);
    });
  }

  // =========================================================================
  // 7. BOARD RENDERING & 3D TILE MANAGEMENT
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
            <div class="tile-front-dot"></div>
          </div>
          <div class="tile-back" id="tile-back-${idx}"></div>
        </div>
      `;

      tile.addEventListener('click', () => handleTileClick(idx, tile));
      el.minesGrid.appendChild(tile);
    }
  }

  function getTileEl(idx) {
    return el.minesGrid.querySelector(`.tile[data-idx="${idx}"]`);
  }

  function revealGemTile(idx, playFx = true) {
    const tile = getTileEl(idx);
    if (!tile) return;

    tile.classList.add('revealed', 'is-gem');
    const back = tile.querySelector('.tile-back');
    back.innerHTML = SVG_GEM;

    if (playFx) {
      Sound.gem(state.revealedIndices.size);
      const rect = tile.getBoundingClientRect();
      const parentRect = canvas.getBoundingClientRect();
      const x = rect.left - parentRect.left + rect.width / 2;
      const y = rect.top - parentRect.top + rect.height / 2;
      spawnGemSparks(x, y);
    }
  }

  function revealBombTile(idx, isDetonated = false) {
    const tile = getTileEl(idx);
    if (!tile) return;

    tile.classList.add('revealed', 'is-bomb');
    if (isDetonated) tile.classList.add('detonated');

    const back = tile.querySelector('.tile-back');
    back.innerHTML = SVG_BOMB;

    if (isDetonated) {
      Sound.bomb();
      const rect = tile.getBoundingClientRect();
      const parentRect = canvas.getBoundingClientRect();
      const x = rect.left - parentRect.left + rect.width / 2;
      const y = rect.top - parentRect.top + rect.height / 2;
      spawnExplosion(x, y);
    }
  }

  function revealPeekTile(idx, isBomb) {
    const tile = getTileEl(idx);
    if (!tile || tile.classList.contains('revealed')) return;

    tile.classList.add('revealed', 'peek-revealed');
    const back = tile.querySelector('.tile-back');

    if (isBomb) {
      tile.classList.add('is-bomb');
      back.innerHTML = SVG_BOMB;
      Sound.click();
    } else {
      tile.classList.add('is-gem');
      back.innerHTML = SVG_GEM;
      Sound.click();
    }
  }

  // =========================================================================
  // 8. API REQUESTS & GAME ACTIONS
  // =========================================================================

  async function apiCall(endpoint, method = 'GET', data = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (playToken) {
      headers['x-play-token'] = playToken;
    }

    const opts = { method, headers };
    if (data) {
      opts.body = JSON.stringify({ ...data, token: playToken });
    }

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || `HTTP ${res.status}`);
    }
    return json;
  }

  async function initProfile() {
    try {
      const data = await apiCall('/profile');
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
        el.bombsRange.value = state.bombs;
        el.bombsDisplay.textContent = `${state.bombs} Mines`;

        buildGrid();
        data.activeGame.revealed.forEach((idx) => {
          state.revealedIndices.add(idx);
          revealGemTile(idx, false);
        });
        updateLiveMultipliers();

        setBanner('Game restored! Click any unrevealed tile to continue or CASH OUT!', 'active');
      }
    } catch (err) {
      console.warn('[Profile Init]', err.message);
    }
  }

  async function startGame() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 100);
    const bombs = Math.min(24, Math.max(1, Math.floor(Number(el.bombsRange.value)) || 3));

    if (state.balance < wager) {
      setBanner(`⚠️ Insufficient balance! You have ${state.balance.toLocaleString()} tokens.`, 'lost');
      state.isProcessing = false;
      return;
    }

    try {
      const res = await apiCall('/mines/start', 'POST', { wager, bombs });
      state.activeGame = true;
      state.cashedOut = false;
      state.peekMode = false;
      state.wager = res.wager;
      state.bombs = res.bombs;
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      state.revealedIndices.clear();
      state.knownBombs.clear();

      updateBalanceDisplay(res.balance);
      buildGrid();
      updateLiveMultipliers();

      // Disable inputs while in-game
      el.wagerInput.disabled = true;
      el.bombsRange.disabled = true;

      setBanner('Round active! Pick a tile to find gems. Cash out anytime!', 'active');
    } catch (err) {
      setBanner(`⚠️ ${err.message}`, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  async function handleTileClick(idx, tileEl) {
    if (state.isProcessing) return;

    // A. Exploration / Peek Mode post-cashout
    if (state.peekMode) {
      if (tileEl.classList.contains('revealed')) return;
      state.isProcessing = true;
      try {
        const res = await apiCall('/mines/peek', 'POST', { tileIdx: idx });
        revealPeekTile(idx, res.isBomb);
      } catch (err) {
        console.error(err);
      } finally {
        state.isProcessing = false;
      }
      return;
    }

    // B. Active Round Tile Reveal
    if (!state.activeGame) return;
    if (state.revealedIndices.has(idx)) return;

    state.isProcessing = true;

    try {
      const res = await apiCall('/mines/reveal', 'POST', { tileIdx: idx });

      // Hit Bomb! Detonation!
      if (res.hitBomb) {
        state.activeGame = false;
        revealBombTile(idx, true);
        updateBalanceDisplay(res.balance);

        // Wave reveal remaining bombs
        if (Array.isArray(res.allBombs)) {
          res.allBombs.forEach((bIdx, i) => {
            if (bIdx !== idx) {
              setTimeout(() => revealBombTile(bIdx, false), (i + 1) * 60);
            }
          });
        }

        setBanner(`💥 BOMB DETONATED! Lost ${state.wager.toLocaleString()} tokens.`, 'lost');
        resetToIdleState();
        refreshHistory();
        return;
      }

      // Safe Gem Found!
      state.revealedIndices.add(idx);
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      revealGemTile(idx, true);
      updateLiveMultipliers();

      // Perfect Clear Victory!
      if (res.won) {
        state.activeGame = false;
        updateBalanceDisplay(res.balance, true);
        Sound.cashout();
        spawnCashoutCelebration();
        showCelebration('PERFECT CLEAR!', res.multiplier, res.profit);
        setBanner(`🏆 PERFECT CLEAR! Won ${res.winAmount.toLocaleString()} tokens (${res.multiplier.toFixed(2)}x)!`, 'won');
        resetToIdleState();
        refreshHistory();
        return;
      }

      setBanner(`💎 Gem found! Next tile: ${res.nextMultiplier.toFixed(2)}× or CASH OUT now!`, 'active');
    } catch (err) {
      setBanner(`⚠️ ${err.message}`, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  async function cashOut() {
    if (!state.activeGame || state.isProcessing || state.revealedIndices.size === 0) return;
    state.isProcessing = true;
    Sound.click();

    try {
      const res = await apiCall('/mines/cashout', 'POST');
      state.activeGame = false;
      state.cashedOut = true;
      state.peekMode = true;

      updateBalanceDisplay(res.balance, true);
      Sound.cashout();
      spawnCashoutCelebration();

      showCelebration('CASHED OUT!', res.multiplier, res.profit);
      setBanner(`🎉 CASHED OUT +${res.winAmount.toLocaleString()} 🪙 at ${res.multiplier.toFixed(2)}x! (Curiosity Peek Mode active)`, 'won');

      // Enable Exploration peek
      el.mainActionButton.className = 'btn-main-action btn-replay';
      el.actionBtnTitle.textContent = 'PLAY AGAIN';
      el.actionBtnSub.textContent = `BET ${Number(state.wager).toLocaleString()} 🪙`;

      refreshHistory();
    } catch (err) {
      setBanner(`⚠️ ${err.message}`, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  function resetToIdleState() {
    el.wagerInput.disabled = false;
    el.bombsRange.disabled = false;

    el.mainActionButton.className = 'btn-main-action btn-bet';
    el.actionBtnTitle.textContent = 'START GAME';
    el.actionBtnSub.textContent = `BET ${Number(state.wager).toLocaleString()} 🪙`;

    el.statCurrentMult.textContent = '1.00×';
    el.mobileWinVal.textContent = '0 🪙';
    el.mobileMultVal.textContent = '1.00×';
  }

  function setBanner(msg, type = 'normal') {
    el.bannerText.innerHTML = msg;
    el.boardBanner.className = 'board-banner';
    if (type === 'active') el.boardBanner.classList.add('banner-active');
    if (type === 'won') el.boardBanner.classList.add('banner-won');
    if (type === 'lost') el.boardBanner.classList.add('banner-lost');
  }

  function showCelebration(title, multiplier, profit) {
    el.celebrationTitle.textContent = title;
    el.celebrationMult.textContent = `${Number(multiplier).toFixed(2)}×`;
    el.celebrationProfit.textContent = `+${Number(profit).toLocaleString()} 🪙 PROFIT`;
    el.celebrationOverlay.classList.add('active');
  }

  function hideCelebration() {
    el.celebrationOverlay.classList.remove('active');
  }

  async function refreshHistory() {
    try {
      const data = await apiCall('/profile');
      if (data.history) renderHistoryStream(data.history);
    } catch {}
  }

  // =========================================================================
  // 9. EVENT LISTENERS
  // =========================================================================

  // Main Action CTA: toggles Bet or Cashout
  el.mainActionButton.addEventListener('click', () => {
    if (state.activeGame) {
      cashOut();
    } else {
      hideCelebration();
      startGame();
    }
  });

  el.btnPlayAgain.addEventListener('click', () => {
    hideCelebration();
    startGame();
  });

  // Sound FX Toggle
  el.soundBtn.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('moonflip_sound_muted', (!state.soundEnabled).toString());
    el.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    if (state.soundEnabled) Sound.click();
  });

  // Wager Quick Chips (100, 250, 500, 1k, 5k)
  el.presetChips.forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.click();
      el.wagerInput.value = btn.dataset.val;
      state.wager = Number(btn.dataset.val);
      updateLiveMultipliers();
    });
  });

  // Wager Math Modifiers: 1/2, 2x, MAX
  el.btnHalf.addEventListener('click', () => {
    Sound.click();
    const current = Number(el.wagerInput.value) || 100;
    el.wagerInput.value = Math.max(10, Math.floor(current / 2));
    state.wager = Number(el.wagerInput.value);
    updateLiveMultipliers();
  });

  el.btnDouble.addEventListener('click', () => {
    Sound.click();
    const current = Number(el.wagerInput.value) || 100;
    el.wagerInput.value = Math.min(state.balance, current * 2);
    state.wager = Number(el.wagerInput.value);
    updateLiveMultipliers();
  });

  el.btnMax.addEventListener('click', () => {
    Sound.click();
    el.wagerInput.value = Math.max(10, state.balance);
    state.wager = Number(el.wagerInput.value);
    updateLiveMultipliers();
  });

  el.wagerInput.addEventListener('input', () => {
    state.wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 10);
    updateLiveMultipliers();
  });

  // Bomb Slider & Presets
  el.bombsRange.addEventListener('input', () => {
    const val = Number(el.bombsRange.value);
    state.bombs = val;
    el.bombsDisplay.textContent = `${val} ${val === 1 ? 'Mine' : 'Mines'}`;
    el.bombPresetBtns.forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.bombs) === val);
    });
    updateLiveMultipliers();
  });

  el.bombPresetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      Sound.click();
      const val = Number(btn.dataset.bombs);
      el.bombsRange.value = val;
      state.bombs = val;
      el.bombsDisplay.textContent = `${val} ${val === 1 ? 'Mine' : 'Mines'}`;
      el.bombPresetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateLiveMultipliers();
    });
  });

  // =========================================================================
  // 10. INITIALIZATION
  // =========================================================================

  buildGrid();
  updateLiveMultipliers();
  resizeCanvas();
  initProfile();

  if (!state.soundEnabled) {
    el.soundIcon.textContent = '🔇';
  }
})();
