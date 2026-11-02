/**
 * MOONFLIP CASINO — 5x5 MINES ARENA & ORBITAL CRASH
 * High-Precision Luxury Gaming Engine, 60FPS Canvas & Audio Synthesizer
 * 100% English Localization • Zero-Stale State Architecture
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

    // Crash Game State
    crashWager: 100,
    crashAutoCashout: null,
    crashFlightId: null,
    crashActive: false,
    crashCrashed: false,
    crashCashedOut: false,
    crashStartTime: null,
    crashCurrentMult: 1.0,
    crashProcessing: false,
    crashMonitorAbort: null,
    crashRoundId: 0,

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

    // Victorious Cashout Fanfare & Harmonic Coin Cascade
    cashout() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
      chord.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.07);

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.07 + 0.45);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + i * 0.07);
        osc.stop(ctx.currentTime + i * 0.07 + 0.5);
      });
    },

    // Dynamic Rocket Engine Drone / Acceleration Rumble
    startThruster() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;
      this.stopThruster();

      try {
        thrusterOsc = ctx.createOscillator();
        thrusterFilter = ctx.createBiquadFilter();
        thrusterGain = ctx.createGain();

        thrusterOsc.type = 'triangle';
        thrusterOsc.frequency.setValueAtTime(75, ctx.currentTime);

        thrusterFilter.type = 'lowpass';
        thrusterFilter.frequency.setValueAtTime(220, ctx.currentTime);
        thrusterFilter.Q.setValueAtTime(2.5, ctx.currentTime);

        thrusterGain.gain.setValueAtTime(0.01, ctx.currentTime);
        thrusterGain.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.4);

        thrusterOsc.connect(thrusterFilter);
        thrusterFilter.connect(thrusterGain);
        thrusterGain.connect(ctx.destination);

        thrusterOsc.start();
      } catch (e) {
        console.warn('Thruster Audio Init failed', e);
      }
    },

    updateThruster(mult) {
      if (!state.soundEnabled || !thrusterOsc || !audioCtx) return;
      try {
        const targetFreq = Math.min(550, 75 + Math.log(mult) * 110);
        const filterFreq = Math.min(1400, 220 + Math.log(mult) * 280);
        thrusterOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.08);
        thrusterFilter.frequency.setTargetAtTime(filterFreq, audioCtx.currentTime, 0.08);
      } catch {}
    },

    stopThruster() {
      if (thrusterGain && audioCtx) {
        try {
          thrusterGain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
          setTimeout(() => {
            if (thrusterOsc) {
              try { thrusterOsc.stop(); } catch {}
              thrusterOsc = null;
            }
          }, 90);
        } catch {
          if (thrusterOsc) {
            try { thrusterOsc.stop(); } catch {}
            thrusterOsc = null;
          }
        }
      } else if (thrusterOsc) {
        try { thrusterOsc.stop(); } catch {}
        thrusterOsc = null;
      }
    },

    // Crash Explosion Supernova Sound
    crashExplosion() {
      this.stopThruster();
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sawtooth';
      sub.frequency.setValueAtTime(150, ctx.currentTime);
      sub.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 0.7);

      subGain.gain.setValueAtTime(0.45, ctx.currentTime);
      subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);

      sub.connect(subGain);
      subGain.connect(ctx.destination);
      sub.start();
      sub.stop(ctx.currentTime + 0.7);

      const bufferSize = ctx.sampleRate * 0.6;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1200, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.6);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start();
    }
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
  // 4. MINES PARTICLE CANVAS ENGINE
  // =========================================================================

  const minesCanvas = document.getElementById('particleCanvas');
  const pCtx = minesCanvas ? minesCanvas.getContext('2d') : null;
  let particles = [];
  let animId = null;

  function resizeMinesCanvas() {
    if (!minesCanvas) return;
    const rect = minesCanvas.getBoundingClientRect();
    minesCanvas.width = rect.width;
    minesCanvas.height = rect.height;
  }
  window.addEventListener('resize', resizeMinesCanvas);

  function spawnMineBlast(x, y) {
    resizeMinesCanvas();
    if (!minesCanvas) return;
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
    resizeMinesCanvas();
    if (!minesCanvas) return;
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
    resizeMinesCanvas();
    if (!minesCanvas) return;
    const colors = ['#00e701', '#00f0ff', '#f59e0b', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 85; i++) {
      particles.push({
        x: Math.random() * minesCanvas.width,
        y: minesCanvas.height * 0.8,
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
  // 5. ORBITAL CRASH 60FPS CANVAS ENGINE
  // =========================================================================

  const crashCanvas = document.getElementById('crashCanvas');
  const cCtx = crashCanvas ? crashCanvas.getContext('2d') : null;

  let crashAnimId = null;
  let crashStars = [];
  let crashFlameParticles = [];
  let crashExplosionParticles = [];
  let crashShockwave = null;
  let crashShakeFrames = 0;
  let crashShakeMagnitude = 0;

  function initCrashStars() {
    crashStars = [];
    const count = 75;
    for (let i = 0; i < count; i++) {
      crashStars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.5,
        baseAlpha: 0.2 + Math.random() * 0.6,
        twinkleSpeed: 0.02 + Math.random() * 0.04,
        twinkleOffset: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.6,
      });
    }
  }
  initCrashStars();

  function resizeCrashCanvas() {
    if (!crashCanvas) return;
    const rect = crashCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    crashCanvas.width = Math.floor(rect.width * dpr);
    crashCanvas.height = Math.floor(rect.height * dpr);
  }
  window.addEventListener('resize', resizeCrashCanvas);

  function triggerCrashSupernova(x, y) {
    crashExplosionParticles = [];
    const colors = ['#ff3344', '#ff8800', '#ffd700', '#ffffff', '#ff1f44'];
    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 9;
      crashExplosionParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 3 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.015 + Math.random() * 0.02,
      });
    }

    crashShockwave = {
      x, y,
      radius: 10,
      maxRadius: 160,
      alpha: 1,
    };

    crashShakeFrames = 22;
    crashShakeMagnitude = 14;
    Sound.crashExplosion();
  }

  function renderCrashCanvas() {
    if (!crashCanvas || !cCtx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = crashCanvas.width / dpr;
    const h = crashCanvas.height / dpr;

    cCtx.save();
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cCtx.clearRect(0, 0, w, h);

    // Apply Screen Shake on Detonation
    if (crashShakeFrames > 0) {
      const ox = (Math.random() - 0.5) * crashShakeMagnitude;
      const oy = (Math.random() - 0.5) * crashShakeMagnitude;
      cCtx.translate(ox, oy);
      crashShakeFrames--;
      crashShakeMagnitude *= 0.91;
    }

    // 1. Deep Space Gradient Background
    const bgGrad = cCtx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h));
    bgGrad.addColorStop(0, '#0c1422');
    bgGrad.addColorStop(1, '#070a10');
    cCtx.fillStyle = bgGrad;
    cCtx.fillRect(0, 0, w, h);

    // 2. Starfield with Multiplier Warp Drift
    const warpFactor = state.crashActive ? Math.min(6, 1 + (state.crashCurrentMult - 1) * 0.25) : 1;
    const now = Date.now();

    cCtx.fillStyle = '#ffffff';
    for (const s of crashStars) {
      if (state.crashActive) {
        s.x -= (s.speed * 0.001 * warpFactor);
        s.y += (s.speed * 0.0004 * warpFactor);
        if (s.x < 0) s.x = 1.0;
        if (s.y > 1) s.y = 0;
      }
      const tw = Math.sin(now * s.twinkleSpeed + s.twinkleOffset);
      const alpha = Math.max(0.1, Math.min(1, s.baseAlpha + tw * 0.2));
      cCtx.save();
      cCtx.globalAlpha = alpha;
      cCtx.beginPath();
      cCtx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }

    // Usable Chart Geometry
    const padL = 60;
    const padR = 60;
    const padT = 50;
    const padB = 55;
    const uw = w - padL - padR;
    const uh = h - padT - padB;
    const ox = padL;
    const oy = h - padB;

    // 3. Grid Coordinates & Multiplier Baseline Markers
    const currentMult = state.crashCurrentMult || 1.0;
    const maxPlotMult = Math.max(2.0, currentMult * 1.25);
    const elapsed = state.crashActive && state.crashStartTime ? Math.max(0, now - state.crashStartTime) : 0;
    const maxPlotTime = Math.max(5000, elapsed * 1.25);

    // Draw horizontal reference lines (1.5x, 2x, 3x, 5x, 10x, 25x, 50x, 100x)
    const refLevels = [1.2, 1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 250.0, 1000.0];
    cCtx.lineWidth = 1;
    cCtx.font = '11px "JetBrains Mono", monospace';

    for (const lvl of refLevels) {
      if (lvl > maxPlotMult) break;
      const yNorm = (lvl - 1) / (maxPlotMult - 1);
      const yPos = oy - yNorm * uh;

      cCtx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      cCtx.beginPath();
      cCtx.setLineDash([4, 6]);
      cCtx.moveTo(ox, yPos);
      cCtx.lineTo(ox + uw, yPos);
      cCtx.stroke();
      cCtx.setLineDash([]);

      cCtx.fillStyle = 'rgba(148, 163, 184, 0.65)';
      cCtx.textAlign = 'right';
      cCtx.fillText(`${lvl.toFixed(1)}×`, ox - 10, yPos + 4);
    }

    // Axes
    cCtx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.moveTo(ox, padT);
    cCtx.lineTo(ox, oy);
    cCtx.lineTo(ox + uw, oy);
    cCtx.stroke();

    // 4. Standby Radar Scan (when idle or ready)
    if (!state.crashActive && !state.crashCrashed) {
      const sweepAngle = (now * 0.0015) % (Math.PI * 2);
      const rx = ox + uw * 0.5;
      const ry = oy - uh * 0.45;
      const radius = Math.min(uw, uh) * 0.38;

      cCtx.save();
      cCtx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      cCtx.lineWidth = 1.5;
      cCtx.beginPath();
      cCtx.arc(rx, ry, radius, 0, Math.PI * 2);
      cCtx.arc(rx, ry, radius * 0.6, 0, Math.PI * 2);
      cCtx.arc(rx, ry, radius * 0.25, 0, Math.PI * 2);
      cCtx.stroke();

      // Sweeping line
      cCtx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
      cCtx.beginPath();
      cCtx.moveTo(rx, ry);
      cCtx.lineTo(rx + Math.cos(sweepAngle) * radius, ry + Math.sin(sweepAngle) * radius);
      cCtx.stroke();

      // Hovering Standby Rocket on Launchpad
      drawRocket(cCtx, ox + 35, oy - 25, 0, false, false);
      cCtx.restore();
    }

    // 5. Active Flight Trajectory Curve & Dynamic Rocket
    if (state.crashActive || state.crashCrashed || state.crashCashedOut) {
      const steps = 60;
      const points = [];

      for (let i = 0; i <= steps; i++) {
        const tau = (i / steps) * elapsed;
        const mTau = Math.exp(0.00006 * tau);
        const px = ox + (tau / maxPlotTime) * uw;
        const py = oy - ((mTau - 1) / (maxPlotMult - 1)) * uh;
        points.push({ x: px, y: py });
      }

      if (points.length >= 2) {
        // Gradient color for line based on multiplier
        let strokeColor = '#ff9900';
        let fillColorTop = 'rgba(255, 153, 0, 0.22)';
        if (currentMult >= 50.0) {
          strokeColor = '#d946ef';
          fillColorTop = 'rgba(217, 70, 239, 0.25)';
        } else if (currentMult >= 10.0) {
          strokeColor = '#ffd700';
          fillColorTop = 'rgba(255, 215, 0, 0.25)';
        } else if (currentMult >= 5.0) {
          strokeColor = '#00e701';
          fillColorTop = 'rgba(0, 231, 1, 0.22)';
        } else if (currentMult >= 2.0) {
          strokeColor = '#00f0ff';
          fillColorTop = 'rgba(0, 240, 255, 0.22)';
        }

        if (state.crashCrashed) {
          strokeColor = '#ff3344';
          fillColorTop = 'rgba(255, 51, 68, 0.18)';
        } else if (state.crashCashedOut) {
          strokeColor = '#00e701';
          fillColorTop = 'rgba(0, 231, 1, 0.25)';
        }

        // Fill Area Under Exponential Curve
        cCtx.save();
        const areaGrad = cCtx.createLinearGradient(0, padT, 0, oy);
        areaGrad.addColorStop(0, fillColorTop);
        areaGrad.addColorStop(1, 'rgba(0,0,0,0)');
        cCtx.fillStyle = areaGrad;

        cCtx.beginPath();
        cCtx.moveTo(ox, oy);
        for (const pt of points) {
          cCtx.lineTo(pt.x, pt.y);
        }
        cCtx.lineTo(points[points.length - 1].x, oy);
        cCtx.closePath();
        cCtx.fill();
        cCtx.restore();

        // Neon Glow Trajectory Stroke
        cCtx.save();
        cCtx.shadowColor = strokeColor;
        cCtx.shadowBlur = 14;
        cCtx.strokeStyle = strokeColor;
        cCtx.lineWidth = 3.5;
        cCtx.lineCap = 'round';
        cCtx.lineJoin = 'round';

        cCtx.beginPath();
        cCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          cCtx.lineTo(points[i].x, points[i].y);
        }
        cCtx.stroke();
        cCtx.restore();

        // Rocket Position & Tangent
        const tip = points[points.length - 1];
        const prev = points[Math.max(0, points.length - 3)];
        const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);

        // Rocket Thruster Particles
        if (state.crashActive && Math.random() < 0.85) {
          crashFlameParticles.push({
            x: tip.x,
            y: tip.y,
            vx: -Math.cos(angle) * (2 + Math.random() * 4) + (Math.random() - 0.5) * 1.5,
            vy: -Math.sin(angle) * (2 + Math.random() * 4) + (Math.random() - 0.5) * 1.5,
            r: 2.5 + Math.random() * 3,
            color: Math.random() > 0.4 ? '#ff9900' : '#00f0ff',
            alpha: 1,
            decay: 0.04 + Math.random() * 0.03,
          });
        }

        // Draw Spaceship unless exploded
        if (!state.crashCrashed) {
          drawRocket(cCtx, tip.x, tip.y, angle, state.crashActive, state.crashCashedOut);
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
      cCtx.save();
      cCtx.globalAlpha = p.alpha;
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }

    // 7. Shockwave Ring on Detonation
    if (crashShockwave && crashShockwave.alpha > 0) {
      cCtx.save();
      cCtx.globalAlpha = crashShockwave.alpha;
      cCtx.strokeStyle = '#ff3344';
      cCtx.lineWidth = 3;
      cCtx.beginPath();
      cCtx.arc(crashShockwave.x, crashShockwave.y, crashShockwave.radius, 0, Math.PI * 2);
      cCtx.stroke();
      cCtx.restore();

      crashShockwave.radius += 5.5;
      crashShockwave.alpha -= 0.035;
      if (crashShockwave.alpha <= 0) crashShockwave = null;
    }

    // 8. Supernova Explosion Spark Particles
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
      cCtx.save();
      cCtx.globalAlpha = p.alpha;
      cCtx.fillStyle = p.color;
      cCtx.beginPath();
      cCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      cCtx.fill();
      cCtx.restore();
    }

    cCtx.restore();

    // 60FPS Continuous Loop
    crashAnimId = requestAnimationFrame(renderCrashCanvas);
  }

  function drawRocket(ctx, x, y, angle, hasThrust = true, isCashed = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Pulsing Plasma Exhaust Flame
    if (hasThrust && !isCashed) {
      const flicker = Math.sin(Date.now() * 0.03) * 6;
      const flameLen = 22 + flicker;

      ctx.save();
      const flameGrad = ctx.createLinearGradient(0, 0, -flameLen, 0);
      flameGrad.addColorStop(0, '#ffffff');
      flameGrad.addColorStop(0.3, '#ffaa00');
      flameGrad.addColorStop(1, 'rgba(255, 30, 0, 0)');

      ctx.fillStyle = flameGrad;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-12 - flameLen, 0);
      ctx.lineTo(-12, 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Fuselage & Delta Wings
    ctx.fillStyle = isCashed ? '#00e701' : '#f8fafc';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;

    // Main body
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-8, -7);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-8, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Delta Wings
    ctx.fillStyle = isCashed ? '#059669' : '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(-13, -15);
    ctx.lineTo(-7, -5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(-13, 15);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit Glass Canopy
    ctx.fillStyle = '#00f0ff';
    ctx.beginPath();
    ctx.ellipse(3, 0, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // =========================================================================
  // 6. DOM ELEMENTS MAP
  // =========================================================================

  const el = {
    // Header & Global Nav
    btnSwitchMines: document.getElementById('btnSwitchMines'),
    btnSwitchCrash: document.getElementById('btnSwitchCrash'),
    minesChassis: document.getElementById('minesChassis'),
    crashChassis: document.getElementById('crashChassis'),
    balanceNumber: document.getElementById('balanceNumber'),
    auxBalance: document.getElementById('auxBalance'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
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

    // Crash Controls
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
    crashWinRate: document.getElementById('crashWinRate'),
    crashEstPayout: document.getElementById('crashEstPayout'),
    crashActionButton: document.getElementById('crashActionButton'),
    crashActionTitle: document.getElementById('crashActionTitle'),
    crashActionSub: document.getElementById('crashActionSub'),
    btnOpenCrashFairness: document.getElementById('btnOpenCrashFairness'),
    crashHudBadge: document.getElementById('crashHudBadge'),
    crashHudMessage: document.getElementById('crashHudMessage'),
    crashHudProfitBox: document.getElementById('crashHudProfitBox'),
    crashHudMultVal: document.getElementById('crashHudMultVal'),
    crashHudProfitVal: document.getElementById('crashHudProfitVal'),
    crashCanvas: document.getElementById('crashCanvas'),
    crashLiveMult: document.getElementById('crashLiveMult'),
    crashLiveStatus: document.getElementById('crashLiveStatus'),
    crashVictoryModal: document.getElementById('crashVictoryModal'),
    crashModalBadge: document.getElementById('crashModalBadge'),
    crashModalMult: document.getElementById('crashModalMult'),
    crashModalWinAmount: document.getElementById('crashModalWinAmount'),
    btnCrashModalAgain: document.getElementById('btnCrashModalAgain'),
    btnCrashModalClose: document.getElementById('btnCrashModalClose'),

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
  // 7. TELEMETRY & ODDS COMPUTATIONS
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

    // Zone Badge
    const mult = state.crashCurrentMult || 1.0;
    let zone = 'LIFTOFF';
    let zoneClass = 'text-cyan';

    if (mult >= 50.0) {
      zone = 'INTERSTELLAR';
      zoneClass = 'text-purple';
    } else if (mult >= 10.0) {
      zone = 'DEEP SPACE';
      zoneClass = 'text-gold';
    } else if (mult >= 5.0) {
      zone = 'LOW ORBIT';
      zoneClass = 'text-emerald';
    } else if (mult >= 2.0) {
      zone = 'STRATOSPHERE';
      zoneClass = 'text-cyan';
    }

    if (el.crashAltitudeZone) {
      el.crashAltitudeZone.textContent = zone;
      el.crashAltitudeZone.className = `tele-val ${zoneClass}`;
    }

    if (!state.crashActive && el.crashActionSub) {
      el.crashActionSub.textContent = `${Number(wager).toLocaleString()} 🪙`;
    }
  }

  function updateBalanceDisplay(newBalance, animate = false) {
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
        won = mult > 1.0;
      } else if (item && typeof item === 'object') {
        mult = Number(item.multiplier || 0);
        won = Boolean(item.won);
      }

      if (!won || mult <= 1.0) {
        chip.classList.add('chip-loss');
      } else if (mult >= 10.0) {
        chip.classList.add('chip-purple');
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
  // 8. MINES GAME LOGIC & TILE INTERACTIONS
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

  async function startMinesGame() {
    if (state.isProcessing) return;
    state.isProcessing = true;
    el.mainActionButton.disabled = true;

    // Immediately cancel any pending ghost timeouts from prior round
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

    // Instantly reset board grid to fresh unrevealed state
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

    // Peek Mode (Post-cashout curiosity exploration)
    if (state.peekMode) {
      if (tileEl.classList.contains('revealed')) return;
      state.isProcessing = true;
      const currentRound = state.roundId;
      try {
        const res = await api('/mines/peek', 'POST', { tileIdx: idx, gameId: state.gameId });
        if (state.roundId === currentRound) {
          revealPeek(idx, res.isBomb);
        }
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
    const currentRound = state.roundId;

    try {
      const res = await api('/mines/reveal', 'POST', { tileIdx: idx, gameId: state.gameId });
      if (state.roundId !== currentRound) return;

      // Hit Mine!
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

      // Safe Gem Found!
      state.revealedIndices.add(idx);
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      revealGem(idx, true);
      updateMinesTelemetry();

      el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()} 🪙`;
      el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
      el.hudProfitVal.textContent = `+${Number(res.profit).toLocaleString()} 🪙`;

      // Perfect Clear!
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
    }, 350);
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
    el.modalSubtext.textContent = 'Winnings credited to your Discord wallet.';
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
  // 9. ORBITAL CRASH GAME LOGIC
  // =========================================================================

  async function startCrashFlight() {
    if (state.crashProcessing || state.crashActive) return;
    state.crashProcessing = true;
    el.crashActionButton.disabled = true;

    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.crashWagerInput.value)) || 100);
    const autoCashout = state.crashAutoCashout;

    if (state.balance < wager) {
      setCrashHud('Error', `Insufficient balance! You have ${state.balance.toLocaleString()} 🪙.`, 'lost');
      state.crashProcessing = false;
      el.crashActionButton.disabled = false;
      return;
    }

    state.crashRoundId++;
    const currentFlightRound = state.crashRoundId;

    try {
      const res = await api('/crash/start', 'POST', { wager, autoCashout });
      if (state.crashRoundId !== currentFlightRound) return;

      state.crashFlightId = res.flightId;
      state.crashWager = res.wager;
      state.crashActive = true;
      state.crashCrashed = false;
      state.crashCashedOut = false;
      state.crashStartTime = res.startTime || Date.now();
      state.crashCurrentMult = 1.0;

      updateBalanceDisplay(res.balance);
      enterActiveCrashFlightState();
      Sound.startThruster();

      // Launch Synchronous Backend Monitor
      monitorFlightDetonation(res.flightId, currentFlightRound);
    } catch (err) {
      setCrashHud('Error', err.message, 'lost');
      resetCrashToIdleState();
    } finally {
      state.crashProcessing = false;
      el.crashActionButton.disabled = false;
    }
  }

  async function monitorFlightDetonation(flightId, flightRound) {
    try {
      const res = await api('/crash/monitor', 'POST', { flightId });
      if (state.crashRoundId !== flightRound) return;

      if (res.crashed && !state.crashCashedOut) {
        handleFlightDetonated(res.crashPoint || state.crashCurrentMult);
      }
    } catch (err) {
      console.warn('[Crash Monitor Error]', err.message);
    }
  }

  async function cashOutCrash() {
    if (!state.crashActive || state.crashCrashed || state.crashCashedOut || state.crashProcessing) return;
    state.crashProcessing = true;
    el.crashActionButton.disabled = true;
    Sound.click();

    const currentFlightRound = state.crashRoundId;

    try {
      const res = await api('/crash/cashout', 'POST', { flightId: state.crashFlightId });
      if (state.crashRoundId !== currentFlightRound) return;

      if (res.crashed) {
        handleFlightDetonated(res.crashPoint);
        return;
      }

      state.crashActive = false;
      state.crashCashedOut = true;
      state.crashCurrentMult = res.multiplier;

      updateBalanceDisplay(res.balance, true);
      Sound.stopThruster();
      Sound.cashout();
      spawnCoinShower();

      // Update Center Readout
      el.crashLiveMult.textContent = `${res.multiplier.toFixed(2)}×`;
      el.crashLiveMult.className = 'crash-live-mult mult-cashed';
      el.crashLiveStatus.textContent = 'CASHED OUT';

      showCrashVictory('FLIGHT CASHOUT', res.multiplier, res.profit);
      setCrashHud('Cashed Out', `Locked in +${res.winAmount.toLocaleString()} 🪙 at ${res.multiplier.toFixed(2)}×!`, 'won');

      // Update CTA
      el.crashActionButton.className = 'btn-stake-cta btn-replay';
      el.crashActionTitle.textContent = 'Fly Again';
      el.crashActionSub.textContent = `${Number(state.crashWager).toLocaleString()} 🪙`;

      refreshProfile();
      loadLeaderboard();
    } catch (err) {
      setCrashHud('Error', err.message, 'lost');
    } finally {
      state.crashProcessing = false;
      el.crashActionButton.disabled = false;
    }
  }

  function handleFlightDetonated(crashMult) {
    state.crashActive = false;
    state.crashCrashed = true;
    state.crashCurrentMult = crashMult;

    Sound.stopThruster();

    // Trigger Visual Detonation Blast on Canvas
    if (crashCanvas) {
      const dpr = window.devicePixelRatio || 1;
      const w = crashCanvas.width / dpr;
      const h = crashCanvas.height / dpr;
      triggerCrashSupernova(w * 0.75, h * 0.35);
    }

    // Center Readout Detonated State
    el.crashLiveMult.textContent = `${crashMult.toFixed(2)}×`;
    el.crashLiveMult.className = 'crash-live-mult mult-crashed';
    el.crashLiveStatus.textContent = 'FLEW AWAY';

    setCrashHud('Crashed', `Detonation at ${crashMult.toFixed(2)}×! Lost ${state.crashWager.toLocaleString()} 🪙.`, 'lost');
    resetCrashToIdleState();
    refreshProfile();
    loadLeaderboard();
  }

  function updateActiveFlightLoop() {
    if (!state.crashActive || !state.crashStartTime) return;

    const elapsed = Math.max(0, Date.now() - state.crashStartTime);
    const liveMult = Math.max(1.0, Math.exp(0.00006 * elapsed));
    state.crashCurrentMult = liveMult;

    // Update Center Readout
    el.crashLiveMult.textContent = `${liveMult.toFixed(2)}×`;

    if (liveMult >= 50.0) {
      el.crashLiveMult.className = 'crash-live-mult mult-purple';
    } else if (liveMult >= 10.0) {
      el.crashLiveMult.className = 'crash-live-mult mult-gold';
    } else {
      el.crashLiveMult.className = 'crash-live-mult';
    }
    el.crashLiveStatus.textContent = 'IN FLIGHT';

    // Update Live Cashout Winnings on CTA
    const livePayout = Math.floor(state.crashWager * liveMult);
    const liveProfit = livePayout - state.crashWager;
    el.crashActionSub.textContent = `+${livePayout.toLocaleString()} 🪙`;

    el.crashHudMultVal.textContent = `${liveMult.toFixed(2)}×`;
    el.crashHudProfitVal.textContent = `+${liveProfit.toLocaleString()} 🪙`;

    // Sound Thruster Modulation
    Sound.updateThruster(liveMult);
    updateCrashTelemetry();

    // Auto-Cashout Trigger Check
    if (state.crashAutoCashout && liveMult >= state.crashAutoCashout && !state.crashCashedOut && !state.crashCrashed) {
      cashOutCrash();
    }
  }

  // 60FPS Flight Metric Ticker
  setInterval(() => {
    if (state.crashActive) {
      updateActiveFlightLoop();
    }
  }, 16);

  function enterActiveCrashFlightState() {
    el.crashWagerInput.disabled = true;
    el.crashAutoCashoutInput.disabled = true;

    el.crashActionButton.className = 'btn-stake-cta btn-cashout';
    el.crashActionTitle.textContent = 'Cashout';
    el.crashActionSub.textContent = `${Number(state.crashWager).toLocaleString()} 🪙`;

    el.crashHudProfitBox.style.display = 'flex';
    el.crashHudMultVal.textContent = '1.00×';
    el.crashHudProfitVal.textContent = '+0 🪙';
    setCrashHud('Active', 'Flight underway! Lock in your multiplier before detonation.', 'active');
  }

  function resetCrashToIdleState() {
    el.crashWagerInput.disabled = false;
    el.crashAutoCashoutInput.disabled = false;

    el.crashActionButton.className = 'btn-stake-cta btn-bet';
    el.crashActionTitle.textContent = 'Launch Flight';
    el.crashActionSub.textContent = `${Number(state.crashWager).toLocaleString()} 🪙`;

    el.crashHudProfitBox.style.display = 'none';
    updateCrashTelemetry();

    el.crashActionButton.disabled = true;
    setTimeout(() => {
      el.crashActionButton.disabled = false;
    }, 350);
  }

  function setCrashHud(badge, msg, type = 'ready') {
    if (!el.crashHudBadge || !el.crashHudMessage) return;
    el.crashHudBadge.textContent = badge;
    el.crashHudBadge.className = `hud-badge ${type}`;
    el.crashHudMessage.innerHTML = msg;
  }

  function showCrashVictory(badge, mult, profit) {
    el.crashModalBadge.textContent = badge;
    el.crashModalMult.textContent = `${Number(mult).toFixed(2)}×`;
    el.crashModalWinAmount.textContent = `+${Number(profit).toLocaleString()} 🪙`;
    el.crashVictoryModal.classList.add('active');
  }

  function hideCrashVictory() {
    el.crashVictoryModal.classList.remove('active');
  }

  // =========================================================================
  // 10. DUAL LEADERBOARD & HALL OF FAME RENDERER
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
    } catch (err) {
      console.warn('[Leaderboard Load Error]', err.message);
    }
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
      // Combined highest payouts
      const merged = [...(mData.topPayouts || []), ...(cData.topPayouts || [])];
      merged.sort((a, b) => Number(b.payout) - Number(a.payout));
      list = merged.slice(0, 15);
    } else if (category === 'players') {
      // Top Players
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

    // Players Table Format
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
                <img class="lb-avatar" src="${p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar">
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

    // Games Table Format
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
              <img class="lb-avatar" src="${w.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png'}" alt="Avatar">
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
  // 11. GLOBAL GAME SWITCHER
  // =========================================================================

  function switchGame(targetGame, playSound = false) {
    if (playSound) Sound.click();
    state.currentGame = targetGame;

    // Update Top Navigation Switcher Pills
    if (el.btnSwitchMines) el.btnSwitchMines.classList.toggle('active', targetGame === 'mines');
    if (el.btnSwitchCrash) el.btnSwitchCrash.classList.toggle('active', targetGame === 'crash');

    // Toggle Chassis Containers
    if (targetGame === 'crash') {
      if (el.minesChassis) el.minesChassis.style.display = 'none';
      if (el.crashChassis) el.crashChassis.style.display = 'grid';
      resizeCrashCanvas();
      updateCrashTelemetry();
    } else {
      if (el.minesChassis) el.minesChassis.style.display = 'grid';
      if (el.crashChassis) el.crashChassis.style.display = 'none';
      resizeMinesCanvas();
      updateMinesTelemetry();
    }

    renderHistoryRibbon();

    // Sync URL query without reloading
    try {
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('game', targetGame);
      window.history.replaceState({}, '', newUrl.toString());
    } catch {}
  }

  // =========================================================================
  // 12. INITIALIZATION & RECOVERY
  // =========================================================================

  async function refreshProfile() {
    try {
      const data = await api('/profile');
      state.authenticated = data.authenticated;
      state.userId = data.userId;
      state.username = data.username || 'Guest';
      state.avatarUrl = data.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

      if (el.userName) el.userName.textContent = state.username;
      if (el.userAvatar && data.avatarUrl) el.userAvatar.src = data.avatarUrl;
      updateBalanceDisplay(data.balance);

      if (Array.isArray(data.history)) state.minesHistory = data.history;
      if (Array.isArray(data.crashHistory)) state.crashHistory = data.crashHistory;
      renderHistoryRibbon();

      // Restore active Mines game if present
      if (data.activeGame) {
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

      // Restore active Crash flight if present
      if (data.activeCrash) {
        state.crashFlightId = data.activeCrash.flightId;
        state.crashWager = data.activeCrash.wager;
        state.crashAutoCashout = data.activeCrash.autoCashout;
        state.crashStartTime = data.activeCrash.startTime;
        state.crashActive = true;
        state.crashCrashed = false;
        state.crashCashedOut = false;

        if (el.crashWagerInput) el.crashWagerInput.value = state.crashWager;
        if (el.crashAutoCashoutInput && state.crashAutoCashout) {
          el.crashAutoCashoutInput.value = state.crashAutoCashout;
        }

        switchGame('crash');
        enterActiveCrashFlightState();
        Sound.startThruster();
        monitorFlightDetonation(state.crashFlightId, state.crashRoundId);
      }
    } catch (err) {
      console.warn('[Profile Error]', err.message);
    }
  }

  // =========================================================================
  // 13. EVENT LISTENERS
  // =========================================================================

  // Top Game Switcher
  if (el.btnSwitchMines) el.btnSwitchMines.addEventListener('click', () => switchGame('mines', true));
  if (el.btnSwitchCrash) el.btnSwitchCrash.addEventListener('click', () => switchGame('crash', true));

  // Mines Primary Action Button
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

  // Crash Primary Action Button
  if (el.crashActionButton) {
    el.crashActionButton.addEventListener('click', () => {
      if (state.crashActive) {
        cashOutCrash();
      } else {
        hideCrashVictory();
        startCrashFlight();
      }
    });
  }

  if (el.btnCrashModalAgain) {
    el.btnCrashModalAgain.addEventListener('click', () => {
      hideCrashVictory();
      startCrashFlight();
    });
  }

  if (el.btnCrashModalClose) {
    el.btnCrashModalClose.addEventListener('click', hideCrashVictory);
  }

  // Sound Toggle
  if (el.soundBtn) {
    el.soundBtn.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem('moonflip_sound_muted', (!state.soundEnabled).toString());
      if (el.soundSvgOn) el.soundSvgOn.style.display = state.soundEnabled ? 'block' : 'none';
      if (el.soundSvgOff) el.soundSvgOff.style.display = state.soundEnabled ? 'none' : 'block';
      if (state.soundEnabled) Sound.click();
    });
  }

  // Mines Quick Chips
  el.quickChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Sound.click();
      el.wagerInput.value = chip.dataset.val;
      state.wager = Number(chip.dataset.val);
      updateMinesTelemetry();
    });
  });

  // Mines Math Buttons (1/2, 2x, MAX)
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

  // Mines Count Select & Segmented Pills
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

  // Crash Quick Chips
  el.crashChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      Sound.click();
      if (el.crashWagerInput) el.crashWagerInput.value = chip.dataset.val;
      state.crashWager = Number(chip.dataset.val);
      updateCrashTelemetry();
    });
  });

  // Crash Math Buttons (1/2, 2x, MAX)
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

  // Crash Auto Cashout Target Pills & Input
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
        p.classList.toggle('active', state.crashAutoCashout && Number(p.dataset.target) === state.crashAutoCashout);
      });
      updateCrashTelemetry();
    });
  }

  // Leaderboard Modal Events
  if (el.btnOpenLeaderboard) el.btnOpenLeaderboard.addEventListener('click', openLeaderboard);
  if (el.btnCloseLeaderboard) el.btnCloseLeaderboard.addEventListener('click', closeLeaderboard);
  if (el.btnDoneLeaderboard) el.btnDoneLeaderboard.addEventListener('click', closeLeaderboard);

  // Modal Category Tabs
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

  // Inline Stage Category Tabs
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

  // Provably Fair Modal
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
  // 14. BOOTSTRAP
  // =========================================================================

  buildGrid();
  updateMinesTelemetry();
  updateCrashTelemetry();
  resizeMinesCanvas();
  resizeCrashCanvas();

  // Start 60FPS Crash Canvas Loop
  renderCrashCanvas();

  // Switch to selected game
  switchGame(state.currentGame);

  // Load user data and Hall of Fame
  refreshProfile();
  loadLeaderboard();

  if (!state.soundEnabled) {
    if (el.soundSvgOn) el.soundSvgOn.style.display = 'none';
    if (el.soundSvgOff) el.soundSvgOff.style.display = 'block';
  }
})();
