/**
 * MOONFLIP CASINO — 5x5 MINES ARENA & 24/7 CONTINUOUS ORBITAL CRASH (v3.0)
 * High-Precision Luxury Gaming Engine, Zero-Lag 60FPS Canvas & Real-Time SSE Sync
 * 100% English Localization • Stateless Discord Wallet Persistence
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. STATE, AUTH TOKENS & PERSISTENT GUEST ID
  // =========================================================================

  const API_BASE = '/api/play';
  const urlParams = new URLSearchParams(window.location.search);
  const playToken = urlParams.get('token') || localStorage.getItem('moonflip_play_token') || null;

  if (urlParams.get('token')) {
    localStorage.setItem('moonflip_play_token', urlParams.get('token'));
  }

  let guestId = localStorage.getItem('moonflip_guest_id');
  if (!guestId) {
    guestId = 'guest_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('moonflip_guest_id', guestId);
  }

  const state = {
    // Global player state
    currentGame: urlParams.get('game') === 'crash' ? 'crash' : 'mines',
    authenticated: false,
    userId: null,
    username: 'Guest',
    avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
    balance: 1000,
    soundEnabled: localStorage.getItem('moonflip_sound_muted') !== 'true',
    minesHistory: [],
    crashHistory: [],
    serverTimeOffset: 0,

    // Mines Game State
    wager: 100,
    bombs: 3,
    activeGame: false,
    cashedOut: false,
    peekMode: false,
    currentMult: 1.0,
    currentWin: 0,
    revealedIndices: new Set(),
    isProcessing: false,
    gameId: null,
    roundId: 0,
    pendingTimeouts: [],

    // Continuous 24/7 Crash Arena State
    crashMode: 'manual', // 'manual' | 'auto'
    crashAutoBetActive: false,
    crashAutoBetLastRound: 0,
    crashWager: 100,
    crashAutoCashout: 2.0,
    crashPhase: 'BETTING', // 'BETTING' | 'IN_FLIGHT' | 'CRASHED'
    crashRoundNumber: 1,
    crashPhaseStartTime: Date.now(),
    crashBettingDurationMs: 5000,
    crashStartTime: Date.now(),
    crashCurrentMult: 1.0,
    crashPoint: null,
    crashPlayers: [],
    crashMyBet: null,
    crashMyQueuedBet: null,
    crashProcessing: false,
    crashLastCelebratedRound: 0,
    crashLastExplodedRound: 0,
    crashEjectMarkers: [],

    // Leaderboard state
    minesLeaderboard: null,
    crashLeaderboard: null,
    activeModalTab: 'mines-multipliers',
    activeStageTab: 'mines-multipliers',
  };

  function clearAllPendingTimeouts() {
    for (const t of state.pendingTimeouts) {
      clearTimeout(t);
    }
    state.pendingTimeouts = [];
  }

  function safeTimeout(fn, delayMs) {
    const currentRound = state.roundId;
    const t = setTimeout(() => {
      if (state.roundId !== currentRound) return;
      fn();
    }, delayMs);
    state.pendingTimeouts.push(t);
    return t;
  }

  // =========================================================================
  // 2. STUDIO-GRADE WEB AUDIO SYNTHESIZER
  // =========================================================================

  let audioCtx = null;
  let thrusterOsc = null;
  let thrusterFilter = null;
  let thrusterGain = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  const Sound = {
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

    bomb() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

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

      const bufferSize = Math.floor(ctx.sampleRate * 0.45);
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

    cashout() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.065);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.065 + 0.42);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.065);
        osc.stop(ctx.currentTime + i * 0.065 + 0.45);
      });
    },

    startThruster() {
      if (!state.soundEnabled || state.currentGame !== 'crash' || document.hidden) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      this.stopThruster();

      try {
        thrusterOsc = ctx.createOscillator();
        thrusterFilter = ctx.createBiquadFilter();
        thrusterGain = ctx.createGain();

        thrusterOsc.type = 'triangle';
        thrusterOsc.frequency.setValueAtTime(70, ctx.currentTime);

        thrusterFilter.type = 'lowpass';
        thrusterFilter.frequency.setValueAtTime(200, ctx.currentTime);
        thrusterFilter.Q.setValueAtTime(2.2, ctx.currentTime);

        thrusterGain.gain.setValueAtTime(0.005, ctx.currentTime);
        thrusterGain.gain.linearRampToValueAtTime(0.065, ctx.currentTime + 0.35);

        thrusterOsc.connect(thrusterFilter);
        thrusterFilter.connect(thrusterGain);
        thrusterGain.connect(ctx.destination);

        thrusterOsc.start();
      } catch {}
    },

    updateThruster(mult) {
      if (!state.soundEnabled || !thrusterOsc || !audioCtx || state.currentGame !== 'crash') return;
      try {
        const targetFreq = Math.min(520, 70 + Math.log(Math.max(1, mult)) * 105);
        const filterFreq = Math.min(1300, 200 + Math.log(Math.max(1, mult)) * 260);
        thrusterOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
        thrusterFilter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.08);
      } catch {}
    },

    stopThruster() {
      if (thrusterOsc) {
        try {
          thrusterOsc.stop();
        } catch {}
        thrusterOsc = null;
      }
      thrusterFilter = null;
      thrusterGain = null;
    },

    crashExplosion() {
      this.stopThruster();
      if (!state.soundEnabled || state.currentGame !== 'crash' || document.hidden) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(140, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 0.65);

      subGain.gain.setValueAtTime(0.35, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start();
      sub.stop(ctx.currentTime + 0.65);

      const bufferSize = Math.floor(ctx.sampleRate * 0.5);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1100, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(45, ctx.currentTime + 0.5);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
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
      <circle cx="50" cy="50" r="44" fill="url(#gemInnerGlow)"/>
      <polygon points="50,88 32,42 68,42" fill="url(#facetCenter)"/>
      <polygon points="14,42 32,42 50,88" fill="url(#facetLeft)"/>
      <polygon points="86,42 68,42 50,88" fill="url(#facetRight)"/>
      <polygon points="34,16 66,16 68,42 32,42" fill="url(#facetCrown)"/>
      <polygon points="20,24 34,16 32,42 14,42" fill="#48cae4"/>
      <polygon points="80,24 66,16 68,42 86,42" fill="#ade8f4"/>
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
      <rect x="47" y="6" width="6" height="14" rx="2" fill="url(#spikeMetal)"/>
      <rect x="47" y="80" width="6" height="14" rx="2" fill="url(#spikeMetal)"/>
      <rect x="6" y="47" width="14" height="6" rx="2" fill="url(#spikeMetal)"/>
      <rect x="80" y="47" width="14" height="6" rx="2" fill="url(#spikeMetal)"/>
      <rect x="18" y="18" width="10" height="6" rx="2" transform="rotate(45 23 21)" fill="url(#spikeMetal)"/>
      <rect x="72" y="18" width="10" height="6" rx="2" transform="rotate(-45 77 21)" fill="url(#spikeMetal)"/>
      <rect x="18" y="76" width="10" height="6" rx="2" transform="rotate(-45 23 79)" fill="url(#spikeMetal)"/>
      <rect x="72" y="76" width="10" height="6" rx="2" transform="rotate(45 77 79)" fill="url(#spikeMetal)"/>
      <circle cx="50" cy="50" r="32" fill="url(#mineShell)" stroke="#2f3b45" stroke-width="2"/>
      <circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" stroke-dasharray="3 4"/>
      <circle cx="50" cy="50" r="13" fill="url(#sensorGlow)" stroke="#ff1f44" stroke-width="1.5"/>
      <path d="M50 43v14M43 50h14" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;

  // =========================================================================
  // 4. MINES PARTICLE CANVAS ENGINE (ON-DEMAND)
  // =========================================================================

  const minesCanvas = document.getElementById('particleCanvas');
  const pCtx = minesCanvas ? minesCanvas.getContext('2d') : null;
  let particles = [];
  let animId = null;

  function resizeMinesCanvas() {
    if (!minesCanvas) return;
    const rect = minesCanvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      minesCanvas.width = rect.width;
      minesCanvas.height = rect.height;
    }
  }

  function spawnMineBlast(x, y) {
    resizeMinesCanvas();
    if (!minesCanvas) return;
    const colors = ['#ff1f44', '#ff5964', '#f59e0b', '#ffffff', '#450a0a'];
    for (let i = 0; i < 36; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.022 + Math.random() * 0.025,
        gravity: 0.12,
      });
    }
    startParticles();
  }

  function spawnGemSparks(x, y) {
    resizeMinesCanvas();
    if (!minesCanvas) return;
    const colors = ['#00f0ff', '#38bdf8', '#00e701', '#ffffff'];
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        radius: 2 + Math.random() * 2.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.032 + Math.random() * 0.03,
        gravity: 0.04,
      });
    }
    startParticles();
  }

  function spawnCoinShower() {
    resizeMinesCanvas();
    if (!minesCanvas) return;
    const colors = ['#00e701', '#00f0ff', '#f59e0b', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: Math.random() * (minesCanvas.width || 600),
        y: (minesCanvas.height || 500) * 0.8,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 8,
        radius: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.014 + Math.random() * 0.014,
        gravity: 0.2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        isConfetti: true,
      });
    }
    startParticles();
  }

  function startParticles() {
    if (animId || !pCtx) return;
    function loop() {
      pCtx.clearRect(0, 0, minesCanvas.width, minesCanvas.height);
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
  // 5. ZERO-LAG 60FPS CONTINUOUS ORBITAL CRASH CANVAS ENGINE
  // =========================================================================

  const crashCanvas = document.getElementById('crashCanvas');
  const cCtx = crashCanvas ? crashCanvas.getContext('2d', { alpha: false }) : null;

  let crashAnimId = null;
  let cachedCrashWidth = 800;
  let cachedCrashHeight = 520;
  let cachedCrashDpr = 1;
  let cachedBgGradient = null;

  let crashStars = [];
  let crashFlameParticles = [];
  let crashExplosionParticles = [];
  let crashShockwave = null;
  let crashShakeFrames = 0;
  let crashShakeMagnitude = 0;
  let lastRocketTip = { x: 400, y: 250 };

  // Throttled DOM string cache to prevent 60FPS layout thrashing
  const domCache = {
    liveMultText: '',
    liveMultClass: '',
    liveStatusText: '',
    actionSubText: '',
    hudMultText: '',
    hudProfitText: '',
    altitudeZoneText: '',
  };

  function initCrashStars() {
    crashStars = [];
    const count = 65;
    for (let i = 0; i < count; i++) {
      crashStars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.4,
        baseAlpha: 0.2 + Math.random() * 0.55,
        twinkleSpeed: 0.002 + Math.random() * 0.004,
        twinkleOffset: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.65,
      });
    }
  }
  initCrashStars();

  function resizeCrashCanvas() {
    if (!crashCanvas || !cCtx) return;
    const rect = crashCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    cachedCrashDpr = Math.min(window.devicePixelRatio || 1, 2);
    cachedCrashWidth = rect.width;
    cachedCrashHeight = rect.height;
    crashCanvas.width = Math.floor(cachedCrashWidth * cachedCrashDpr);
    crashCanvas.height = Math.floor(cachedCrashHeight * cachedCrashDpr);

    cachedBgGradient = cCtx.createRadialGradient(
      cachedCrashWidth * 0.5,
      cachedCrashHeight * 0.45,
      30,
      cachedCrashWidth * 0.5,
      cachedCrashHeight * 0.5,
      Math.max(cachedCrashWidth, cachedCrashHeight)
    );
    cachedBgGradient.addColorStop(0, '#0d1627');
    cachedBgGradient.addColorStop(0.6, '#080d18');
    cachedBgGradient.addColorStop(1, '#05080f');
  }

  window.addEventListener('resize', () => {
    resizeMinesCanvas();
    resizeCrashCanvas();
  });

  function startCrashCanvasLoop() {
    if (crashAnimId || !cCtx) return;
    resizeCrashCanvas();
    crashAnimId = requestAnimationFrame(renderCrashCanvas);
  }

  function stopCrashCanvasLoop() {
    if (crashAnimId) {
      cancelAnimationFrame(crashAnimId);
      crashAnimId = null;
    }
    Sound.stopThruster();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopCrashCanvasLoop();
    } else if (state.currentGame === 'crash') {
      startCrashCanvasLoop();
      fetchCrashState();
    }
  });

  function triggerCrashSupernova(x, y) {
    crashExplosionParticles = [];
    const colors = ['#ff3344', '#ff8800', '#ffd700', '#ffffff', '#ff1f44'];
    for (let i = 0; i < 65; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8.5;
      crashExplosionParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2.5 + Math.random() * 4.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.016 + Math.random() * 0.02,
      });
    }

    crashShockwave = {
      x, y,
      radius: 10,
      alpha: 1,
    };

    crashShakeFrames = 20;
    crashShakeMagnitude = 12;
    Sound.crashExplosion();
  }

  function updateDomTextIfChanged(element, cacheKey, newText) {
    if (!element || domCache[cacheKey] === newText) return;
    domCache[cacheKey] = newText;
    element.textContent = newText;
  }

  function renderCrashCanvas() {
    if (state.currentGame !== 'crash' || document.hidden) {
      crashAnimId = null;
      return;
    }
    if (!crashCanvas || !cCtx) return;

    const serverNow = Date.now() + state.serverTimeOffset;
    const w = cachedCrashWidth;
    const h = cachedCrashHeight;
    const dpr = cachedCrashDpr;

    // -----------------------------------------------------------------------
    // A. REAL-TIME PHASE & MULTIPLIER INTERPOLATION (60FPS)
    // -----------------------------------------------------------------------
    if (state.crashPhase === 'BETTING') {
      const elapsedBetting = Math.max(0, serverNow - state.crashPhaseStartTime);
      const remainingMs = Math.max(0, state.crashBettingDurationMs - elapsedBetting);
      const pct = Math.max(0, Math.min(100, (remainingMs / state.crashBettingDurationMs) * 100));

      if (el.crashCountdownWrap && el.crashCountdownWrap.style.display !== 'block') {
        el.crashCountdownWrap.style.display = 'block';
      }
      if (el.crashCountdownBar) {
        el.crashCountdownBar.style.width = `${pct.toFixed(1)}%`;
      }

      const secStr = `${(remainingMs / 1000).toFixed(1)}s`;
      updateDomTextIfChanged(el.crashLiveMult, 'liveMultText', secStr);
      if (domCache.liveMultClass !== 'crash-live-mult mult-betting') {
        domCache.liveMultClass = 'crash-live-mult mult-betting';
        if (el.crashLiveMult) el.crashLiveMult.className = domCache.liveMultClass;
      }
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', 'NEXT FLIGHT LAUNCHING IN');
    } else if (state.crashPhase === 'IN_FLIGHT') {
      if (el.crashCountdownWrap && el.crashCountdownWrap.style.display !== 'none') {
        el.crashCountdownWrap.style.display = 'none';
      }

      const elapsed = Math.max(0, serverNow - state.crashStartTime);
      const liveMult = Math.max(1.0, Math.exp(0.00006 * elapsed));
      state.crashCurrentMult = liveMult;

      const multFormatted = `${liveMult.toFixed(2)}×`;
      updateDomTextIfChanged(el.crashLiveMult, 'liveMultText', multFormatted);

      let multClass = 'crash-live-mult';
      if (state.crashMyBet && state.crashMyBet.cashedOut) {
        multClass = 'crash-live-mult mult-cashed';
      } else if (liveMult >= 50.0) {
        multClass = 'crash-live-mult mult-purple';
      } else if (liveMult >= 10.0) {
        multClass = 'crash-live-mult mult-gold';
      }
      if (domCache.liveMultClass !== multClass) {
        domCache.liveMultClass = multClass;
        if (el.crashLiveMult) el.crashLiveMult.className = multClass;
      }

      const statusTxt = state.crashMyBet && state.crashMyBet.cashedOut
        ? `CASHED OUT @ ${Number(state.crashMyBet.cashoutMult).toFixed(2)}× (FLIGHT LIVE)`
        : 'ORBITAL ASCENT IN PROGRESS';
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', statusTxt);

      // Update Live Cashout CTA if user has an active uncashed bet
      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        const livePayout = Math.floor(state.crashMyBet.wager * liveMult);
        const liveProfit = Math.max(0, livePayout - state.crashMyBet.wager);
        updateDomTextIfChanged(el.crashActionSub, 'actionSubText', `+${livePayout.toLocaleString()} 🪙 (${multFormatted})`);
        updateDomTextIfChanged(el.crashHudMultVal, 'hudMultText', multFormatted);
        updateDomTextIfChanged(el.crashHudProfitVal, 'hudProfitText', `+${liveProfit.toLocaleString()} 🪙`);
      }

      // Update Altitude Zone
      let zone = 'LIFTOFF';
      let zoneClass = 'tele-val text-cyan';
      if (liveMult >= 50.0) {
        zone = 'INTERSTELLAR';
        zoneClass = 'tele-val text-purple';
      } else if (liveMult >= 10.0) {
        zone = 'DEEP SPACE';
        zoneClass = 'tele-val text-gold';
      } else if (liveMult >= 5.0) {
        zone = 'LOW ORBIT';
        zoneClass = 'tele-val text-emerald';
      } else if (liveMult >= 2.0) {
        zone = 'STRATOSPHERE';
        zoneClass = 'tele-val text-cyan';
      }
      if (domCache.altitudeZoneText !== zone && el.crashAltitudeZone) {
        domCache.altitudeZoneText = zone;
        el.crashAltitudeZone.textContent = zone;
        el.crashAltitudeZone.className = zoneClass;
      }

      Sound.updateThruster(liveMult);
    } else if (state.crashPhase === 'CRASHED') {
      if (el.crashCountdownWrap && el.crashCountdownWrap.style.display !== 'none') {
        el.crashCountdownWrap.style.display = 'none';
      }
      const finalMult = state.crashPoint || state.crashCurrentMult || 1.0;
      updateDomTextIfChanged(el.crashLiveMult, 'liveMultText', `${finalMult.toFixed(2)}×`);
      if (domCache.liveMultClass !== 'crash-live-mult mult-crashed') {
        domCache.liveMultClass = 'crash-live-mult mult-crashed';
        if (el.crashLiveMult) el.crashLiveMult.className = domCache.liveMultClass;
      }
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', 'SIGNAL LOST • PREPARING NEXT LAUNCH');
    }

    // -----------------------------------------------------------------------
    // B. HIGH-SPEED CANVAS SCENE RENDERING (ZERO SHADOWBLUR)
    // -----------------------------------------------------------------------
    cCtx.save();
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Apply Screen Shake on Detonation
    if (crashShakeFrames > 0) {
      const ox = (Math.random() - 0.5) * crashShakeMagnitude;
      const oy = (Math.random() - 0.5) * crashShakeMagnitude;
      cCtx.translate(ox, oy);
      crashShakeFrames--;
      crashShakeMagnitude *= 0.9;
    }

    // 1. Deep Space Background
    cCtx.fillStyle = cachedBgGradient || '#070a10';
    cCtx.fillRect(0, 0, w, h);

    // 2. Parallax Starfield with Multiplier Warp
    const isFlying = state.crashPhase === 'IN_FLIGHT';
    const warpFactor = isFlying ? Math.min(8, 1 + (state.crashCurrentMult - 1) * 0.35) : 0.35;

    cCtx.fillStyle = '#ffffff';
    for (let i = 0; i < crashStars.length; i++) {
      const s = crashStars[i];
      s.x -= s.speed * 0.0008 * warpFactor;
      if (isFlying) {
        s.y += s.speed * 0.00035 * warpFactor;
      }
      if (s.x < 0) s.x = 1.0;
      if (s.y > 1) s.y = 0;

      const tw = Math.sin(serverNow * s.twinkleSpeed + s.twinkleOffset);
      cCtx.globalAlpha = Math.max(0.12, Math.min(0.95, s.baseAlpha + tw * 0.2));
      const sx = s.x * w;
      const sy = s.y * h;

      if (warpFactor > 3.2) {
        // Draw warp speed star streaks at high multipliers
        cCtx.strokeStyle = '#e2e8f0';
        cCtx.lineWidth = s.r;
        cCtx.beginPath();
        cCtx.moveTo(sx, sy);
        cCtx.lineTo(sx + warpFactor * 2.4, sy - warpFactor * 0.9);
        cCtx.stroke();
      } else {
        cCtx.beginPath();
        cCtx.arc(sx, sy, s.r, 0, Math.PI * 2);
        cCtx.fill();
      }
    }
    cCtx.globalAlpha = 1;

    // Chart Usable Area
    const padL = 58;
    const padR = 54;
    const padT = 48;
    const padB = 50;
    const uw = w - padL - padR;
    const uh = h - padT - padB;
    const ox = padL;
    const oy = h - padB;

    const currentMult = state.crashCurrentMult || 1.0;
    const maxPlotMult = Math.max(2.0, currentMult * 1.24);
    const elapsed = state.crashPhase === 'IN_FLIGHT'
      ? Math.max(0, serverNow - state.crashStartTime)
      : state.crashPhase === 'CRASHED'
        ? Math.max(0, Math.log(Math.max(1, currentMult)) / 0.00006)
        : 0;
    const maxPlotTime = Math.max(5500, elapsed * 1.22);

    // 3. Reference Grid Lines
    const refLevels = [1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 1000.0];
    cCtx.lineWidth = 1;
    cCtx.font = '600 11px "JetBrains Mono", monospace';
    cCtx.textAlign = 'right';

    for (let i = 0; i < refLevels.length; i++) {
      const lvl = refLevels[i];
      if (lvl > maxPlotMult) break;
      const yNorm = (lvl - 1) / (maxPlotMult - 1);
      const yPos = oy - yNorm * uh;
      if (yPos < padT - 5) continue;

      cCtx.strokeStyle = 'rgba(255, 255, 255, 0.055)';
      cCtx.beginPath();
      cCtx.moveTo(ox, yPos);
      cCtx.lineTo(ox + uw, yPos);
      cCtx.stroke();

      cCtx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      cCtx.fillText(`${lvl >= 10 ? lvl.toFixed(0) : lvl.toFixed(1)}×`, ox - 10, yPos + 4);
    }

    // Axes
    cCtx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.moveTo(ox, padT);
    cCtx.lineTo(ox, oy);
    cCtx.lineTo(ox + uw, oy);
    cCtx.stroke();

    // 4. BETTING PHASE: Pre-Ignition Telemetry Radar & Launchpad Spacecraft
    if (state.crashPhase === 'BETTING') {
      const sweepAngle = (serverNow * 0.0022) % (Math.PI * 2);
      const rx = ox + uw * 0.5;
      const ry = oy - uh * 0.46;
      const radius = Math.min(uw, uh) * 0.34;

      cCtx.strokeStyle = 'rgba(0, 240, 255, 0.12)';
      cCtx.lineWidth = 1.2;
      cCtx.beginPath();
      cCtx.arc(rx, ry, radius, 0, Math.PI * 2);
      cCtx.moveTo(rx + radius * 0.6, ry);
      cCtx.arc(rx, ry, radius * 0.6, 0, Math.PI * 2);
      cCtx.stroke();

      cCtx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      cCtx.beginPath();
      cCtx.moveTo(rx, ry);
      cCtx.lineTo(rx + Math.cos(sweepAngle) * radius, ry + Math.sin(sweepAngle) * radius);
      cCtx.stroke();

      // Hovering Spacecraft on Launchpad with Pre-Ignition Thruster Hum
      const hoverY = oy - 22 + Math.sin(serverNow * 0.008) * 3.5;
      lastRocketTip = { x: ox + 36, y: hoverY };
      drawRocket(cCtx, ox + 36, hoverY, -0.18, true, false, 1.0);
    }

    // 5. IN_FLIGHT / CRASHED PHASE: Exponential Curve & Dynamic Spacecraft
    if (state.crashPhase === 'IN_FLIGHT' || state.crashPhase === 'CRASHED') {
      const steps = 48;
      const points = [];

      for (let i = 0; i <= steps; i++) {
        const tau = (i / steps) * elapsed;
        const mTau = Math.exp(0.00006 * tau);
        const px = ox + (tau / maxPlotTime) * uw;
        const py = oy - ((mTau - 1) / (maxPlotMult - 1)) * uh;
        points.push({ x: px, y: py });
      }

      if (points.length >= 2) {
        let strokeColor = '#00f0ff';
        let glowColor = 'rgba(0, 240, 255, 0.24)';
        let fillColorTop = 'rgba(0, 240, 255, 0.18)';

        if (currentMult >= 50.0) {
          strokeColor = '#d946ef';
          glowColor = 'rgba(217, 70, 239, 0.28)';
          fillColorTop = 'rgba(217, 70, 239, 0.20)';
        } else if (currentMult >= 10.0) {
          strokeColor = '#ffd700';
          glowColor = 'rgba(255, 215, 0, 0.28)';
          fillColorTop = 'rgba(255, 215, 0, 0.20)';
        } else if (currentMult >= 5.0) {
          strokeColor = '#00e701';
          glowColor = 'rgba(0, 231, 1, 0.26)';
          fillColorTop = 'rgba(0, 231, 1, 0.18)';
        } else if (currentMult >= 2.0) {
          strokeColor = '#38bdf8';
          glowColor = 'rgba(56, 189, 248, 0.26)';
          fillColorTop = 'rgba(56, 189, 248, 0.18)';
        } else {
          strokeColor = '#ff9900';
          glowColor = 'rgba(255, 153, 0, 0.24)';
          fillColorTop = 'rgba(255, 153, 0, 0.16)';
        }

        if (state.crashPhase === 'CRASHED') {
          strokeColor = '#ff3344';
          glowColor = 'rgba(255, 51, 68, 0.25)';
          fillColorTop = 'rgba(255, 51, 68, 0.15)';
        } else if (state.crashMyBet && state.crashMyBet.cashedOut) {
          strokeColor = '#00e701';
          glowColor = 'rgba(0, 231, 1, 0.28)';
          fillColorTop = 'rgba(0, 231, 1, 0.20)';
        }

        // Fill Area Under Curve
        const areaGrad = cCtx.createLinearGradient(0, padT, 0, oy);
        areaGrad.addColorStop(0, fillColorTop);
        areaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        cCtx.fillStyle = areaGrad;

        cCtx.beginPath();
        cCtx.moveTo(ox, oy);
        for (let i = 0; i < points.length; i++) {
          cCtx.lineTo(points[i].x, points[i].y);
        }
        cCtx.lineTo(points[points.length - 1].x, oy);
        cCtx.closePath();
        cCtx.fill();

        // Dual-Pass Neon Stroke (Zero-Lag Replacement for shadowBlur)
        cCtx.lineCap = 'round';
        cCtx.lineJoin = 'round';

        // Outer Halo Stroke
        cCtx.strokeStyle = glowColor;
        cCtx.lineWidth = 10;
        cCtx.beginPath();
        cCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          cCtx.lineTo(points[i].x, points[i].y);
        }
        cCtx.stroke();

        // Crisp Core Stroke
        cCtx.strokeStyle = strokeColor;
        cCtx.lineWidth = 3.2;
        cCtx.stroke();

        // Draw Eject Markers for Pilots who Cashed Out along the Curve
        for (let i = 0; i < state.crashEjectMarkers.length; i++) {
          const m = state.crashEjectMarkers[i];
          if (m.mult <= currentMult) {
            const mTau = Math.log(Math.max(1, m.mult)) / 0.00006;
            const mx = ox + (mTau / maxPlotTime) * uw;
            const my = oy - ((m.mult - 1) / (maxPlotMult - 1)) * uh;

            cCtx.fillStyle = '#00e701';
            cCtx.beginPath();
            cCtx.arc(mx, my, 4.5, 0, Math.PI * 2);
            cCtx.fill();

            cCtx.fillStyle = 'rgba(0, 231, 1, 0.85)';
            cCtx.font = '700 10px "JetBrains Mono", monospace';
            cCtx.textAlign = 'center';
            cCtx.fillText(`${m.mult.toFixed(2)}×`, mx, my - 9);
          }
        }

        // Rocket Position & Tangent Angle
        const tip = points[points.length - 1];
        const prev = points[Math.max(0, points.length - 3)];
        const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        lastRocketTip = { x: tip.x, y: tip.y };

        // Emit Exhaust Particles During Flight
        if (state.crashPhase === 'IN_FLIGHT' && crashFlameParticles.length < 45 && Math.random() < 0.8) {
          crashFlameParticles.push({
            x: tip.x - Math.cos(angle) * 14,
            y: tip.y - Math.sin(angle) * 14,
            vx: -Math.cos(angle) * (2.2 + Math.random() * 3.8) + (Math.random() - 0.5) * 1.4,
            vy: -Math.sin(angle) * (2.2 + Math.random() * 3.8) + (Math.random() - 0.5) * 1.4,
            r: 2.2 + Math.random() * 2.8,
            color: Math.random() > 0.45 ? '#00f0ff' : '#ffaa00',
            alpha: 0.95,
            decay: 0.045 + Math.random() * 0.03,
          });
        }

        // Draw Orbital Spacecraft unless Detonated
        if (state.crashPhase !== 'CRASHED') {
          const isPlayerCashed = Boolean(state.crashMyBet && state.crashMyBet.cashedOut);
          drawRocket(cCtx, tip.x, tip.y, angle, true, isPlayerCashed, currentMult);
        }
      }
    }

    // 6. Thruster Exhaust Particles
    for (let i = crashFlameParticles.length - 1; i >= 0; i--) {
      const p = crashFlameParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        crashFlameParticles.splice(i, 1);
        continue;
      }
      cCtx.globalAlpha = p.alpha;
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cCtx.fill();
    }
    cCtx.globalAlpha = 1;

    // 7. Supernova Shockwave Ring
    if (crashShockwave && crashShockwave.alpha > 0) {
      cCtx.globalAlpha = crashShockwave.alpha;
      cCtx.strokeStyle = '#ff3344';
      cCtx.lineWidth = 3;
      cCtx.beginPath();
      cCtx.arc(crashShockwave.x, crashShockwave.y, crashShockwave.radius, 0, Math.PI * 2);
      cCtx.stroke();
      cCtx.globalAlpha = 1;

      crashShockwave.radius += 5.5;
      crashShockwave.alpha -= 0.035;
      if (crashShockwave.alpha <= 0) crashShockwave = null;
    }

    // 8. Supernova Explosion Sparks
    for (let i = crashExplosionParticles.length - 1; i >= 0; i--) {
      const p = crashExplosionParticles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        crashExplosionParticles.splice(i, 1);
        continue;
      }
      cCtx.globalAlpha = p.alpha;
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cCtx.fill();
    }
    cCtx.globalAlpha = 1;

    cCtx.restore();

    crashAnimId = requestAnimationFrame(renderCrashCanvas);
  }

  function drawRocket(ctx, x, y, angle, hasThrust = true, isCashed = false, mult = 1.0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Mach Shockwave Cone at Supersonic Multipliers (>= 2.0x)
    if (hasThrust && mult >= 2.0) {
      const machAlpha = Math.min(0.45, (mult - 2.0) * 0.08 + 0.12);
      ctx.strokeStyle = isCashed ? `rgba(0, 231, 1, ${machAlpha})` : `rgba(0, 240, 255, ${machAlpha})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-6, -18);
      ctx.lineTo(22, 0);
      ctx.lineTo(-6, 18);
      ctx.stroke();
    }

    // Dual-Stage Plasma Thruster Plume
    if (hasThrust) {
      const flicker = Math.sin(Date.now() * 0.04) * 5;
      const flameLen = (mult > 1.05 ? 28 : 16) + flicker;

      const flameGrad = ctx.createLinearGradient(-12, 0, -12 - flameLen, 0);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.35, isCashed ? '#00e701' : '#00f0ff');
      flameGrad.addColorStop(0.75, '#ff8800');
      flameGrad.addColorStop(1, 'rgba(255, 30, 0, 0)');

      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-12, -5);
      ctx.lineTo(-12 - flameLen, 0);
      ctx.lineTo(-12, 5);
      ctx.closePath();
      ctx.fill();
    }

    // Swept Delta Wings
    ctx.fillStyle = isCashed ? '#059669' : '#0284c7';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(2, -5);
    ctx.lineTo(-14, -16);
    ctx.lineTo(-9, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(2, 5);
    ctx.lineTo(-14, 16);
    ctx.lineTo(-9, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Main Orbital Fuselage
    ctx.fillStyle = isCashed ? '#00e701' : '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(4, -6.5);
    ctx.lineTo(-12, -4.5);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-12, 4.5);
    ctx.lineTo(4, 6.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Ion Cockpit Canopy
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.ellipse(4, 0, 5.5, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // 6. DOM ELEMENTS MAP
  // =========================================================================

  const el = {
    // Header, Sync Status & Global Nav
    btnSwitchMines: document.getElementById('btnSwitchMines'),
    btnSwitchCrash: document.getElementById('btnSwitchCrash'),
    minesChassis: document.getElementById('minesChassis'),
    crashChassis: document.getElementById('crashChassis'),
    balanceNumber: document.getElementById('balanceNumber'),
    auxBalance: document.getElementById('auxBalance'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    discordSyncPill: document.getElementById('discordSyncPill'),
    syncDot: document.getElementById('syncDot'),
    syncText: document.getElementById('syncText'),
    guestWarningBanner: document.getElementById('guestWarningBanner'),
    historyStream: document.getElementById('historyStream'),
    soundBtn: document.getElementById('soundBtn'),
    soundSvgOn: document.getElementById('soundSvgOn'),
    soundSvgOff: document.getElementById('soundSvgOff'),

    // Mines Controls
    wagerInput: document.getElementById('wagerInput'),
    btnHalf: document.getElementById('btnHalf'),
    btnDouble: document.getElementById('btnDouble'),
    btnMax: document.getElementById('btnMax'),
    quickChips: document.querySelectorAll('.chip-btn:not(.crash-chip-btn)'),
    minesCountSelect: document.getElementById('minesCountSelect'),
    auxMineCount: document.getElementById('auxMineCount'),
    minePills: document.querySelectorAll('.mine-pill:not(.crash-auto-pill)'),
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

    // Continuous Crash Controls & Telemetry
    btnCrashManualMode: document.getElementById('btnCrashManualMode'),
    btnCrashAutoMode: document.getElementById('btnCrashAutoMode'),
    crashWagerInput: document.getElementById('crashWagerInput'),
    crashAuxBalance: document.getElementById('crashAuxBalance'),
    btnCrashHalf: document.getElementById('btnCrashHalf'),
    btnCrashDouble: document.getElementById('btnCrashDouble'),
    btnCrashMax: document.getElementById('btnCrashMax'),
    crashChips: document.querySelectorAll('.crash-chip-btn'),
    crashAutoCashoutInput: document.getElementById('crashAutoCashoutInput'),
    btnCrashClearAuto: document.getElementById('btnCrashClearAuto'),
    crashAutoPills: document.querySelectorAll('.crash-auto-pill'),
    crashAltitudeZone: document.getElementById('crashAltitudeZone'),
    crashRoundNumber: document.getElementById('crashRoundNumber'),
    crashWinRate: document.getElementById('crashWinRate'),
    crashEstPayout: document.getElementById('crashEstPayout'),
    crashActionButton: document.getElementById('crashActionButton'),
    crashActionTitle: document.getElementById('crashActionTitle'),
    crashActionSub: document.getElementById('crashActionSub'),
    crashPlayersCount: document.getElementById('crashPlayersCount'),
    crashPlayersList: document.getElementById('crashPlayersList'),
    btnOpenCrashFairness: document.getElementById('btnOpenCrashFairness'),
    crashHudBadge: document.getElementById('crashHudBadge'),
    crashHudMessage: document.getElementById('crashHudMessage'),
    crashHudProfitBox: document.getElementById('crashHudProfitBox'),
    crashHudMultVal: document.getElementById('crashHudMultVal'),
    crashHudProfitVal: document.getElementById('crashHudProfitVal'),
    crashCanvas: document.getElementById('crashCanvas'),
    crashLiveMult: document.getElementById('crashLiveMult'),
    crashLiveStatus: document.getElementById('crashLiveStatus'),
    crashCountdownWrap: document.getElementById('crashCountdownWrap'),
    crashCountdownBar: document.getElementById('crashCountdownBar'),
    crashWinToast: document.getElementById('crashWinToast'),
    crashToastMult: document.getElementById('crashToastMult'),
    crashToastProfit: document.getElementById('crashToastProfit'),
    crashVictoryModal: document.getElementById('crashVictoryModal'),

    // Global Fairness & Leaderboard Modals
    fairnessModal: document.getElementById('fairnessModal'),
    btnOpenFairness: document.getElementById('btnOpenFairness'),
    btnOpenFairness2: document.getElementById('btnOpenFairness2'),
    btnCloseFairness: document.getElementById('btnCloseFairness'),
    btnDoneFairness: document.getElementById('btnDoneFairness'),
    leaderboardModal: document.getElementById('leaderboardModal'),
    btnOpenLeaderboard: document.getElementById('btnOpenLeaderboard'),
    btnCloseLeaderboard: document.getElementById('btnCloseLeaderboard'),
    btnDoneLeaderboard: document.getElementById('btnDoneLeaderboard'),
    lbModalTabs: document.querySelectorAll('.lb-tab-btn'),
    lbModalContent: document.getElementById('lbModalContent'),
    lbStageTabs: document.querySelectorAll('.lb-stage-tab'),
    lbStageContent: document.getElementById('lbStageContent'),
  };

  // =========================================================================
  // 7. TELEMETRY, WALLET & DISCORD SYNC STATUS UI
  // =========================================================================

  function updateDiscordSyncUI() {
    if (el.discordSyncPill && el.syncText) {
      if (state.authenticated) {
        el.discordSyncPill.className = 'sync-status-pill synced';
        el.discordSyncPill.title = `Connected to Discord user ${state.username} (${state.userId}). All tokens sync with the Discord server.`;
        el.syncText.textContent = '⚡ Discord Synced';
      } else {
        el.discordSyncPill.className = 'sync-status-pill demo';
        el.discordSyncPill.title = 'Unlinked Demo Mode. Type /play in the Discord server to connect your real Discord balance!';
        el.syncText.textContent = '⚠️ Demo Mode';
      }
    }

    if (el.guestWarningBanner) {
      el.guestWarningBanner.style.display = state.authenticated ? 'none' : 'flex';
    }
  }

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

  function updateMinesTelemetry() {
    const total = 25;
    const safeTotal = total - state.bombs;
    const currentFound = state.revealedIndices.size;
    const gemsLeft = safeTotal - currentFound;
    const unrevealedTotal = total - currentFound;

    if (el.teleMines) el.teleMines.textContent = state.bombs;
    if (el.teleGemsLeft) el.teleGemsLeft.textContent = gemsLeft;

    const winRate = unrevealedTotal > 0 ? (gemsLeft / unrevealedTotal) * 100 : 0;
    if (el.teleWinRate) el.teleWinRate.textContent = `${winRate.toFixed(1)}%`;

    const nextMult = calculateMinesMultiplier(state.bombs, currentFound + 1);
    if (el.teleNextMult) el.teleNextMult.textContent = gemsLeft > 0 ? `${nextMult.toFixed(2)}×` : 'MAX';

    if (!state.activeGame && el.actionBtnSub) {
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;
    }
  }

  function updateCrashTelemetry() {
    const target = state.crashAutoCashout;
    const wager = state.crashWager;

    if (target && target >= 1.01) {
      const prob = Math.min(98, (0.98 / target) * 100);
      if (el.crashWinRate) el.crashWinRate.textContent = `${prob.toFixed(1)}%`;
      if (el.crashEstPayout) el.crashEstPayout.textContent = `${Math.floor(wager * target).toLocaleString()} 🪙`;
    } else {
      if (el.crashWinRate) el.crashWinRate.textContent = '49.0%';
      if (el.crashEstPayout) el.crashEstPayout.textContent = `${Math.floor(wager * 2).toLocaleString()} 🪙`;
    }

    if (el.crashRoundNumber) {
      el.crashRoundNumber.textContent = `#${state.crashRoundNumber}`;
    }

    updateCrashActionCTA();
  }

  function updateBalanceDisplay(newBalance, animate = false) {
    if (typeof newBalance !== 'number' || isNaN(newBalance)) return;
    state.balance = newBalance;
    const formatted = Number(newBalance).toLocaleString();
    if (el.balanceNumber) el.balanceNumber.textContent = formatted;
    if (el.auxBalance) el.auxBalance.textContent = formatted;
    if (el.crashAuxBalance) el.crashAuxBalance.textContent = formatted;

    if (animate && el.balanceNumber) {
      el.balanceNumber.classList.remove('pulse');
      void el.balanceNumber.offsetWidth;
      el.balanceNumber.classList.add('pulse');
    }
  }

  function renderHistoryRibbon() {
    if (!el.historyStream) return;
    el.historyStream.innerHTML = '';
    const list = state.currentGame === 'crash' ? state.crashHistory : state.minesHistory;

    list.forEach((item) => {
      const chip = document.createElement('div');
      chip.className = 'ribbon-chip';

      let mult = 0;
      let won = false;

      if (typeof item === 'number') {
        mult = item;
        won = mult >= 2.0;
      } else if (item && typeof item === 'object') {
        mult = Number(item.multiplier || 0);
        won = Boolean(item.won);
      }

      if (state.currentGame === 'crash') {
        if (mult < 1.8) chip.classList.add('chip-loss');
        else if (mult >= 10.0) chip.classList.add('chip-purple');
        else if (mult >= 5.0) chip.classList.add('chip-gold');
        else if (mult >= 2.0) chip.classList.add('chip-cyan');
        else chip.classList.add('chip-win');
      } else {
        if (!won || mult <= 1.0) chip.classList.add('chip-loss');
        else if (mult >= 10.0) chip.classList.add('chip-purple');
        else if (mult >= 5.0) chip.classList.add('chip-gold');
        else if (mult >= 2.0) chip.classList.add('chip-cyan');
        else chip.classList.add('chip-win');
      }

      chip.textContent = `${mult.toFixed(2)}×`;
      el.historyStream.appendChild(chip);
    });
  }

  // =========================================================================
  // 8. API CLIENT & REAL-TIME SSE STREAM
  // =========================================================================

  async function api(endpoint, method = 'GET', data = null) {
    const headers = {
      'Content-Type': 'application/json',
      'x-guest-id': guestId,
    };
    if (playToken) headers['x-play-token'] = playToken;

    const opts = { method, headers };
    if (data) opts.body = JSON.stringify({ ...data, token: playToken, guestId });

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
  }

  let sseSource = null;

  function connectRealtimeStream() {
    if (sseSource) {
      try { sseSource.close(); } catch {}
    }

    const qs = new URLSearchParams();
    if (playToken) qs.set('token', playToken);
    if (guestId) qs.set('guestId', guestId);

    sseSource = new EventSource(`${API_BASE}/stream?${qs.toString()}`);

    sseSource.addEventListener('wallet', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.userId && data.userId === state.userId) {
          updateBalanceDisplay(data.balance, true);
        }
      } catch {}
    });

    sseSource.addEventListener('crash_state', (e) => {
      try {
        const data = JSON.parse(e.data);
        applyServerCrashState(data);
      } catch {}
    });

    sseSource.addEventListener('crash_phase', (e) => {
      try {
        const data = JSON.parse(e.data);
        applyServerCrashState(data);
      } catch {}
    });

    sseSource.addEventListener('crash_bet', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.players)) {
          state.crashPlayers = data.players;
          syncMyBetFromPlayers();
          renderCrashPlayersRoster();
          updateCrashActionCTA();
        }
      } catch {}
    });

    sseSource.addEventListener('crash_cashout', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (Array.isArray(data.players)) {
          state.crashPlayers = data.players;
        }
        if (data.player && data.player.cashoutMult) {
          state.crashEjectMarkers.push({
            username: data.player.username,
            mult: Number(data.player.cashoutMult),
          });
        }
        // Check if this cashout belongs to the current user (e.g. server-side auto-cashout)
        if (data.player && data.player.userId === state.userId) {
          state.crashMyBet = data.player;
          if (state.crashLastCelebratedRound !== state.crashRoundNumber) {
            state.crashLastCelebratedRound = state.crashRoundNumber;
            celebrateCrashCashout(data.player.cashoutMult, data.player.profit);
          }
        }
        renderCrashPlayersRoster();
        updateCrashActionCTA();
      } catch {}
    });

    sseSource.onerror = () => {
      // Browser EventSource automatically reconnects; fetch state once as fallback
      setTimeout(() => {
        if (!document.hidden) fetchCrashState();
      }, 2000);
    };
  }

  async function fetchCrashState() {
    try {
      const data = await api('/crash/state');
      applyServerCrashState(data);
    } catch {}
  }

  // =========================================================================
  // 9. CONTINUOUS 24/7 ORBITAL CRASH CLIENT ENGINE
  // =========================================================================

  let winToastTimeout = null;

  function showCrashWinToast(mult, profit) {
    if (!el.crashWinToast) return;
    if (el.crashToastMult) el.crashToastMult.textContent = `${Number(mult).toFixed(2)}×`;
    if (el.crashToastProfit) el.crashToastProfit.textContent = `+${Number(profit).toLocaleString()} 🪙`;
    el.crashWinToast.style.display = 'flex';
    el.crashWinToast.classList.add('active');

    if (winToastTimeout) clearTimeout(winToastTimeout);
    winToastTimeout = setTimeout(() => {
      if (el.crashWinToast) {
        el.crashWinToast.classList.remove('active');
        el.crashWinToast.style.display = 'none';
      }
    }, 3800);
  }

  function celebrateCrashCashout(mult, profit) {
    Sound.cashout();
    spawnCoinShower();
    showCrashWinToast(mult, profit);
    setCrashHud(
      'Cashed Out',
      `Locked in <strong>+${Number(profit).toLocaleString()} 🪙</strong> at <strong>${Number(mult).toFixed(2)}×</strong>!`,
      'won'
    );
    refreshProfile();
    loadLeaderboard();
  }

  function syncMyBetFromPlayers() {
    if (!state.userId) return;
    const found = state.crashPlayers.find((p) => p.userId === state.userId);
    state.crashMyBet = found || null;
  }

  function applyServerCrashState(data) {
    if (!data) return;
    if (data.serverNow) {
      state.serverTimeOffset = data.serverNow - Date.now();
    }

    const prevPhase = state.crashPhase;
    state.crashPhase = data.phase || state.crashPhase;
    state.crashRoundNumber = data.roundNumber || state.crashRoundNumber;
    state.crashPhaseStartTime = data.phaseStartTime || state.crashPhaseStartTime;
    state.crashBettingDurationMs = data.bettingDurationMs || 5000;

    if (data.flightStartTime) {
      state.crashStartTime = data.flightStartTime;
    }
    if (typeof data.currentMult === 'number') {
      state.crashCurrentMult = data.currentMult;
    }
    if (typeof data.crashPoint === 'number') {
      state.crashPoint = data.crashPoint;
    }

    if (Array.isArray(data.players)) {
      state.crashPlayers = data.players;
    }

    if (data.myBet !== undefined) {
      state.crashMyBet = data.myBet;
    } else {
      syncMyBetFromPlayers();
    }

    if (data.myQueuedBet !== undefined) {
      state.crashMyQueuedBet = data.myQueuedBet;
    }

    if (Array.isArray(data.history) && data.history.length > 0) {
      state.crashHistory = data.history;
      if (state.currentGame === 'crash') renderHistoryRibbon();
    }

    // Handle Phase Transitions
    if (state.crashPhase === 'BETTING' && prevPhase !== 'BETTING') {
      state.crashEjectMarkers = [];
      state.crashPoint = null;
      state.crashCurrentMult = 1.0;
      Sound.stopThruster();

      if (state.crashMyBet) {
        setCrashHud('Armed', `Bet of ${state.crashMyBet.wager.toLocaleString()} 🪙 locked in for Round #${state.crashRoundNumber}!`, 'active');
      } else {
        setCrashHud('Betting Open', `Round #${state.crashRoundNumber} launching in 5s. Place your bet now!`, 'ready');
      }

      // Trigger Auto-Bet if enabled and not yet bet this round
      if (state.crashMode === 'auto' && state.crashAutoBetActive && !state.crashMyBet && state.crashAutoBetLastRound !== state.crashRoundNumber) {
        state.crashAutoBetLastRound = state.crashRoundNumber;
        placeOrQueueCrashBet();
      }
    } else if (state.crashPhase === 'IN_FLIGHT' && prevPhase !== 'IN_FLIGHT') {
      // Populate eject markers if joining mid-flight
      state.crashEjectMarkers = state.crashPlayers
        .filter((p) => p.cashedOut && p.cashoutMult)
        .map((p) => ({ username: p.username, mult: Number(p.cashoutMult) }));

      Sound.startThruster();
      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        setCrashHud('In Flight', 'Rocket ascending! Click Cash Out anytime before detonation.', 'active');
      } else {
        setCrashHud('In Flight', 'Flight in progress! You can queue a bet for the next launch.', 'ready');
      }
    } else if (state.crashPhase === 'CRASHED' && prevPhase !== 'CRASHED') {
      const crashMult = state.crashPoint || state.crashCurrentMult || 1.0;
      state.crashCurrentMult = crashMult;
      Sound.stopThruster();

      if (state.crashLastExplodedRound !== state.crashRoundNumber) {
        state.crashLastExplodedRound = state.crashRoundNumber;
        triggerCrashSupernova(lastRocketTip.x, lastRocketTip.y);
      }

      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        setCrashHud('Crashed', `Signal lost at ${crashMult.toFixed(2)}×! Next countdown starts in 3s.`, 'lost');
        refreshProfile();
      } else if (!state.crashMyBet) {
        setCrashHud('Round Over', `Flight crashed at ${crashMult.toFixed(2)}×. Preparing next launchpad...`, 'ready');
      }
    }

    renderCrashPlayersRoster();
    updateCrashTelemetry();
  }

  function renderCrashPlayersRoster() {
    if (!el.crashPlayersList) return;
    const players = state.crashPlayers || [];
    if (el.crashPlayersCount) {
      el.crashPlayersCount.textContent = `${players.length} ${players.length === 1 ? 'Pilot' : 'Pilots'}`;
    }

    if (players.length === 0) {
      el.crashPlayersList.innerHTML = '<div class="crash-players-empty">Waiting for pilots to lock in wagers...</div>';
      return;
    }

    let html = '';
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const isMe = p.userId === state.userId;
      let statusHtml = '';

      if (p.cashedOut) {
        statusHtml = `<span class="cp-status cashed">${Number(p.cashoutMult).toFixed(2)}× (+${Number(p.profit).toLocaleString()} 🪙)</span>`;
      } else if (state.crashPhase === 'CRASHED') {
        statusHtml = `<span class="cp-status lost">💥 Crashed</span>`;
      } else if (state.crashPhase === 'IN_FLIGHT') {
        statusHtml = `<span class="cp-status flying">🚀 In Flight</span>`;
      } else {
        statusHtml = `<span class="cp-status flying">⚡ Ready</span>`;
      }

      html += `
        <div class="crash-player-row${isMe ? ' is-me' : ''}">
          <div class="cp-user">
            <img class="cp-avatar" src="${escapeHtml(p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="">
            <span class="cp-name">${escapeHtml(p.username)}${isMe ? ' (You)' : ''}</span>
          </div>
          <span class="cp-wager">${Number(p.wager).toLocaleString()} 🪙</span>
          ${statusHtml}
        </div>
      `;
    }
    el.crashPlayersList.innerHTML = html;
  }

  function updateCrashActionCTA() {
    if (!el.crashActionButton || !el.crashActionTitle || !el.crashActionSub) return;

    const wager = state.crashWager;
    const myBet = state.crashMyBet;
    const myQueued = state.crashMyQueuedBet;

    // Show/hide live profit box on HUD
    if (el.crashHudProfitBox) {
      el.crashHudProfitBox.style.display = (state.crashPhase === 'IN_FLIGHT' && myBet && !myBet.cashedOut) ? 'flex' : 'none';
    }

    // 1. Active Uncashed Bet during IN_FLIGHT -> CASH OUT button!
    if (state.crashPhase === 'IN_FLIGHT' && myBet && !myBet.cashedOut) {
      el.crashActionButton.disabled = false;
      el.crashActionButton.className = 'btn-stake-cta btn-cashout';
      el.crashActionTitle.textContent = 'Cash Out Now';
      const livePayout = Math.floor(myBet.wager * (state.crashCurrentMult || 1.0));
      el.crashActionSub.textContent = `+${livePayout.toLocaleString()} 🪙`;
      return;
    }

    // 2. Auto-Bet Mode Active Toggle
    if (state.crashMode === 'auto' && state.crashAutoBetActive) {
      el.crashActionButton.disabled = false;
      el.crashActionButton.className = 'btn-stake-cta btn-queued';
      el.crashActionTitle.textContent = 'Stop Auto-Bet';
      el.crashActionSub.textContent = myBet
        ? `Armed (${myBet.wager.toLocaleString()} 🪙)`
        : `Auto-Betting ${Number(wager).toLocaleString()} 🪙 / Round`;
      return;
    }

    // 3. During BETTING Phase
    if (state.crashPhase === 'BETTING') {
      if (myBet) {
        el.crashActionButton.disabled = true;
        el.crashActionButton.className = 'btn-stake-cta btn-armed';
        el.crashActionTitle.textContent = 'Bet Armed • Launching Soon';
        el.crashActionSub.textContent = `${Number(myBet.wager).toLocaleString()} 🪙 Locked`;
      } else {
        el.crashActionButton.disabled = false;
        el.crashActionButton.className = 'btn-stake-cta btn-bet';
        el.crashActionTitle.textContent = state.crashMode === 'auto' ? 'Start Auto-Bet' : 'Place Bet (This Flight)';
        el.crashActionSub.textContent = `${Number(wager).toLocaleString()} 🪙`;
      }
      return;
    }

    // 4. During IN_FLIGHT (not in round or already cashed out) or CRASHED -> Queue for Next Flight!
    if (myQueued) {
      el.crashActionButton.disabled = false;
      el.crashActionButton.className = 'btn-stake-cta btn-queued';
      el.crashActionTitle.textContent = 'Queued for Next Flight (Cancel)';
      el.crashActionSub.textContent = `${Number(myQueued.wager).toLocaleString()} 🪙`;
    } else {
      el.crashActionButton.disabled = false;
      el.crashActionButton.className = 'btn-stake-cta btn-bet';
      el.crashActionTitle.textContent = state.crashMode === 'auto' ? 'Start Auto-Bet' : 'Bet (Next Flight)';
      el.crashActionSub.textContent = `${Number(wager).toLocaleString()} 🪙`;
    }
  }

  async function handleCrashPrimaryButton() {
    if (state.crashProcessing) return;

    // A. If player has an active uncashed bet during IN_FLIGHT -> Cash Out!
    if (state.crashPhase === 'IN_FLIGHT' && state.crashMyBet && !state.crashMyBet.cashedOut) {
      await cashOutContinuousCrash();
      return;
    }

    // B. If Auto-Bet mode is currently running -> Stop Auto-Bet
    if (state.crashMode === 'auto' && state.crashAutoBetActive) {
      Sound.click();
      state.crashAutoBetActive = false;
      if (state.crashMyQueuedBet) {
        await cancelQueuedCrashBet();
      }
      setCrashHud('Auto-Bet Stopped', 'Automated flight betting disabled.', 'ready');
      updateCrashActionCTA();
      return;
    }

    // C. If player has a queued bet for the next round -> Cancel Queue
    if (state.crashMyQueuedBet) {
      await cancelQueuedCrashBet();
      return;
    }

    // D. If starting Auto-Bet mode
    if (state.crashMode === 'auto' && !state.crashAutoBetActive) {
      state.crashAutoBetActive = true;
      state.crashAutoBetLastRound = state.crashRoundNumber;
    }

    // E. Place Bet (if BETTING) or Queue Bet (if IN_FLIGHT / CRASHED)
    await placeOrQueueCrashBet();
  }

  async function placeOrQueueCrashBet() {
    if (state.crashProcessing) return;
    state.crashProcessing = true;
    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.crashWagerInput ? el.crashWagerInput.value : state.crashWager)) || 100);
    state.crashWager = wager;
    const autoCashout = state.crashAutoCashout;

    if (state.balance < wager) {
      state.crashAutoBetActive = false;
      setCrashHud('Insufficient Balance', `You need ${wager.toLocaleString()} 🪙 (Balance: ${state.balance.toLocaleString()} 🪙).`, 'lost');
      state.crashProcessing = false;
      updateCrashActionCTA();
      return;
    }

    try {
      const res = await api('/crash/bet', 'POST', { wager, autoCashout });
      updateBalanceDisplay(res.balance);

      if (res.status === 'placed') {
        state.crashMyBet = res.bet;
        setCrashHud('Bet Armed', `Locked in ${wager.toLocaleString()} 🪙 for Round #${state.crashRoundNumber}!`, 'active');
      } else if (res.status === 'queued') {
        state.crashMyQueuedBet = res.queuedBet;
        setCrashHud('Queued', `Queued ${wager.toLocaleString()} 🪙 for the next flight! Click again to cancel.`, 'active');
      }
      fetchCrashState();
    } catch (err) {
      state.crashAutoBetActive = false;
      setCrashHud('Error', err.message, 'lost');
    } finally {
      state.crashProcessing = false;
      updateCrashActionCTA();
    }
  }

  async function cancelQueuedCrashBet() {
    if (state.crashProcessing) return;
    state.crashProcessing = true;
    Sound.click();

    try {
      const res = await api('/crash/bet', 'POST', { cancelQueue: true });
      state.crashMyQueuedBet = null;
      updateBalanceDisplay(res.balance);
      setCrashHud('Cancelled', 'Queued bet cancelled and refunded to your wallet.', 'ready');
    } catch (err) {
      setCrashHud('Error', err.message, 'lost');
    } finally {
      state.crashProcessing = false;
      updateCrashActionCTA();
    }
  }

  async function cashOutContinuousCrash() {
    if (state.crashProcessing || state.crashPhase !== 'IN_FLIGHT' || !state.crashMyBet || state.crashMyBet.cashedOut) return;
    state.crashProcessing = true;
    Sound.click();

    try {
      const res = await api('/crash/cashout', 'POST', {});
      if (res.crashed) {
        setCrashHud('Too Late', `Flight detonated at ${Number(res.crashPoint).toFixed(2)}×!`, 'lost');
        return;
      }

      state.crashMyBet.cashedOut = true;
      state.crashMyBet.cashoutMult = res.multiplier;
      state.crashMyBet.profit = res.profit;
      updateBalanceDisplay(res.balance, true);

      if (state.crashLastCelebratedRound !== state.crashRoundNumber) {
        state.crashLastCelebratedRound = state.crashRoundNumber;
        celebrateCrashCashout(res.multiplier, res.profit);
      }
    } catch (err) {
      setCrashHud('Error', err.message, 'lost');
    } finally {
      state.crashProcessing = false;
      updateCrashActionCTA();
    }
  }

  function setCrashHud(badge, msg, type = 'ready') {
    if (!el.crashHudBadge || !el.crashHudMessage) return;
    el.crashHudBadge.textContent = badge;
    el.crashHudBadge.className = `hud-badge ${type}`;
    el.crashHudMessage.innerHTML = msg;
  }

  // =========================================================================
  // 10. MINES GAME LOGIC & TILE INTERACTIONS
  // =========================================================================

  function buildGrid() {
    if (!el.minesGrid) return;
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
    return el.minesGrid ? el.minesGrid.querySelector(`.tile[data-idx="${idx}"]`) : null;
  }

  function revealGem(idx, playSound = true) {
    const tile = getTile(idx);
    if (!tile) return;

    tile.classList.add('revealed', 'is-gem');
    const back = tile.querySelector('.tile-back');
    back.innerHTML = SVG_GEM;

    if (playSound) {
      Sound.gem(state.revealedIndices.size);
      if (minesCanvas) {
        const rect = tile.getBoundingClientRect();
        const parentRect = minesCanvas.getBoundingClientRect();
        spawnGemSparks(rect.left - parentRect.left + rect.width / 2, rect.top - parentRect.top + rect.height / 2);
      }
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
      if (minesCanvas) {
        const rect = tile.getBoundingClientRect();
        const parentRect = minesCanvas.getBoundingClientRect();
        spawnMineBlast(rect.left - parentRect.left + rect.width / 2, rect.top - parentRect.top + rect.height / 2);
      }
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

  async function startMinesGame() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    el.mainActionButton.disabled = true;

    clearAllPendingTimeouts();
    state.roundId++;
    const currentRound = state.roundId;

    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 100);
    const bombs = Math.min(24, Math.max(1, Math.floor(Number(el.minesCountSelect.value)) || 3));

    if (state.balance < wager) {
      setMinesHud('Error', `Insufficient balance! You have ${state.balance.toLocaleString()} 🪙.`, 'lost');
      state.isProcessing = false;
      el.mainActionButton.disabled = false;
      return;
    }

    state.activeGame = false;
    state.cashedOut = false;
    state.peekMode = false;
    state.revealedIndices.clear();
    buildGrid();

    try {
      const res = await api('/mines/start', 'POST', { wager, bombs });
      if (state.roundId !== currentRound) return;

      state.gameId = res.gameId;
      state.activeGame = true;
      state.cashedOut = false;
      state.peekMode = false;
      state.wager = res.wager;
      state.bombs = res.bombs;
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      state.revealedIndices.clear();

      updateBalanceDisplay(res.balance);
      enterActiveMinesState();
      setMinesHud('Active', 'Round in progress. Uncover gems or Cash Out anytime!', 'active');
    } catch (err) {
      setMinesHud('Error', err.message, 'lost');
      resetMinesToIdleState();
    } finally {
      state.isProcessing = false;
      el.mainActionButton.disabled = false;
    }
  }

  async function handleTileClick(idx, tileEl) {
    if (state.isProcessing) return;

    if (state.peekMode) {
      if (tileEl.classList.contains('revealed')) return;
      state.isProcessing = true;
      const currentRound = state.roundId;
      try {
        const res = await api('/mines/peek', 'POST', { tileIdx: idx, gameId: state.gameId });
        if (state.roundId === currentRound) {
          revealPeek(idx, res.isBomb);
        }
      } catch {} finally {
        state.isProcessing = false;
      }
      return;
    }

    if (!state.activeGame) return;
    if (state.revealedIndices.has(idx)) return;

    state.isProcessing = true;
    const currentRound = state.roundId;

    try {
      const res = await api('/mines/reveal', 'POST', { tileIdx: idx, gameId: state.gameId });
      if (state.roundId !== currentRound) return;

      if (res.hitBomb) {
        state.activeGame = false;
        revealBomb(idx, true, false);
        updateBalanceDisplay(res.balance);

        if (Array.isArray(res.allBombs)) {
          res.allBombs.forEach((bIdx, i) => {
            if (bIdx !== idx) {
              safeTimeout(() => {
                revealBomb(bIdx, false, true);
              }, (i + 1) * 45);
            }
          });
        }

        setMinesHud('Detonated', `Explosion! Lost ${state.wager.toLocaleString()} 🪙. Click Bet to play again.`, 'lost');
        resetMinesToIdleState();
        refreshProfile();
        loadLeaderboard();
        return;
      }

      state.revealedIndices.add(idx);
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      revealGem(idx, true);
      updateMinesTelemetry();

      el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;
      el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
      el.hudProfitVal.textContent = `+${Number(res.profit).toLocaleString()} 🪙`;

      if (res.won) {
        state.activeGame = false;
        updateBalanceDisplay(res.balance, true);
        Sound.cashout();
        spawnCoinShower();
        showMinesVictory('PERFECT CLEAR!', res.multiplier, res.profit);
        setMinesHud('Perfect', `Cleared all safe gems! Won ${res.winAmount.toLocaleString()} 🪙!`, 'won');
        resetMinesToIdleState();
        refreshProfile();
        loadLeaderboard();
        return;
      }

      setMinesHud('Safe', `Gem uncovered! Next mult: ${res.nextMultiplier.toFixed(2)}×`, 'active');
    } catch (err) {
      setMinesHud('Error', err.message, 'lost');
    } finally {
      state.isProcessing = false;
    }
  }

  async function cashOutMines() {
    if (!state.activeGame || state.isProcessing || state.revealedIndices.size === 0) return;
    state.isProcessing = true;
    el.mainActionButton.disabled = true;
    Sound.click();

    const currentRound = state.roundId;

    try {
      const res = await api('/mines/cashout', 'POST', { gameId: state.gameId });
      if (state.roundId !== currentRound) return;

      state.activeGame = false;
      state.cashedOut = true;
      state.peekMode = true;

      updateBalanceDisplay(res.balance, true);
      Sound.cashout();
      spawnCoinShower();

      showMinesVictory('CASHED OUT', res.multiplier, res.profit);
      setMinesHud('Cashed Out', `Locked in +${res.winAmount.toLocaleString()} 🪙! (Peek remaining tiles)`, 'won');

      el.mainActionButton.className = 'btn-stake-cta btn-replay';
      el.actionBtnTitle.textContent = 'Play Again';
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;

      refreshProfile();
      loadLeaderboard();
    } catch (err) {
      setMinesHud('Error', err.message, 'lost');
    } finally {
      state.isProcessing = false;
      el.mainActionButton.disabled = false;
    }
  }

  function enterActiveMinesState() {
    el.wagerInput.disabled = true;
    el.minesCountSelect.disabled = true;

    el.mainActionButton.className = 'btn-stake-cta btn-cashout';
    el.actionBtnTitle.textContent = 'Cashout';
    el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;

    el.hudProfitBox.style.display = 'flex';
    el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
    el.hudProfitVal.textContent = `+${Math.max(0, state.currentWin - state.wager).toLocaleString()} 🪙`;
    updateMinesTelemetry();
  }

  function resetMinesToIdleState() {
    el.wagerInput.disabled = false;
    el.minesCountSelect.disabled = false;

    el.mainActionButton.className = 'btn-stake-cta btn-bet';
    el.actionBtnTitle.textContent = 'Bet';
    el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()} 🪙`;

    el.hudProfitBox.style.display = 'none';
    updateMinesTelemetry();

    el.mainActionButton.disabled = true;
    safeTimeout(() => {
      el.mainActionButton.disabled = false;
    }, 300);
  }

  function setMinesHud(badge, msg, type = 'ready') {
    if (!el.hudStateBadge || !el.hudMessage) return;
    el.hudStateBadge.textContent = badge;
    el.hudStateBadge.className = `hud-badge ${type}`;
    el.hudMessage.innerHTML = msg;
  }

  function showMinesVictory(badge, mult, profit) {
    el.modalBadge.textContent = badge;
    el.modalMult.textContent = `${Number(mult).toFixed(2)}×`;
    el.modalWinAmount.textContent = `+${Number(profit).toLocaleString()} 🪙`;
    el.modalSubtext.textContent = state.authenticated
      ? 'Winnings synced directly to your Discord wallet!'
      : 'Demo winnings credited. Run /play in Discord to link your server wallet!';
    el.victoryModal.classList.add('active');
  }

  function hideMinesVictory() {
    el.victoryModal.classList.remove('active');
  }

  function syncBombPills(val) {
    if (el.auxMineCount) el.auxMineCount.textContent = `${val} ${val === 1 ? 'Mine' : 'Mines'}`;
    el.minePills.forEach((p) => {
      p.classList.toggle('active', Number(p.dataset.bombs) === val);
    });
  }

  // =========================================================================
  // 11. DUAL LEADERBOARD & HALL OF FAME RENDERER
  // =========================================================================

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }[tag] || tag));
  }

  function formatTimeAgo(ts) {
    if (!ts) return 'recently';
    const diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  async function loadLeaderboard() {
    try {
      const [minesRes, crashRes] = await Promise.allSettled([
        api('/mines/leaderboard'),
        api('/crash/leaderboard'),
      ]);

      if (minesRes.status === 'fulfilled') state.minesLeaderboard = minesRes.value;
      if (crashRes.status === 'fulfilled') state.crashLeaderboard = crashRes.value;

      renderLeaderboardTable(state.activeModalTab, el.lbModalContent);
      renderLeaderboardTable(state.activeStageTab, el.lbStageContent);
    } catch {}
  }

  function renderLeaderboardTable(category, container) {
    if (!container) return;
    if (!state.minesLeaderboard && !state.crashLeaderboard) {
      container.innerHTML = '<div class="lb-loading">Loading live leaderboard...</div>';
      return;
    }

    const mData = state.minesLeaderboard || {};
    const cData = state.crashLeaderboard || {};

    let list = [];
    let isCrashTab = false;

    if (category === 'mines-multipliers') {
      list = mData.topMultipliers || [];
    } else if (category === 'crash-multipliers') {
      list = cData.topMultipliers || [];
      isCrashTab = true;
    } else if (category === 'payouts') {
      const merged = [...(mData.topPayouts || []), ...(cData.topPayouts || [])];
      merged.sort((a, b) => Number(b.payout) - Number(a.payout));
      list = merged.slice(0, 15);
    } else if (category === 'players') {
      list = mData.topPlayers || cData.topPlayers || [];
    } else if (category === 'recent') {
      const merged = [...(mData.recentWins || []), ...(cData.recentWins || [])];
      merged.sort((a, b) => b.timestamp - a.timestamp);
      list = merged.slice(0, 15);
    }

    if (!Array.isArray(list) || list.length === 0) {
      container.innerHTML = '<div class="lb-empty">No records registered yet. Play a game to make history!</div>';
      return;
    }

    if (category === 'players') {
      let html = `
        <table class="lb-table">
          <thead>
            <tr>
              <th style="width: 50px;">Rank</th>
              <th>Player</th>
              <th style="text-align: right;">Total Profit</th>
              <th style="text-align: center;">Best Mult</th>
              <th style="text-align: right;">Wins</th>
              <th style="text-align: right;">Last Win</th>
            </tr>
          </thead>
          <tbody>
      `;

      list.forEach((p, i) => {
        const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
        const mult = Number(p.highestMultiplier || 1.0);
        const multChipClass = mult >= 10 ? 'mult-gold' : mult >= 3 ? 'mult-cyan' : 'mult-green';
        html += `
          <tr>
            <td><span class="lb-rank ${rankClass}">${i + 1}</span></td>
            <td>
              <div class="lb-player-cell">
                <img class="lb-avatar" src="${escapeHtml(p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="Avatar">
                <span class="lb-username">${escapeHtml(p.username)}</span>
              </div>
            </td>
            <td style="text-align: right;"><span class="lb-profit">+${Number(p.totalProfit).toLocaleString()} 🪙</span></td>
            <td style="text-align: center;"><span class="lb-mult-chip ${multChipClass}">${mult.toFixed(2)}×</span></td>
            <td style="text-align: right; color: #ffffff; font-weight: 700;">${p.totalWins}</td>
            <td style="text-align: right;"><span class="lb-time">${formatTimeAgo(p.lastWinAt)}</span></td>
          </tr>
        `;
      });

      html += `</tbody></table>`;
      container.innerHTML = html;
      return;
    }

    let html = `
      <table class="lb-table">
        <thead>
          <tr>
            <th style="width: 50px;">Rank</th>
            <th>Player</th>
            <th style="text-align: center;">Multiplier</th>
            <th style="text-align: center;">${isCrashTab ? 'Wager / Altitude' : 'Wager / Bombs'}</th>
            <th style="text-align: right;">Net Profit</th>
            <th style="text-align: right;">Time</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach((w, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
      const mult = Number(w.multiplier || 1.0);
      const multChipClass = mult >= 10 ? 'mult-gold' : mult >= 3 ? 'mult-cyan' : 'mult-green';
      const detailBadge = w.bombs !== undefined
        ? `${Number(w.wager).toLocaleString()} 🪙 • ${w.bombs}💣`
        : `${Number(w.wager).toLocaleString()} 🪙 • 🚀 Orbit`;

      html += `
        <tr>
          <td><span class="lb-rank ${rankClass}">${i + 1}</span></td>
          <td>
            <div class="lb-player-cell">
              <img class="lb-avatar" src="${escapeHtml(w.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="Avatar">
              <span class="lb-username">${escapeHtml(w.username)}</span>
            </div>
          </td>
          <td style="text-align: center;"><span class="lb-mult-chip ${multChipClass}">${mult.toFixed(2)}×</span></td>
          <td style="text-align: center;"><span class="lb-wager-bombs">${detailBadge}</span></td>
          <td style="text-align: right;"><span class="lb-profit">+${Number(w.profit).toLocaleString()} 🪙</span></td>
          <td style="text-align: right;"><span class="lb-time">${formatTimeAgo(w.timestamp)}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  function openLeaderboard() {
    Sound.click();
    if (el.leaderboardModal) el.leaderboardModal.classList.add('active');
    loadLeaderboard();
  }

  function closeLeaderboard() {
    if (el.leaderboardModal) el.leaderboardModal.classList.remove('active');
  }

  // =========================================================================
  // 12. GLOBAL GAME SWITCHER (PAUSE HIDDEN CANVASES FOR ZERO LAG)
  // =========================================================================

  function switchGame(targetGame, playSound = false) {
    if (playSound) Sound.click();
    state.currentGame = targetGame;

    if (el.btnSwitchMines) el.btnSwitchMines.classList.toggle('active', targetGame === 'mines');
    if (el.btnSwitchCrash) el.btnSwitchCrash.classList.toggle('active', targetGame === 'crash');

    if (targetGame === 'crash') {
      if (el.minesChassis) el.minesChassis.style.display = 'none';
      if (el.crashChassis) el.crashChassis.style.display = 'grid';
      startCrashCanvasLoop();
      updateCrashTelemetry();
      fetchCrashState();
    } else {
      if (el.minesChassis) el.minesChassis.style.display = 'grid';
      if (el.crashChassis) el.crashChassis.style.display = 'none';
      stopCrashCanvasLoop();
      resizeMinesCanvas();
      updateMinesTelemetry();
    }

    renderHistoryRibbon();

    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('game', targetGame);
      window.history.replaceState({}, '', newUrl.toString());
    } catch {}
  }

  // =========================================================================
  // 13. PROFILE INITIALIZATION & RECOVERY
  // =========================================================================

  async function refreshProfile() {
    try {
      const data = await api('/profile');
      state.authenticated = Boolean(data.authenticated);
      state.userId = data.userId;
      state.username = data.username || 'Guest';
      state.avatarUrl = data.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

      if (el.userName) el.userName.textContent = state.username;
      if (el.userAvatar && data.avatarUrl) el.userAvatar.src = data.avatarUrl;
      updateBalanceDisplay(data.balance);
      updateDiscordSyncUI();

      if (Array.isArray(data.history)) state.minesHistory = data.history;
      if (Array.isArray(data.crashHistory)) state.crashHistory = data.crashHistory;
      renderHistoryRibbon();

      if (data.crashArena) {
        applyServerCrashState(data.crashArena);
      }

      if (data.activeGame && !state.activeGame) {
        state.gameId = data.activeGame.gameId || null;
        state.activeGame = true;
        state.wager = data.activeGame.wager;
        state.bombs = data.activeGame.bombs;
        state.currentMult = data.activeGame.multiplier;
        state.currentWin = data.activeGame.currentWin;

        if (el.wagerInput) el.wagerInput.value = state.wager;
        if (el.minesCountSelect) el.minesCountSelect.value = String(state.bombs);
        syncBombPills(state.bombs);

        buildGrid();
        data.activeGame.revealed.forEach((idx) => {
          state.revealedIndices.add(idx);
          revealGem(idx, false);
        });

        enterActiveMinesState();
        setMinesHud('Active', 'Game restored. Pick a tile or cash out your locked profit!', 'active');
      }
    } catch (err) {
      console.warn('[Profile Error]', err.message);
    }
  }

  // =========================================================================
  // 14. EVENT LISTENERS & KEYBOARD SHORTCUTS
  // =========================================================================

  if (el.btnSwitchMines) el.btnSwitchMines.addEventListener('click', () => switchGame('mines', true));
  if (el.btnSwitchCrash) el.btnSwitchCrash.addEventListener('click', () => switchGame('crash', true));

  // Mines Primary CTA
  if (el.mainActionButton) {
    el.mainActionButton.addEventListener('click', () => {
      if (state.activeGame) {
        cashOutMines();
      } else {
        hideMinesVictory();
        startMinesGame();
      }
    });
  }

  if (el.btnModalPlayAgain) {
    el.btnModalPlayAgain.addEventListener('click', () => {
      hideMinesVictory();
      startMinesGame();
    });
  }

  if (el.btnModalClose) {
    el.btnModalClose.addEventListener('click', hideMinesVictory);
  }

  // Crash Primary CTA
  if (el.crashActionButton) {
    el.crashActionButton.addEventListener('click', handleCrashPrimaryButton);
  }

  // Crash Manual / Auto-Bet Mode Tabs
  if (el.btnCrashManualMode && el.btnCrashAutoMode) {
    el.btnCrashManualMode.addEventListener('click', () => {
      Sound.click();
      state.crashMode = 'manual';
      state.crashAutoBetActive = false;
      el.btnCrashManualMode.classList.add('active');
      el.btnCrashAutoMode.classList.remove('active');
      updateCrashActionCTA();
    });

    el.btnCrashAutoMode.addEventListener('click', () => {
      Sound.click();
      state.crashMode = 'auto';
      el.btnCrashAutoMode.classList.add('active');
      el.btnCrashManualMode.classList.remove('active');
      updateCrashActionCTA();
    });
  }

  // Spacebar Shortcut for Instant Cashout / Bet
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (state.currentGame === 'crash') {
      e.preventDefault();
      handleCrashPrimaryButton();
    } else if (state.currentGame === 'mines' && state.activeGame && state.revealedIndices.size > 0) {
      e.preventDefault();
      cashOutMines();
    }
  });

  // Sound Toggle
  if (el.soundBtn) {
    el.soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('moonflip_sound_muted', (!state.soundEnabled).toString());
      if (el.soundSvgOn) el.soundSvgOn.style.display = state.soundEnabled ? 'block' : 'none';
      if (el.soundSvgOff) el.soundSvgOff.style.display = state.soundEnabled ? 'none' : 'block';
      if (!state.soundEnabled) Sound.stopThruster();
      else Sound.click();
    });
  }

  // Mines Wager Controls
  el.quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Sound.click();
      el.wagerInput.value = chip.dataset.val;
      state.wager = Number(chip.dataset.val);
      updateMinesTelemetry();
    });
  });

  if (el.btnHalf) {
    el.btnHalf.addEventListener('click', () => {
      Sound.click();
      const curr = Number(el.wagerInput.value) || 100;
      el.wagerInput.value = Math.max(10, Math.floor(curr / 2));
      state.wager = Number(el.wagerInput.value);
      updateMinesTelemetry();
    });
  }

  if (el.btnDouble) {
    el.btnDouble.addEventListener('click', () => {
      Sound.click();
      const curr = Number(el.wagerInput.value) || 100;
      el.wagerInput.value = Math.min(state.balance, curr * 2);
      state.wager = Number(el.wagerInput.value);
      updateMinesTelemetry();
    });
  }

  if (el.btnMax) {
    el.btnMax.addEventListener('click', () => {
      Sound.click();
      el.wagerInput.value = Math.max(10, state.balance);
      state.wager = Number(el.wagerInput.value);
      updateMinesTelemetry();
    });
  }

  if (el.wagerInput) {
    el.wagerInput.addEventListener('input', () => {
      state.wager = Math.max(10, Math.floor(Number(el.wagerInput.value)) || 10);
      updateMinesTelemetry();
    });
  }

  if (el.minesCountSelect) {
    el.minesCountSelect.addEventListener('change', () => {
      const val = Number(el.minesCountSelect.value);
      state.bombs = val;
      syncBombPills(val);
      updateMinesTelemetry();
    });
  }

  el.minePills.forEach((p) => {
    p.addEventListener('click', () => {
      Sound.click();
      const val = Number(p.dataset.bombs);
      if (el.minesCountSelect) el.minesCountSelect.value = String(val);
      state.bombs = val;
      syncBombPills(val);
      updateMinesTelemetry();
    });
  });

  // Crash Wager & Auto-Cashout Controls
  el.crashChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Sound.click();
      if (el.crashWagerInput) el.crashWagerInput.value = chip.dataset.val;
      state.crashWager = Number(chip.dataset.val);
      updateCrashTelemetry();
    });
  });

  if (el.btnCrashHalf) {
    el.btnCrashHalf.addEventListener('click', () => {
      Sound.click();
      const curr = Number(el.crashWagerInput.value) || 100;
      el.crashWagerInput.value = Math.max(10, Math.floor(curr / 2));
      state.crashWager = Number(el.crashWagerInput.value);
      updateCrashTelemetry();
    });
  }

  if (el.btnCrashDouble) {
    el.btnCrashDouble.addEventListener('click', () => {
      Sound.click();
      const curr = Number(el.crashWagerInput.value) || 100;
      el.crashWagerInput.value = Math.min(state.balance, curr * 2);
      state.crashWager = Number(el.crashWagerInput.value);
      updateCrashTelemetry();
    });
  }

  if (el.btnCrashMax) {
    el.btnCrashMax.addEventListener('click', () => {
      Sound.click();
      el.crashWagerInput.value = Math.max(10, state.balance);
      state.crashWager = Number(el.crashWagerInput.value);
      updateCrashTelemetry();
    });
  }

  if (el.crashWagerInput) {
    el.crashWagerInput.addEventListener('input', () => {
      state.crashWager = Math.max(10, Math.floor(Number(el.crashWagerInput.value)) || 10);
      updateCrashTelemetry();
    });
  }

  el.crashAutoPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      Sound.click();
      const target = Number(pill.dataset.target);
      if (el.crashAutoCashoutInput) el.crashAutoCashoutInput.value = target.toFixed(2);
      state.crashAutoCashout = target;
      el.crashAutoPills.forEach((p) => p.classList.toggle('active', p === pill));
      updateCrashTelemetry();
    });
  });

  if (el.btnCrashClearAuto) {
    el.btnCrashClearAuto.addEventListener('click', () => {
      Sound.click();
      if (el.crashAutoCashoutInput) el.crashAutoCashoutInput.value = '';
      state.crashAutoCashout = null;
      el.crashAutoPills.forEach((p) => p.classList.remove('active'));
      updateCrashTelemetry();
    });
  }

  if (el.crashAutoCashoutInput) {
    el.crashAutoCashoutInput.addEventListener('input', () => {
      const val = parseFloat(el.crashAutoCashoutInput.value);
      state.crashAutoCashout = !isNaN(val) && val >= 1.01 ? val : null;
      el.crashAutoPills.forEach((p) => {
        p.classList.toggle('active', Boolean(state.crashAutoCashout && Number(p.dataset.target) === state.crashAutoCashout));
      });
      updateCrashTelemetry();
    });
  }

  // Leaderboard & Fairness Modals
  if (el.btnOpenLeaderboard) el.btnOpenLeaderboard.addEventListener('click', openLeaderboard);
  if (el.btnCloseLeaderboard) el.btnCloseLeaderboard.addEventListener('click', closeLeaderboard);
  if (el.btnDoneLeaderboard) el.btnDoneLeaderboard.addEventListener('click', closeLeaderboard);

  if (el.lbModalTabs) {
    el.lbModalTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        Sound.click();
        el.lbModalTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeModalTab = tab.dataset.tab;
        renderLeaderboardTable(state.activeModalTab, el.lbModalContent);
      });
    });
  }

  if (el.lbStageTabs) {
    el.lbStageTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        Sound.click();
        el.lbStageTabs.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        state.activeStageTab = tab.dataset.stageTab;
        renderLeaderboardTable(state.activeStageTab, el.lbStageContent);
      });
    });
  }

  const openFairness = () => {
    Sound.click();
    if (el.fairnessModal) el.fairnessModal.classList.add('active');
  };
  const closeFairness = () => {
    if (el.fairnessModal) el.fairnessModal.classList.remove('active');
  };
  if (el.btnOpenFairness) el.btnOpenFairness.addEventListener('click', openFairness);
  if (el.btnOpenFairness2) el.btnOpenFairness2.addEventListener('click', openFairness);
  if (el.btnOpenCrashFairness) el.btnOpenCrashFairness.addEventListener('click', openFairness);
  if (el.btnCloseFairness) el.btnCloseFairness.addEventListener('click', closeFairness);
  if (el.btnDoneFairness) el.btnDoneFairness.addEventListener('click', closeFairness);

  // =========================================================================
  // 15. BOOTSTRAP
  // =========================================================================

  buildGrid();
  updateMinesTelemetry();
  updateCrashTelemetry();
  resizeMinesCanvas();
  resizeCrashCanvas();

  switchGame(state.currentGame);
  refreshProfile();
  connectRealtimeStream();
  loadLeaderboard();

  if (!state.soundEnabled) {
    if (el.soundSvgOn) el.soundSvgOn.style.display = 'none';
    if (el.soundSvgOff) el.soundSvgOff.style.display = 'block';
  }
})();
