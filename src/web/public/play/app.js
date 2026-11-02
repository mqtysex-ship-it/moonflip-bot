/**
 * MOONFLIP — DISCORD-POWERED MINIGAMES (v4.0)
 * Home Hub, 5x5 Mines & Continuous Crash Engine
 * Mint-Neon Theme • Zero Clock-Skew 60FPS Canvas • Strict Countdown-Only Crash Betting
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

  const initialGameParam = urlParams.get('game');
  const initialView = (initialGameParam === 'coinflip' || initialGameParam === 'plinko' || initialGameParam === 'mines' || initialGameParam === 'crash' || initialGameParam === 'all-games' || initialGameParam === 'games')
    ? (initialGameParam === 'games' ? 'all-games' : initialGameParam)
    : 'home';

  const state = {
    // Global Navigation & Player State
    currentView: initialView, // 'home' | 'all-games' | 'mines' | 'crash'
    currentGame: initialGameParam === 'crash' ? 'crash' : 'mines',
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
    lastAllBombs: [],
    isProcessing: false,
    gameId: null,
    roundId: 0,
    pendingTimeouts: [],

    // Continuous 24/7 Crash State (Clock-Skew Immune)
    crashMode: 'manual', // 'manual' | 'auto'
    crashAutoBetActive: false,
    crashAutoBetLastRound: 0,
    crashWager: 100,
    crashAutoCashout: 2.0,
    crashPhase: 'BETTING', // 'BETTING' | 'IN_FLIGHT' | 'CRASHED'
    crashRoundNumber: 1042,
    crashBettingDurationMs: 6000,
    crashBaseElapsedMs: 0,
    crashBaseRemainingMs: 6000,
    crashSyncPerfNow: performance.now(),
    crashCurrentMult: 1.0,
    crashPoint: null,
    crashPlayers: [],
    crashMyBet: null,
    crashProcessing: false,
    crashLastCelebratedRound: 0,
    crashLastExplodedRound: 0,
    crashEjectMarkers: [],

    // Leaderboard & Activity State
    instantActivity: [],
    minesLeaderboard: null,
    crashLeaderboard: null,
    activeModalTab: 'mines-multipliers',
    activeStageTab: 'recent',
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

  let instantGamesUi = null;
  let rewardsUi = null;
  let audioCtx = null;
  let thrusterState = null;

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
    // Interface navigation and controls are intentionally silent.
    click() {},

    // Musical gem chime with progressive streak pitch
    gem(streak = 1) {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98, 1760.0];
        const freq = scale[Math.min(streak - 1, scale.length - 1)];

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, ctx.currentTime);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, ctx.currentTime);

        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.4);
        osc2.stop(ctx.currentTime + 0.4);
      } catch {}
    },

    // Soft sub boom for bomb detonation
    bomb() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(115, ctx.currentTime);
        sub.frequency.exponentialRampToValueAtTime(26, ctx.currentTime + 0.5);

        subGain.gain.setValueAtTime(0.32, ctx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start();
        sub.stop(ctx.currentTime + 0.5);
      } catch {}
    },

    // CRASH: Studio-Grade Sci-Fi Riser (Warm sub foundation + lush detuned fifths + smooth filter)
    startThruster() {
      if (!state.soundEnabled || state.currentView !== 'crash' || document.hidden) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      this.stopThruster();

      try {
        // Sub-harmonic warm fundamental (55Hz / A1)
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(55, ctx.currentTime);
        subGain.gain.setValueAtTime(0.022, ctx.currentTime);

        // Lush choral fifths (110Hz + 165Hz) detuned slightly for warm analog chorus
        const oscA = ctx.createOscillator();
        const oscB = ctx.createOscillator();
        oscA.type = 'triangle';
        oscB.type = 'sine';
        oscA.frequency.setValueAtTime(110, ctx.currentTime);
        oscB.frequency.setValueAtTime(164.8, ctx.currentTime);

        // Low-pass filter with silky resonance
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, ctx.currentTime);
        filter.Q.setValueAtTime(1.8, ctx.currentTime);

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
        masterGain.gain.linearRampToValueAtTime(0.038, ctx.currentTime + 0.35);

        subOsc.connect(subGain);
        subGain.connect(masterGain);

        oscA.connect(filter);
        oscB.connect(filter);
        filter.connect(masterGain);

        masterGain.connect(ctx.destination);

        subOsc.start();
        oscA.start();
        oscB.start();

        thrusterState = {
          ctx,
          subOsc,
          subGain,
          oscA,
          oscB,
          filter,
          masterGain,
          lastHeartbeat: 0,
          lastMilestone: 1.0,
        };
      } catch (err) {
        console.warn('Thruster sound init exception:', err);
      }
    },

    updateThruster(mult) {
      if (!state.soundEnabled || !thrusterState || state.currentView !== 'crash') return;
      try {
        const { ctx, subOsc, oscA, oscB, filter, masterGain } = thrusterState;
        const now = ctx.currentTime;
        const clampedMult = Math.max(1, mult);
        const logMult = Math.log(clampedMult);

        // Smooth musical rise through overtones
        const baseFreq = 55 + Math.min(200, logMult * 42);
        subOsc.frequency.setTargetAtTime(baseFreq, now, 0.08);
        oscA.frequency.setTargetAtTime(baseFreq * 2, now, 0.08);
        oscB.frequency.setTargetAtTime(baseFreq * 3, now, 0.08);

        // Smooth filter sweep from 200Hz to 800Hz
        const targetFilter = Math.min(800, 200 + logMult * 150);
        filter.frequency.setTargetAtTime(targetFilter, now, 0.08);

        // Subtle dynamic volume swell for anticipation
        const targetVol = Math.min(0.058, 0.035 + logMult * 0.007);
        masterGain.gain.setTargetAtTime(targetVol, now, 0.09);

        // Dopamine Milestone Dings: 1.5x, 2x, 3x, 5x, 10x, 20x, 50x, 100x
        const milestones = [1.5, 2.0, 3.0, 5.0, 10.0, 20.0, 50.0, 100.0, 250.0, 500.0];
        for (const m of milestones) {
          if (clampedMult >= m && thrusterState.lastMilestone < m) {
            thrusterState.lastMilestone = m;
            this.milestoneDing(m);
            break;
          }
        }

        // Sub-bass Dopamine Heartbeat pulses accelerating with multiplier
        const pulseInterval = Math.max(0.3, 0.88 - Math.min(0.58, logMult * 0.17));
        if (now - thrusterState.lastHeartbeat >= pulseInterval) {
          thrusterState.lastHeartbeat = now;
          this.heartbeatThump(clampedMult);
        }
      } catch {}
    },

    stopThruster() {
      if (thrusterState) {
        try {
          const { subOsc, oscA, oscB, masterGain, ctx } = thrusterState;
          if (masterGain && ctx) {
            masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
          }
          setTimeout(() => {
            try { subOsc.stop(); } catch {}
            try { oscA.stop(); } catch {}
            try { oscB.stop(); } catch {}
          }, 140);
        } catch {}
        thrusterState = null;
      }
    },

    // Suspense-building deep sub kick
    heartbeatThump(mult) {
      if (!state.soundEnabled || state.currentView !== 'crash') return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(25, ctx.currentTime + 0.08);

        const thumpVol = Math.min(0.065, 0.03 + Math.log(Math.max(1, mult)) * 0.01);
        gain.gain.setValueAtTime(thumpVol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } catch {}
    },

    // Sparkling Crystal Glass Ding on Multiplier Milestones
    milestoneDing(m) {
      if (!state.soundEnabled || state.currentView !== 'crash') return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const root = m >= 10 ? 1760 : 1318.51;
        [root, root * 1.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime);

          gain.gain.setValueAtTime(0.11 / (i + 1), ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);

          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + 0.42);
        });
      } catch {}
    },

    // High-Dopamine CASHOUT — Double Metallic Snap + Cascading Golden Arpeggio + Warm Sub Bloom
    cashout() {
      if (!state.soundEnabled) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        // 1. Tactile metallic register snap ("Ka-Ching!")
        [0, 0.032].forEach((delay, idx) => {
          const snapOsc = ctx.createOscillator();
          const snapFilter = ctx.createBiquadFilter();
          const snapGain = ctx.createGain();

          snapOsc.type = 'triangle';
          snapOsc.frequency.setValueAtTime(idx === 0 ? 3200 : 4800, ctx.currentTime + delay);
          snapFilter.type = 'bandpass';
          snapFilter.frequency.setValueAtTime(3600, ctx.currentTime + delay);
          snapFilter.Q.setValueAtTime(4.0, ctx.currentTime + delay);

          snapGain.gain.setValueAtTime(0.14, ctx.currentTime + delay);
          snapGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + 0.055);

          snapOsc.connect(snapFilter);
          snapFilter.connect(snapGain);
          snapGain.connect(ctx.destination);
          snapOsc.start(ctx.currentTime + delay);
          snapOsc.stop(ctx.currentTime + delay + 0.055);
        });

        // 2. Cascading Golden Arpeggio (E major celestial run)
        const notes = [659.25, 830.61, 987.77, 1318.51, 1661.22, 1975.53];
        notes.forEach((freq, i) => {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          const t = ctx.currentTime + i * 0.042;
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(freq, t);

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(freq * 2, t);

          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.setValueAtTime(0.13, t);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(ctx.destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.5);
          osc2.stop(t + 0.5);
        });

        // 3. Warm Bass Affirmation
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(98, ctx.currentTime);
        sub.frequency.exponentialRampToValueAtTime(44, ctx.currentTime + 0.35);

        subGain.gain.setValueAtTime(0.18, ctx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);

        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start();
        sub.stop(ctx.currentTime + 0.35);
      } catch {}
    },

    // Cinematic Supernova Implosion (Deep 808 sub-drop + soft pink noise dispersion)
    crashExplosion() {
      this.stopThruster();
      if (!state.soundEnabled || state.currentView !== 'crash' || document.hidden) return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;

      try {
        // 1. Deep 808 Sub-Drop
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(90, ctx.currentTime);
        sub.frequency.exponentialRampToValueAtTime(22, ctx.currentTime + 0.65);

        subGain.gain.setValueAtTime(0.32, ctx.currentTime);
        subGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);

        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start();
        sub.stop(ctx.currentTime + 0.65);

        // 2. Velvet Air Dispersion
        const bufferSize = Math.floor(ctx.sampleRate * 0.42);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          lastOut = (lastOut + (0.04 * white)) / 1.04;
          data[i] = lastOut * 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(360, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.42);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, ctx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start();
      } catch {}
    },

    // Soft futuristic countdown blip on 3, 2, 1
    countdownTick(count) {
      if (!state.soundEnabled || state.currentView !== 'crash') return;
      const ctx = getAudioContext();
      if (!ctx || ctx.state !== 'running') return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const freq = count === 1 ? 1320 : 880;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const dur = count === 1 ? 0.08 : 0.045;
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + dur);
      } catch {}
    }
  };

  // =========================================================================
  // 3. BESPOKE 3D VECTOR GRAPHICS (Mint-Emerald Gems & Naval Mines)
  // =========================================================================

  const SVG_GEM = `
    <svg class="diamond-3d-svg" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="gemInnerGlow" cx="50%" cy="40%" r="50%">
          <stop offset="0%" stop-color="#2ef2b8" stop-opacity="0.85"/>
          <stop offset="60%" stop-color="#10b981" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#047857" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="facetCenter" x1="50" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#2ef2b8"/>
          <stop offset="1" stop-color="#047857"/>
        </linearGradient>
        <linearGradient id="facetLeft" x1="16" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#10b981"/>
          <stop offset="1" stop-color="#064e3b"/>
        </linearGradient>
        <linearGradient id="facetRight" x1="84" y1="42" x2="50" y2="88" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6ee7b7"/>
          <stop offset="1" stop-color="#059669"/>
        </linearGradient>
        <linearGradient id="facetCrown" x1="50" y1="16" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop stop-color="#d1fae5"/>
          <stop offset="1" stop-color="#2ef2b8"/>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill="url(#gemInnerGlow)"/>
      <polygon points="50,88 32,42 68,42" fill="url(#facetCenter)"/>
      <polygon points="14,42 32,42 50,88" fill="url(#facetLeft)"/>
      <polygon points="86,42 68,42 50,88" fill="url(#facetRight)"/>
      <polygon points="34,16 66,16 68,42 32,42" fill="url(#facetCrown)"/>
      <polygon points="20,24 34,16 32,42 14,42" fill="#34d399"/>
      <polygon points="80,24 66,16 68,42 86,42" fill="#a7f3d0"/>
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
          <stop offset="0%" stop-color="#ff4757"/>
          <stop offset="70%" stop-color="#b91c1c"/>
          <stop offset="100%" stop-color="#450a0a"/>
        </radialGradient>
        <linearGradient id="spikeMetal" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="#ff4757"/>
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
      <circle cx="50" cy="50" r="13" fill="url(#sensorGlow)" stroke="#ff4757" stroke-width="1.5"/>
      <path d="M50 43v14M43 50h14" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
  `;

  const SVG_COIN_INLINE = `<img src="/play/assets/token.png?v=5.0" alt="Token" class="mf-token-img">`;

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
    const colors = ['#ff4757', '#ff6b81', '#fbbf24', '#ffffff', '#450a0a'];
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
    const colors = ['#2ef2b8', '#10b981', '#6ee7b7', '#ffffff'];
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
    const colors = ['#2ef2b8', '#10b981', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 65; i++) {
      particles.push({
        x: Math.random() * (minesCanvas.width || 600),
        y: (minesCanvas.height || 500) * 0.8,
        vx: (Math.random() - 0.5) * 8,
        vy: -6 - Math.random() * 8,
        radius: 4 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.015 + Math.random() * 0.014,
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
  // 5. ZERO-LAG 60FPS CRASH CANVAS ENGINE (MOONFLIP MINT THEME)
  // =========================================================================

  const crashCanvas = document.getElementById('crashCanvas');
  const cCtx = crashCanvas ? crashCanvas.getContext('2d', { alpha: false }) : null;

  let crashAnimId = null;
  let cachedCrashWidth = 800;
  let cachedCrashHeight = 500;
  let cachedCrashDpr = 1;
  let cachedBgGradient = null;

  let crashStars = [];
  let crashFlameParticles = [];
  let crashExplosionParticles = [];
  let crashShockwave = null;
  let crashShakeFrames = 0;
  let crashShakeMagnitude = 0;
  let lastRocketTip = { x: 400, y: 250 };

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
    for (let i = 0; i < 60; i++) {
      crashStars.push({
        x: Math.random(),
        y: Math.random(),
        r: 0.6 + Math.random() * 1.3,
        baseAlpha: 0.15 + Math.random() * 0.5,
        twinkleSpeed: 0.002 + Math.random() * 0.004,
        twinkleOffset: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.6,
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
    cachedBgGradient.addColorStop(0, '#0c181d');
    cachedBgGradient.addColorStop(0.6, '#081016');
    cachedBgGradient.addColorStop(1, '#060a0e');
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
    } else if (state.currentView === 'crash') {
      startCrashCanvasLoop();
      fetchCrashState();
    }
  });

  function triggerCrashSupernova(x, y) {
    crashExplosionParticles = [];
    const colors = ['#ff4757', '#ff7f50', '#fbbf24', '#ffffff'];
    for (let i = 0; i < 60; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
      crashExplosionParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2.5 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        decay: 0.018 + Math.random() * 0.02,
      });
    }

    crashShockwave = { x, y, radius: 10, alpha: 1 };
    crashShakeFrames = 18;
    crashShakeMagnitude = 10;
    Sound.crashExplosion();
  }

  function updateDomTextIfChanged(element, cacheKey, newText) {
    if (!element || domCache[cacheKey] === newText) return;
    domCache[cacheKey] = newText;
    element.textContent = newText;
  }

  function renderCrashCanvas() {
    if (state.currentView !== 'crash' || document.hidden) {
      crashAnimId = null;
      return;
    }
    if (!crashCanvas || !cCtx) return;

    const perfDelta = Math.max(0, performance.now() - state.crashSyncPerfNow);
    const w = cachedCrashWidth;
    const h = cachedCrashHeight;
    const dpr = cachedCrashDpr;

    // -----------------------------------------------------------------------
    // A. CLOCK-SKEW IMMUNE 60FPS INTERPOLATION
    // -----------------------------------------------------------------------
    let elapsed = 0;

    if (state.crashPhase === 'BETTING') {
      const remainingMs = Math.max(0, state.crashBaseRemainingMs - perfDelta);
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
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', 'BETTING OPEN • NEXT FLIGHT IN');

      const secCeil = Math.ceil(remainingMs / 1000);
      if (secCeil <= 3 && secCeil >= 1 && domCache.lastCountdownTick !== secCeil) {
        domCache.lastCountdownTick = secCeil;
        Sound.countdownTick(secCeil);
      }
    } else if (state.crashPhase === 'IN_FLIGHT') {
      domCache.lastCountdownTick = 0;
      if (el.crashCountdownWrap && el.crashCountdownWrap.style.display !== 'none') {
        el.crashCountdownWrap.style.display = 'none';
      }

      elapsed = Math.max(0, state.crashBaseElapsedMs + perfDelta);
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
        ? `CASHED OUT @ ${Number(state.crashMyBet.cashoutMult).toFixed(2)}×`
        : (state.crashMyBet ? 'FLIGHT IN PROGRESS • CLICK CASHOUT' : 'FLIGHT IN PROGRESS • BETTING LOCKED');
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', statusTxt);

      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        const livePayout = Math.floor(state.crashMyBet.wager * liveMult);
        updateDomTextIfChanged(el.crashActionSub, 'actionSubText', `+${livePayout.toLocaleString()} (${multFormatted})`);
        updateDomTextIfChanged(el.crashHudMultVal, 'hudMultText', multFormatted);
        updateDomTextIfChanged(el.crashHudProfitVal, 'hudProfitText', `+${livePayout.toLocaleString()}`);

        if (el.crashActionButton && (el.crashActionButton.disabled || !el.crashActionButton.classList.contains('btn-cashout'))) {
          el.crashActionButton.disabled = false;
          el.crashActionButton.className = 'btn-stake-cta btn-cashout';
          el.crashActionTitle.textContent = 'Cash Out';
        }
      }

      let zone = 'ASCENDING';
      let zoneClass = 'tele-val text-mint';
      if (liveMult >= 50.0) {
        zone = 'HYPERWARP';
        zoneClass = 'tele-val text-purple';
      } else if (liveMult >= 10.0) {
        zone = 'DEEP ORBIT';
        zoneClass = 'tele-val text-gold';
      } else if (liveMult >= 2.0) {
        zone = 'SUPERSONIC';
        zoneClass = 'tele-val text-mint';
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
      elapsed = Math.max(0, Math.log(Math.max(1, finalMult)) / 0.00006);
      updateDomTextIfChanged(el.crashLiveMult, 'liveMultText', `${finalMult.toFixed(2)}×`);
      if (domCache.liveMultClass !== 'crash-live-mult mult-crashed') {
        domCache.liveMultClass = 'crash-live-mult mult-crashed';
        if (el.crashLiveMult) el.crashLiveMult.className = domCache.liveMultClass;
      }
      updateDomTextIfChanged(el.crashLiveStatus, 'liveStatusText', 'CRASHED • NEXT COUNTDOWN STARTING');
    }

    // -----------------------------------------------------------------------
    // B. HIGH-SPEED CANVAS SCENE RENDERING
    // -----------------------------------------------------------------------
    cCtx.save();
    cCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (crashShakeFrames > 0) {
      const ox = (Math.random() - 0.5) * crashShakeMagnitude;
      const oy = (Math.random() - 0.5) * crashShakeMagnitude;
      cCtx.translate(ox, oy);
      crashShakeFrames--;
      crashShakeMagnitude *= 0.9;
    }

    cCtx.fillStyle = cachedBgGradient || '#070b10';
    cCtx.fillRect(0, 0, w, h);

    // Subtle Starfield
    const isFlying = state.crashPhase === 'IN_FLIGHT';
    const warpFactor = isFlying ? Math.min(7, 1 + (state.crashCurrentMult - 1) * 0.3) : 0.3;
    const now = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : performance.now();

    cCtx.fillStyle = '#ffffff';
    for (let i = 0; i < crashStars.length; i++) {
      const s = crashStars[i];
      s.x -= s.speed * 0.0007 * warpFactor;
      if (isFlying) s.y += s.speed * 0.0003 * warpFactor;
      if (s.x < 0) s.x = 1.0;
      if (s.y > 1) s.y = 0;

      const tw = Math.sin(now * s.twinkleSpeed + s.twinkleOffset);
      cCtx.globalAlpha = Math.max(0.1, Math.min(0.23, s.baseAlpha * 0.3 + tw * 0.03));
      cCtx.beginPath();
      cCtx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      cCtx.fill();
    }
    cCtx.globalAlpha = 1;

    const padL = 56;
    const padR = 52;
    const padT = 46;
    const padB = 48;
    const uw = w - padL - padR;
    const uh = h - padT - padB;
    const ox = padL;
    const oy = h - padB;

    const currentMult = state.crashCurrentMult || 1.0;
    const maxPlotMult = Math.max(2.0, currentMult * 1.24);
    const maxPlotTime = Math.max(5500, elapsed * 1.22);

    // Reference Grid Lines
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

      cCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      cCtx.beginPath();
      cCtx.moveTo(ox, yPos);
      cCtx.lineTo(ox + uw, yPos);
      cCtx.stroke();

      cCtx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      cCtx.fillText(`${lvl >= 10 ? lvl.toFixed(0) : lvl.toFixed(1)}×`, ox - 10, yPos + 4);
    }

    // Axes
    cCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    cCtx.lineWidth = 1.5;
    cCtx.beginPath();
    cCtx.moveTo(ox, padT);
    cCtx.lineTo(ox, oy);
    cCtx.lineTo(ox + uw, oy);
    cCtx.stroke();

    // BETTING PHASE: Pre-Launch Radar & Idle Spacecraft
    if (state.crashPhase === 'BETTING') {
      const hoverY = oy - 22 + Math.sin(now * 0.007) * 3;
      lastRocketTip = { x: ox + 36, y: hoverY };
      drawRocket(cCtx, ox + 36, hoverY, -0.18, true, false, 1.0);
    }

    // IN_FLIGHT / CRASHED PHASE: Mint-Neon Exponential Curve
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
        let strokeColor = '#2ef2b8';
        let glowColor = 'rgba(46, 242, 184, 0.25)';
        let fillColorTop = 'rgba(46, 242, 184, 0.20)';

        if (currentMult >= 50.0) {
          strokeColor = '#c084fc';
          glowColor = 'rgba(192, 132, 252, 0.28)';
          fillColorTop = 'rgba(192, 132, 252, 0.20)';
        } else if (currentMult >= 10.0) {
          strokeColor = '#fbbf24';
          glowColor = 'rgba(251, 191, 36, 0.28)';
          fillColorTop = 'rgba(251, 191, 36, 0.20)';
        }

        if (state.crashPhase === 'CRASHED') {
          strokeColor = '#ff4757';
          glowColor = 'rgba(255, 71, 87, 0.25)';
          fillColorTop = 'rgba(255, 71, 87, 0.16)';
        }

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

        // Dual-Pass Neon Stroke
        cCtx.lineCap = 'round';
        cCtx.lineJoin = 'round';

        cCtx.strokeStyle = glowColor;
        cCtx.lineWidth = 10;
        cCtx.beginPath();
        cCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          cCtx.lineTo(points[i].x, points[i].y);
        }
        cCtx.stroke();

        cCtx.strokeStyle = strokeColor;
        cCtx.lineWidth = 3.2;
        cCtx.stroke();

        // Eject Markers Along Curve
        for (let i = 0; i < state.crashEjectMarkers.length; i++) {
          const m = state.crashEjectMarkers[i];
          if (m.mult <= currentMult) {
            const mTau = Math.log(Math.max(1, m.mult)) / 0.00006;
            const mx = ox + (mTau / maxPlotTime) * uw;
            const my = oy - ((m.mult - 1) / (maxPlotMult - 1)) * uh;

            cCtx.fillStyle = '#2ef2b8';
            cCtx.beginPath();
            cCtx.arc(mx, my, 4.5, 0, Math.PI * 2);
            cCtx.fill();

            cCtx.fillStyle = 'rgba(46, 242, 184, 0.9)';
            cCtx.font = '700 10px "JetBrains Mono", monospace';
            cCtx.textAlign = 'center';
            cCtx.fillText(`${m.mult.toFixed(2)}×`, mx, my - 9);
          }
        }

        const tip = points[points.length - 1];
        const prev = points[Math.max(0, points.length - 3)];
        const angle = Math.atan2(tip.y - prev.y, tip.x - prev.x);
        lastRocketTip = { x: tip.x, y: tip.y };

        if (state.crashPhase === 'IN_FLIGHT' && crashFlameParticles.length < 40 && Math.random() < 0.78) {
          crashFlameParticles.push({
            x: tip.x - Math.cos(angle) * 14,
            y: tip.y - Math.sin(angle) * 14,
            vx: -Math.cos(angle) * (2.2 + Math.random() * 3.5) + (Math.random() - 0.5) * 1.3,
            vy: -Math.sin(angle) * (2.2 + Math.random() * 3.5) + (Math.random() - 0.5) * 1.3,
            r: 2 + Math.random() * 2.6,
            color: Math.random() > 0.4 ? '#2ef2b8' : '#ffffff',
            alpha: 0.9,
            decay: 0.048 + Math.random() * 0.03,
          });
        }

        if (state.crashPhase !== 'CRASHED') {
          const isPlayerCashed = Boolean(state.crashMyBet && state.crashMyBet.cashedOut);
          drawRocket(cCtx, tip.x, tip.y, angle, true, isPlayerCashed, currentMult);
        }
      }
    }

    // Exhaust Particles
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

    // Detonation Shockwave
    if (crashShockwave && crashShockwave.alpha > 0) {
      cCtx.globalAlpha = crashShockwave.alpha;
      cCtx.strokeStyle = '#ff4757';
      cCtx.lineWidth = 3;
      cCtx.beginPath();
      cCtx.arc(crashShockwave.x, crashShockwave.y, crashShockwave.radius, 0, Math.PI * 2);
      cCtx.stroke();
      cCtx.globalAlpha = 1;

      crashShockwave.radius += 5.5;
      crashShockwave.alpha -= 0.035;
      if (crashShockwave.alpha <= 0) crashShockwave = null;
    }

    // Detonation Sparks
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

  function drawRocket(ctx, x, y, angle, hasThrust = true, isCashed = false) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const scale = cachedCrashWidth < 500 ? 1.25 : 1.8;
    ctx.scale(scale, scale);
    if (hasThrust) {
      const flicker = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.sin(performance.now() * 0.025) * 3;
      const flame = ctx.createLinearGradient(-15, 0, -43 - flicker, 0);
      flame.addColorStop(0, '#f7d998');
      flame.addColorStop(0.35, '#ef9050');
      flame.addColorStop(1, 'rgba(239,144,80,0)');
      ctx.fillStyle = flame;
      ctx.beginPath(); ctx.moveTo(-13,-5); ctx.quadraticCurveTo(-30,-5,-43-flicker,0); ctx.quadraticCurveTo(-30,5,-13,5); ctx.fill();
    }
    // Engine collar and swept fins sit behind the shaded fuselage.
    ctx.fillStyle = '#344b5c';
    ctx.fillRect(-19, -4, 6, 8);
    ctx.fillStyle = '#20b99b';
    ctx.beginPath(); ctx.moveTo(-7,-6); ctx.lineTo(-18,-13); ctx.lineTo(-15,-4); ctx.lineTo(-15,4); ctx.lineTo(-18,13); ctx.lineTo(-7,6); ctx.closePath(); ctx.fill();
    const hull = ctx.createLinearGradient(0,-9,0,9);
    hull.addColorStop(0,'#ffffff'); hull.addColorStop(0.55,'#dce8eb'); hull.addColorStop(1,'#8da4ac');
    ctx.fillStyle = hull;
    ctx.beginPath(); ctx.moveTo(22,0); ctx.quadraticCurveTo(10,-10,-10,-7); ctx.lineTo(-16,-5); ctx.lineTo(-16,5); ctx.lineTo(-10,7); ctx.quadraticCurveTo(10,10,22,0); ctx.fill();
    ctx.strokeStyle = '#849ca7';
    ctx.lineWidth = 0.65;
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-10, 6); ctx.stroke();
    ctx.fillStyle = '#20b99b';
    ctx.beginPath(); ctx.moveTo(22, 0); ctx.quadraticCurveTo(17, -4, 13, -5); ctx.lineTo(13, 5); ctx.quadraticCurveTo(17, 4, 22, 0); ctx.fill();
    ctx.fillStyle = isCashed ? '#2de8b4' : '#173f4b';
    ctx.beginPath(); ctx.arc(5,0,4,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#829eab'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = '#b4e9ed';
    ctx.beginPath(); ctx.arc(4, -1, 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#708996';
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-3, 0); ctx.lineTo(-17, 4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // =========================================================================
  // 6. DOM ELEMENTS MAP
  // =========================================================================

  const el = {
    // Topbar & Sidebar Navigation
    brandHomeLink: document.getElementById('brandHomeLink'),
    topNavGames: document.getElementById('topNavGames'),
    navHome: document.getElementById('navHome'),
    navAllGames: document.getElementById('navAllGames'),
    btnSwitchMines: document.getElementById('btnSwitchMines'),
    btnSwitchCrash: document.getElementById('btnSwitchCrash'),
    sidebarLeaderboard: document.getElementById('sidebarLeaderboard'),
    sidebarSupport: document.getElementById('sidebarSupport'),
    btnHeroPlayNow: document.getElementById('btnHeroPlayNow'),
    cardPlayMines: document.getElementById('cardPlayMines'),
    cardPlayCrash: document.getElementById('cardPlayCrash'),
    activeGameTopbar: document.getElementById('activeGameTopbar'),
    btnBackHome: document.getElementById('btnBackHome'),
    tabPlayMines: document.getElementById('tabPlayMines'),
    tabPlayCrash: document.getElementById('tabPlayCrash'),

    // Views
    homeChassis: document.getElementById('homeChassis'),
    gamesCatalogChassis: document.getElementById('gamesCatalogChassis'),
    minesChassis: document.getElementById('minesChassis'),
    crashChassis: document.getElementById('crashChassis'),

    // Catalog & Games Controls
    btnHomeViewAllGames: document.getElementById('btnHomeViewAllGames'),
    btnCatalogPlayMines: document.getElementById('btnCatalogPlayMines'),
    btnCatalogPlayCrash: document.getElementById('btnCatalogPlayCrash'),
    btnPlayMinesHome: document.getElementById('btnPlayMinesHome'),
    btnPlayCrashHome: document.getElementById('btnPlayCrashHome'),
    gamesSearchInput: document.getElementById('gamesSearchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    catalogFilterPills: document.querySelectorAll('.catalog-filter-pill'),
    catalogEmptySearch: document.getElementById('catalogEmptySearch'),

    // Game Info Modal
    gameInfoModal: document.getElementById('gameInfoModal'),
    btnCloseGameInfo: document.getElementById('btnCloseGameInfo'),
    btnDoneGameInfo: document.getElementById('btnDoneGameInfo'),
    btnCopyGameCmd: document.getElementById('btnCopyGameCmd'),
    gameInfoTitle: document.getElementById('gameInfoTitle'),
    gameInfoDesc: document.getElementById('gameInfoDesc'),
    gameInfoCmd: document.getElementById('gameInfoCmd'),
    gameInfoImg: document.getElementById('gameInfoImg'),
    gameInfoCategory: document.getElementById('gameInfoCategory'),
    gameInfoMaxWin: document.getElementById('gameInfoMaxWin'),

    // Profile, Balance & Sync
    balanceNumber: document.getElementById('balanceNumber'),
    auxBalance: document.getElementById('auxBalance'),
    userAvatar: document.getElementById('userAvatar'),
    userName: document.getElementById('userName'),
    discordSyncPill: document.getElementById('discordSyncPill'),
    syncDot: document.getElementById('discordSyncDot'),
    syncText: document.getElementById('discordSyncText'),
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

    // Crash Controls
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

    // Bottom Live Activity & Compact Leaderboard
    liveActivityBody: document.getElementById('liveActivityBody'),
    miniLeaderboardList: document.getElementById('miniLeaderboardList'),
    btnExpandLeaderboard: document.getElementById('btnExpandLeaderboard'),
    lbStageTabs: document.querySelectorAll('.lb-stage-tab'),

    // Modals
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
  };

  // =========================================================================
  // 7. TELEMETRY, WALLET & DISCORD SYNC STATUS UI
  // =========================================================================

  function updateDiscordSyncUI() {
    if (el.discordSyncPill && el.syncText) {
      if (state.authenticated) {
        el.discordSyncPill.className = 'sync-status-pill synced';
        el.discordSyncPill.title = `Connected to Discord user ${state.username}. All tokens sync with the Discord server.`;
        el.syncText.textContent = 'Discord Synced';
      } else {
        el.discordSyncPill.className = 'sync-status-pill demo';
        el.discordSyncPill.title = 'Unlinked Demo Mode. Type /play in the Discord server to connect your real Discord balance!';
        el.syncText.textContent = 'Demo Mode';
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
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()}`;
    }
  }

  function updateCrashTelemetry() {
    const target = state.crashAutoCashout;
    const wager = state.crashWager;

    if (target && target >= 1.01) {
      const prob = Math.min(98, (0.98 / target) * 100);
      if (el.crashWinRate) el.crashWinRate.textContent = `${prob.toFixed(1)}%`;
      if (el.crashEstPayout) el.crashEstPayout.textContent = `${Math.floor(wager * target).toLocaleString()}`;
    } else {
      if (el.crashWinRate) el.crashWinRate.textContent = '49.0%';
      if (el.crashEstPayout) el.crashEstPayout.textContent = `${Math.floor(wager * 2).toLocaleString()}`;
    }

    if (el.crashRoundNumber) {
      el.crashRoundNumber.textContent = `#${state.crashRoundNumber}`;
    }

    updateCrashActionCTA();
  }

  function updateBalanceDisplay(newBalance, animate = false) {
    if (typeof newBalance !== 'number' || isNaN(newBalance)) return;
    state.balance = newBalance;
    instantGamesUi?.sync();
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
        else chip.classList.add('chip-win');
      } else {
        if (!won || mult <= 1.0) chip.classList.add('chip-loss');
        else if (mult >= 10.0) chip.classList.add('chip-purple');
        else if (mult >= 5.0) chip.classList.add('chip-gold');
        else chip.classList.add('chip-win');
      }

      chip.textContent = `${mult.toFixed(2)}×`;
      el.historyStream.appendChild(chip);
    });
  }

  // =========================================================================
  // 8. API CLIENT & REAL-TIME SSE STREAM
  // =========================================================================

  async function api(endpoint, method = 'GET', data = null, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'x-guest-id': guestId,
    };
    if (playToken) headers['x-play-token'] = playToken;

    const opts = { method, headers, signal: options.signal };
    if (data) opts.body = JSON.stringify({ ...data, token: playToken, guestId });

    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    const json = await res.json();
    if (!res.ok) { const error = new Error(json.error || `HTTP ${res.status}`); error.status = res.status; throw error; }
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

    sseSource.addEventListener('instant_round', (event) => {
      try { state.instantActivity.unshift(JSON.parse(event.data)); state.instantActivity=state.instantActivity.slice(0,20); renderLiveActivityTable(state.activeStageTab); } catch {}
    });

    sseSource.addEventListener('wallet', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.userId && data.userId === state.userId) {
          updateBalanceDisplay(data.balance, true);
        }
      } catch {}
    });

    sseSource.addEventListener('crash_state', (e) => {
      try { applyServerCrashState(JSON.parse(e.data)); } catch {}
    });

    sseSource.addEventListener('crash_phase', (e) => {
      try { applyServerCrashState(JSON.parse(e.data)); } catch {}
    });

    sseSource.addEventListener('crash_tick', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.phase === 'IN_FLIGHT' && state.crashPhase === 'IN_FLIGHT') {
          state.crashBaseElapsedMs = data.elapsedMs || 0;
          state.crashSyncPerfNow = performance.now();
          if (typeof data.currentMult === 'number') {
            state.crashCurrentMult = data.currentMult;
          }
        }
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
  // 9. CONTINUOUS 24/7 CRASH ENGINE (STRICT COUNTDOWN-ONLY BETTING)
  // =========================================================================

  let winToastTimeout = null;

  function showCrashWinToast(mult, profit) {
    if (!el.crashWinToast) return;
    if (el.crashToastMult) el.crashToastMult.textContent = `${Number(mult).toFixed(2)}×`;
    if (el.crashToastProfit) el.crashToastProfit.textContent = `+${Number(profit).toLocaleString()}`;
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
      `Locked in <strong>+${Number(profit).toLocaleString()}</strong> at <strong>${Number(mult).toFixed(2)}×</strong>!`,
      'won'
    );
    refreshProfile();
    loadLeaderboard();
  }

  function syncMyBetFromPlayers() {
    const myKey = state.authenticated && state.userId ? String(state.userId) : guestId;
    if (!myKey && !state.userId) return;
    const found = state.crashPlayers.find((p) => {
      const pUid = String(p.userId || p.key || '');
      return pUid === myKey || (state.userId && pUid === String(state.userId)) || (guestId && pUid === guestId);
    });
    if (found) {
      if (state.crashMyBet) {
        state.crashMyBet.cashedOut = Boolean(found.cashedOut);
        if (found.cashoutMult) state.crashMyBet.cashoutMult = found.cashoutMult;
        if (found.profit !== undefined) state.crashMyBet.profit = found.profit;
        if (found.winAmount !== undefined) state.crashMyBet.winAmount = found.winAmount;
        if (found.wager) state.crashMyBet.wager = found.wager;
      } else {
        state.crashMyBet = { ...found };
      }
    }
  }

  function applyServerCrashState(data) {
    if (!data) return;

    const prevPhase = state.crashPhase;
    const prevRound = state.crashRoundNumber;
    state.crashPhase = data.phase || state.crashPhase;
    state.crashRoundNumber = data.roundNumber || state.crashRoundNumber;
    state.crashBettingDurationMs = data.bettingDurationMs || data.countdownTotalMs || 6000;
    state.crashBaseElapsedMs = typeof data.elapsedMs === 'number' ? data.elapsedMs : 0;
    state.crashBaseRemainingMs = typeof data.remainingMs === 'number' ? data.remainingMs : state.crashBettingDurationMs;
    state.crashSyncPerfNow = performance.now();

    if (typeof data.currentMult === 'number') {
      state.crashCurrentMult = data.currentMult;
    }
    if (typeof data.crashPoint === 'number') {
      state.crashPoint = data.crashPoint;
    }

    if (Array.isArray(data.players)) {
      state.crashPlayers = data.players;
    }

    // Only set crashMyBet from server if an explicit bet object is provided.
    // Broadcast messages omit myBet, so we NEVER wipe an active bet during flight!
    if (data.myBet && typeof data.myBet === 'object') {
      state.crashMyBet = data.myBet;
    } else if (state.crashRoundNumber !== prevRound && prevRound !== 0) {
      // New round started -> clear previous round's bet and sync
      state.crashMyBet = null;
      syncMyBetFromPlayers();
    } else {
      // Same round -> maintain active bet and sync latest status
      syncMyBetFromPlayers();
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
        setCrashHud('Bet Locked', `Bet of ${state.crashMyBet.wager.toLocaleString()} locked in for Round #${state.crashRoundNumber}!`, 'active');
      } else {
        setCrashHud('Betting Open', `Round #${state.crashRoundNumber} countdown active — Place your bet before liftoff!`, 'ready');
      }

      // Trigger Auto-Bet ONLY during BETTING phase
      if (state.crashMode === 'auto' && state.crashAutoBetActive && !state.crashMyBet && state.crashAutoBetLastRound !== state.crashRoundNumber) {
        state.crashAutoBetLastRound = state.crashRoundNumber;
        placeCrashBetDuringCountdown();
      }
    } else if (state.crashPhase === 'IN_FLIGHT' && prevPhase !== 'IN_FLIGHT') {
      state.crashEjectMarkers = state.crashPlayers
        .filter((p) => p.cashedOut && p.cashoutMult)
        .map((p) => ({ username: p.username, mult: Number(p.cashoutMult) }));

      Sound.startThruster();
      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        setCrashHud('In Flight', 'Rocket ascending! Click Cash Out anytime before detonation.', 'active');
      } else {
        setCrashHud('Flight Live', 'Flight in progress — Betting is locked until the next countdown.', 'ready');
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
        setCrashHud('Crashed', `Crashed at ${crashMult.toFixed(2)}×! Next betting countdown starts in 3s.`, 'lost');
        refreshProfile();
      } else {
        setCrashHud('Round Over', `Flight crashed at ${crashMult.toFixed(2)}×. Next betting countdown starts in 3s...`, 'ready');
      }
      loadLeaderboard();
    }

    renderCrashPlayersRoster();
    updateCrashTelemetry();
    updateCrashActionCTA();
  }

  function renderCrashPlayersRoster() {
    if (!el.crashPlayersList) return;
    const players = state.crashPlayers || [];
    if (el.crashPlayersCount) {
      el.crashPlayersCount.textContent = `${players.length} ${players.length === 1 ? 'Player' : 'Players'}`;
    }

    if (players.length === 0) {
      el.crashPlayersList.innerHTML = '<div class="lb-empty" style="padding:12px;">Waiting for bets...</div>';
      return;
    }

    const myKey = state.authenticated && state.userId ? state.userId : (playToken || guestId);
    let html = '';
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const isMe = (state.userId && p.userId === state.userId) || (myKey && p.userId === myKey);
      let statusHtml = '';

      if (p.cashedOut) {
        statusHtml = `<span class="cp-status cashed">${Number(p.cashoutMult).toFixed(2)}× (+${Number(p.profit).toLocaleString()})</span>`;
      } else if (state.crashPhase === 'CRASHED') {
        statusHtml = `<span class="cp-status lost">Crashed</span>`;
      } else if (state.crashPhase === 'IN_FLIGHT') {
        statusHtml = `<span class="cp-status flying">In Flight</span>`;
      } else {
        statusHtml = `<span class="cp-status flying">Ready</span>`;
      }

      html += `
        <div class="crash-player-row${isMe ? ' is-me' : ''}">
          <div class="cp-user">
            <img class="cp-avatar" src="${escapeHtml(p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="">
            <span class="cp-name">${escapeHtml(p.username)}${isMe ? ' (You)' : ''}</span>
          </div>
          <span class="cp-wager">${Number(p.wager).toLocaleString()}</span>
          ${statusHtml}
        </div>
      `;
    }
    el.crashPlayersList.innerHTML = html;
  }

  function updateCrashActionCTA() {
    if (!el.crashActionButton || !el.crashActionTitle || !el.crashActionSub) return;

    const wager = state.crashWager;
    if (!state.crashMyBet) syncMyBetFromPlayers();
    const myBet = state.crashMyBet;

    if (el.crashHudProfitBox) {
      el.crashHudProfitBox.style.display = (state.crashPhase === 'IN_FLIGHT' && myBet && !myBet.cashedOut) ? 'flex' : 'none';
    }

    // 1. Player has an active uncashed bet during IN_FLIGHT -> Active CASH OUT button!
    if (state.crashPhase === 'IN_FLIGHT') {
      if (myBet && !myBet.cashedOut) {
        el.crashActionButton.disabled = false;
        el.crashActionButton.className = 'btn-stake-cta btn-cashout';
        el.crashActionTitle.textContent = 'Cash Out';
        const livePayout = Math.floor(myBet.wager * (state.crashCurrentMult || 1.0));
        el.crashActionSub.textContent = `+${livePayout.toLocaleString()}`;
        return;
      }
    }

    // 2. Auto-Bet Mode Active Toggle (Allows stopping auto-bet at any time)
    if (state.crashMode === 'auto' && state.crashAutoBetActive) {
      el.crashActionButton.disabled = false;
      el.crashActionButton.className = 'btn-stake-cta btn-armed';
      el.crashActionTitle.textContent = 'Stop Auto-Bet';
      el.crashActionSub.textContent = myBet
        ? `Locked (${myBet.wager.toLocaleString()})`
        : `${Number(wager).toLocaleString()} / Round`;
      return;
    }

    // 3. During BETTING Countdown Phase -> ONLY window to place a bet!
    if (state.crashPhase === 'BETTING') {
      if (myBet) {
        el.crashActionButton.disabled = true;
        el.crashActionButton.className = 'btn-stake-cta btn-armed';
        el.crashActionTitle.textContent = 'Bet Locked • Launching Soon';
        el.crashActionSub.textContent = `${Number(myBet.wager).toLocaleString()}`;
      } else {
        el.crashActionButton.disabled = false;
        el.crashActionButton.className = 'btn-stake-cta btn-bet';
        el.crashActionTitle.textContent = state.crashMode === 'auto' ? 'Start Auto-Bet' : 'Place Bet';
        el.crashActionSub.textContent = `${Number(wager).toLocaleString()}`;
      }
      return;
    }

    // 4. During IN_FLIGHT or CRASHED -> Strictly LOCKED! Cannot place a bet while rocket is flying!
    el.crashActionButton.disabled = true;
    el.crashActionButton.className = 'btn-stake-cta btn-locked';
    if (myBet && myBet.cashedOut) {
      el.crashActionTitle.textContent = `Cashed Out @ ${Number(myBet.cashoutMult).toFixed(2)}×`;
      el.crashActionSub.textContent = 'Wait for Next Round';
    } else if (state.crashPhase === 'IN_FLIGHT') {
      el.crashActionTitle.textContent = 'Flight in Progress';
      el.crashActionSub.textContent = 'Wait for Countdown';
    } else {
      el.crashActionTitle.textContent = 'Round Over';
      el.crashActionSub.textContent = 'Next Countdown Soon';
    }
  }

  async function handleCrashPrimaryButton() {
    if (state.crashProcessing) return;

    if (!state.crashMyBet) syncMyBetFromPlayers();

    // A. Active uncashed bet during IN_FLIGHT -> Cash Out!
    if (state.crashPhase === 'IN_FLIGHT') {
      if (state.crashMyBet && !state.crashMyBet.cashedOut) {
        await cashOutContinuousCrash();
        return;
      }
    }

    // B. Stop Auto-Bet if running
    if (state.crashMode === 'auto' && state.crashAutoBetActive) {
      Sound.click();
      state.crashAutoBetActive = false;
      setCrashHud('Auto-Bet Stopped', 'Automated betting disabled.', 'ready');
      updateCrashActionCTA();
      return;
    }

    // C. Strictly block placing bets if not in BETTING phase!
    if (state.crashPhase !== 'BETTING') {
      setCrashHud('Betting Locked', 'Wait for the flight to finish and the 6s countdown to begin!', 'lost');
      updateCrashActionCTA();
      return;
    }

    if (state.crashMode === 'auto' && !state.crashAutoBetActive) {
      state.crashAutoBetActive = true;
      state.crashAutoBetLastRound = state.crashRoundNumber;
    }

    await placeCrashBetDuringCountdown();
  }

  async function placeCrashBetDuringCountdown() {
    if (state.crashProcessing || state.crashPhase !== 'BETTING' || state.crashMyBet) return;
    state.crashProcessing = true;
    Sound.click();

    const wager = Math.max(10, Math.floor(Number(el.crashWagerInput ? el.crashWagerInput.value : state.crashWager)) || 100);
    state.crashWager = wager;
    const autoCashout = state.crashAutoCashout;

    if (state.balance < wager) {
      state.crashAutoBetActive = false;
      setCrashHud('Insufficient Balance', `You need ${wager.toLocaleString()} (Balance: ${state.balance.toLocaleString()}).`, 'lost');
      state.crashProcessing = false;
      updateCrashActionCTA();
      return;
    }

    try {
      const res = await api('/crash/bet', 'POST', { wager, autoCashout });
      updateBalanceDisplay(res.balance);
      state.crashMyBet = res.bet;
      if (res.crashState) applyServerCrashState(res.crashState);
      setCrashHud('Bet Locked', `Locked in ${wager.toLocaleString()} for Round #${state.crashRoundNumber}!`, 'active');
    } catch (err) {
      state.crashAutoBetActive = false;
      setCrashHud('Bet Rejected', err.message, 'lost');
    } finally {
      state.crashProcessing = false;
      updateCrashActionCTA();
    }
  }

  async function cashOutContinuousCrash() {
    if (!state.crashMyBet) syncMyBetFromPlayers();
    if (state.crashProcessing || state.crashPhase !== 'IN_FLIGHT' || !state.crashMyBet || state.crashMyBet.cashedOut) return;
    state.crashProcessing = true;
    Sound.click();

    try {
      const res = await api('/crash/cashout', 'POST', {});
      if (res.crashed) {
        setCrashHud('Too Late', `Flight crashed at ${Number(res.crashPoint).toFixed(2)}×!`, 'lost');
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

  function revealPeek(idx, isBomb, playClick = true) {
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
    if (playClick) Sound.click();
  }

  function revealFullBoardPeek(allBombs = []) {
    const bombSet = new Set(Array.isArray(allBombs) ? allBombs.map(Number) : []);
    for (let idx = 0; idx < 25; idx++) {
      const tile = getTile(idx);
      if (!tile || tile.classList.contains('revealed')) continue;
      revealPeek(idx, bombSet.has(idx), false);
    }
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
      setMinesHud('Error', `Insufficient balance! You have ${state.balance.toLocaleString()}.`, 'lost');
      state.isProcessing = false;
      el.mainActionButton.disabled = false;
      return;
    }

    state.activeGame = false;
    state.cashedOut = false;
    state.peekMode = false;
    state.lastAllBombs = [];
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
      setMinesHud('Active', 'Round in progress. Uncover at least 1 safe tile to unlock Cashout!', 'active');
    } catch (err) {
      setMinesHud('Error', err.message, 'lost');
      resetMinesToIdleState();
    } finally {
      state.isProcessing = false;
      el.mainActionButton.disabled = state.activeGame && state.revealedIndices.size === 0;
    }
  }

  async function handleTileClick(idx, tileEl) {
    if (state.isProcessing) return;

    if (state.peekMode) {
      if (tileEl.classList.contains('revealed')) return;
      if (Array.isArray(state.lastAllBombs) && state.lastAllBombs.length > 0) {
        revealPeek(idx, state.lastAllBombs.includes(idx), true);
        return;
      }
      state.isProcessing = true;
      const currentRound = state.roundId;
      try {
        const res = await api('/mines/peek', 'POST', { tileIdx: idx, gameId: state.gameId });
        if (state.roundId === currentRound) {
          revealPeek(idx, res.isBomb, true);
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

        setMinesHud('Detonated', `Hit a mine! Lost ${state.wager.toLocaleString()}. Click Bet to play again.`, 'lost');
        resetMinesToIdleState();
        refreshProfile(false);
        loadLeaderboard();
        return;
      }

      state.revealedIndices.add(idx);
      state.currentMult = res.multiplier;
      state.currentWin = res.currentWin;
      revealGem(idx, true);
      updateMinesTelemetry();

      el.mainActionButton.disabled = false;
      el.mainActionButton.className = 'btn-stake-cta btn-cashout';
      el.actionBtnTitle.textContent = 'Cashout';
      el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()}`;
      el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
      el.hudProfitVal.textContent = `+${Number(res.profit).toLocaleString()}`;

      if (res.won) {
        state.activeGame = false;
        state.cashedOut = true;
        state.lastAllBombs = Array.isArray(res.allBombs) ? res.allBombs : [];
        updateBalanceDisplay(res.balance, true);
        Sound.cashout();
        spawnCoinShower();
        showMinesVictory('PERFECT CLEAR!', res.multiplier, res.profit);
        setMinesHud('Perfect', `Cleared all safe gems! Won ${res.winAmount.toLocaleString()}!`, 'won');
        resetMinesToIdleState();
        refreshProfile(false);
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
    if (!state.activeGame || state.isProcessing) return;
    if (state.revealedIndices.size === 0) {
      setMinesHud('Pick a Tile', 'Uncover at least 1 safe tile on the board before cashing out!', 'ready');
      return;
    }
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
      state.lastAllBombs = Array.isArray(res.allBombs) ? res.allBombs : [];

      updateBalanceDisplay(res.balance, true);
      Sound.cashout();
      spawnCoinShower();

      el.wagerInput.disabled = false;
      el.minesCountSelect.disabled = false;
      el.mainActionButton.className = 'btn-stake-cta btn-bet';
      el.actionBtnTitle.textContent = 'Bet';
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()}`;

      showMinesVictory('CASHED OUT', res.multiplier, res.profit);
      setMinesHud('Cashed Out', `Locked in +${res.winAmount.toLocaleString()}! Click Bet to start a new round.`, 'won');

      refreshProfile(false);
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

    if (state.revealedIndices.size === 0) {
      el.mainActionButton.disabled = true;
      el.mainActionButton.className = 'btn-stake-cta btn-locked';
      el.actionBtnTitle.textContent = 'Pick a Tile';
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()}`;
    } else {
      el.mainActionButton.disabled = false;
      el.mainActionButton.className = 'btn-stake-cta btn-cashout';
      el.actionBtnTitle.textContent = 'Cashout';
      el.actionBtnSub.textContent = `${Number(state.currentWin).toLocaleString()}`;
    }

    el.hudProfitBox.style.display = 'flex';
    el.hudMultVal.textContent = `${state.currentMult.toFixed(2)}×`;
    el.hudProfitVal.textContent = `+${Math.max(0, state.currentWin - state.wager).toLocaleString()}`;
    updateMinesTelemetry();
  }

  function resetMinesToIdleState() {
    el.wagerInput.disabled = false;
    el.minesCountSelect.disabled = false;

    el.mainActionButton.className = 'btn-stake-cta btn-bet';
    el.actionBtnTitle.textContent = 'Bet';
    el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()}`;

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
    el.modalWinAmount.textContent = `+${Number(profit).toLocaleString()}`;
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
  // 11. LIVE ACTIVITY & COMPACT CROWN LEADERBOARD RENDERERS
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
    if (!ts) return 'Just now';
    const diff = Math.max(2, Math.floor((Date.now() - ts) / 1000));
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function getCrownSvg(rankIndex) {
    const colors = ['#fbbf24', '#94a3b8', '#d97706'];
    const c = colors[rankIndex] || '#64748b';
    return `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="${c}">
        <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z"/>
      </svg>
    `;
  }

  async function loadLeaderboard() {
    try {
      const [minesRes, crashRes, instantRes] = await Promise.allSettled([
        api('/mines/leaderboard'),
        api('/crash/leaderboard'),
        api('/instant/activity'),
      ]);

      if (minesRes.status === 'fulfilled') state.minesLeaderboard = minesRes.value;
      if (crashRes.status === 'fulfilled') state.crashLeaderboard = crashRes.value;
      if (instantRes.status === 'fulfilled') state.instantActivity = instantRes.value.rounds;

      renderLiveActivityTable(state.activeStageTab);
      renderMiniLeaderboard();
      renderLeaderboardTable(state.activeModalTab, el.lbModalContent);
    } catch {}
  }

  function renderLiveActivityTable(category = 'recent') {
    if (!el.liveActivityBody) return;
    const mData = state.minesLeaderboard || {};
    const cData = state.crashLeaderboard || {};

    const minesWins = (mData.recentWins || mData.topMultipliers || []).map((w) => ({ ...w, gameName: 'Mines' }));
    const crashWins = (cData.recentWins || cData.topMultipliers || []).map((w) => ({ ...w, gameName: 'Crash' }));

    let list = [];
    if (category === 'mines-multipliers') {
      list = (mData.topMultipliers || []).map((w) => ({ ...w, gameName: 'Mines' }));
    } else if (category === 'crash-multipliers') {
      list = (cData.topMultipliers || []).map((w) => ({ ...w, gameName: 'Crash' }));
    } else {
      list = [...minesWins, ...crashWins, ...state.instantActivity].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    list = list.filter(round => !instantGamesUi?.isHiddenRound(round.roundId)).slice(0, 6);

    if (list.length === 0) {
      el.liveActivityBody.innerHTML = '<tr><td colspan="5" class="lb-empty">No recent activity yet. Place a bet to appear live!</td></tr>';
      return;
    }

    let html = '';
    list.forEach((w) => {
      const mult = Number(w.multiplier ?? 1.0);
      const payout = Number(w.payout ?? w.profit ?? 0);
      const gameLabel = w.gameName || (w.bombs !== undefined ? 'Mines' : 'Crash');
      html += `
        <tr>
          <td>
            <div class="lb-player-cell">
              <img class="lb-avatar" src="${escapeHtml(w.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="">
              <span class="lb-username">${escapeHtml(w.username)}</span>
            </div>
          </td>
          <td class="mf-game-col">${escapeHtml(gameLabel)}</td>
          <td style="text-align:center;"><span class="lb-mult-chip">${mult.toFixed(2)}×</span></td>
          <td style="text-align:right;">
            <span class="mf-payout-cell">${SVG_COIN_INLINE} ${payout.toLocaleString()}</span>
          </td>
          <td style="text-align:right;"><span class="lb-time">${formatTimeAgo(w.timestamp)}</span></td>
        </tr>
      `;
    });

    el.liveActivityBody.innerHTML = html;
  }

  function renderMiniLeaderboard() {
    if (!el.miniLeaderboardList) return;
    const mData = state.minesLeaderboard || {};
    const cData = state.crashLeaderboard || {};

    // Combine top players across Mines & Crash
    const playerMap = new Map();
    const allPlayers = [...(mData.topPlayers || []), ...(cData.topPlayers || [])];

    for (const p of allPlayers) {
      const key = p.userId || p.username;
      if (!playerMap.has(key)) {
        playerMap.set(key, {
          username: p.username,
          avatarUrl: p.avatarUrl,
          totalProfit: Number(p.totalProfit || 0),
        });
      } else {
        const existing = playerMap.get(key);
        existing.totalProfit = Math.max(existing.totalProfit, Number(p.totalProfit || 0));
      }
    }

    const top3 = Array.from(playerMap.values())
      .sort((a, b) => b.totalProfit - a.totalProfit)
      .slice(0, 3);

    if (top3.length === 0) {
      el.miniLeaderboardList.innerHTML = '<div class="lb-empty">No ranked players yet.</div>';
      return;
    }

    let html = '';
    top3.forEach((p, idx) => {
      html += `
        <div class="mf-mini-lb-row">
          <div class="mf-mini-lb-left">
            <span class="mf-crown-icon">${getCrownSvg(idx)}</span>
            <img class="lb-avatar" src="${escapeHtml(p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="">
            <span class="lb-username">${escapeHtml(p.username)}</span>
          </div>
          <span class="mf-mini-lb-amount">${SVG_COIN_INLINE} ${Number(p.totalProfit).toLocaleString()}</span>
        </div>
      `;
    });

    el.miniLeaderboardList.innerHTML = html;
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
        html += `
          <tr>
            <td><span class="lb-rank ${rankClass}">${i + 1}</span></td>
            <td>
              <div class="lb-player-cell">
                <img class="lb-avatar" src="${escapeHtml(p.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="Avatar">
                <span class="lb-username">${escapeHtml(p.username)}</span>
              </div>
            </td>
            <td style="text-align: right;"><span class="lb-profit">${SVG_COIN_INLINE} +${Number(p.totalProfit).toLocaleString()}</span></td>
            <td style="text-align: center;"><span class="lb-mult-chip">${mult.toFixed(2)}×</span></td>
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
            <th style="text-align: center;">${isCrashTab ? 'Wager / Game' : 'Wager / Mines'}</th>
            <th style="text-align: right;">Net Profit</th>
            <th style="text-align: right;">Time</th>
          </tr>
        </thead>
        <tbody>
    `;

    list.forEach((w, i) => {
      const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-default';
      const mult = Number(w.multiplier || 1.0);
      const detailBadge = w.bombs !== undefined
        ? `${Number(w.wager).toLocaleString()} • ${w.bombs} Mines`
        : `${Number(w.wager).toLocaleString()} • Crash`;

      html += `
        <tr>
          <td><span class="lb-rank ${rankClass}">${i + 1}</span></td>
          <td>
            <div class="lb-player-cell">
              <img class="lb-avatar" src="${escapeHtml(w.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png')}" alt="Avatar">
              <span class="lb-username">${escapeHtml(w.username)}</span>
            </div>
          </td>
          <td style="text-align: center;"><span class="lb-mult-chip">${mult.toFixed(2)}×</span></td>
          <td style="text-align: center; color: #94a3b8;">${detailBadge}</td>
          <td style="text-align: right;"><span class="lb-profit">${SVG_COIN_INLINE} +${Number(w.profit).toLocaleString()}</span></td>
          <td style="text-align: right;"><span class="lb-time">${formatTimeAgo(w.timestamp)}</span></td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  let leaderboardReturnFocus = null;

  function openLeaderboard() {
    leaderboardReturnFocus = document.activeElement;
    Sound.click();
    if (el.leaderboardModal) el.leaderboardModal.classList.add('active');
    el.btnCloseLeaderboard?.focus();
    loadLeaderboard();
  }

  function closeLeaderboard() {
    if (el.leaderboardModal) el.leaderboardModal.classList.remove('active');
    leaderboardReturnFocus?.focus();
  }

  document.addEventListener('keydown', (event) => {
    if (!el.leaderboardModal?.classList.contains('active')) return;
    if (event.key === 'Escape') closeLeaderboard();
    if (event.key !== 'Tab') return;
    const buttons = [...el.leaderboardModal.querySelectorAll('button')];
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  });

  // =========================================================================
  // 12. VIEW SWITCHER (HOME HUB <-> ALL GAMES <-> MINES <-> CRASH)
  // =========================================================================

  function switchView(targetView, playSound = false) {
    if (instantGamesUi?.isBusy()) return;
    if (!['coinflip','plinko'].includes(targetView)) instantGamesUi?.hide();
    document.querySelectorAll('[data-instant-game]').forEach(button => button.classList.toggle('active',button.dataset.instantGame===targetView));
    const ribbon=document.querySelector('.multiplier-ribbon');
    if(ribbon) ribbon.hidden=['coinflip','plinko'].includes(targetView);
    if (playSound) Sound.click();
    state.currentView = targetView;
    if (targetView === 'mines' || targetView === 'crash') {
      state.currentGame = targetView;
    }

    // Sidebar active states
    if (el.navHome) el.navHome.classList.toggle('active', targetView === 'home');
    if (el.navAllGames) el.navAllGames.classList.toggle('active', targetView === 'all-games');
    if (el.topNavGames) el.topNavGames.classList.toggle('active', targetView === 'all-games');
    if (el.btnSwitchMines) el.btnSwitchMines.classList.toggle('active', targetView === 'mines');
    if (el.btnSwitchCrash) el.btnSwitchCrash.classList.toggle('active', targetView === 'crash');

    // Game topbar tabs
    if (el.tabPlayMines) el.tabPlayMines.classList.toggle('active', targetView === 'mines');
    if (el.tabPlayCrash) el.tabPlayCrash.classList.toggle('active', targetView === 'crash');

    if (targetView === 'home') {
      if (el.homeChassis) el.homeChassis.style.display = 'flex';
      if (el.gamesCatalogChassis) el.gamesCatalogChassis.style.display = 'none';
      if (el.activeGameTopbar) el.activeGameTopbar.style.display = 'none';
      if (el.minesChassis) el.minesChassis.style.display = 'none';
      if (el.crashChassis) el.crashChassis.style.display = 'none';
      stopCrashCanvasLoop();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (targetView === 'all-games') {
      if (el.homeChassis) el.homeChassis.style.display = 'none';
      if (el.gamesCatalogChassis) {
        el.gamesCatalogChassis.style.display = 'flex';
        el.gamesCatalogChassis.style.flexDirection = 'column';
      }
      if (el.activeGameTopbar) el.activeGameTopbar.style.display = 'none';
      if (el.minesChassis) el.minesChassis.style.display = 'none';
      if (el.crashChassis) el.crashChassis.style.display = 'none';
      stopCrashCanvasLoop();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Reset filter and search
      if (el.gamesSearchInput) el.gamesSearchInput.value = '';
      if (typeof filterCatalogGames === 'function') filterCatalogGames('all', '');
    } else if (targetView === 'coinflip' || targetView === 'plinko') {
      if(el.homeChassis) el.homeChassis.style.display='none';
      if(el.gamesCatalogChassis) el.gamesCatalogChassis.style.display='none';
      if(el.activeGameTopbar) el.activeGameTopbar.style.display='flex';
      if(el.minesChassis) el.minesChassis.style.display='none';
      if(el.crashChassis) el.crashChassis.style.display='none';
      stopCrashCanvasLoop();
      instantGamesUi?.show(targetView);
    } else if (targetView === 'crash') {
      if (el.homeChassis) el.homeChassis.style.display = 'none';
      if (el.gamesCatalogChassis) el.gamesCatalogChassis.style.display = 'none';
      if (el.activeGameTopbar) el.activeGameTopbar.style.display = 'flex';
      if (el.minesChassis) el.minesChassis.style.display = 'none';
      if (el.crashChassis) el.crashChassis.style.display = 'grid';
      startCrashCanvasLoop();
      updateCrashTelemetry();
      fetchCrashState();
      renderHistoryRibbon();
    } else {
      if (el.homeChassis) el.homeChassis.style.display = 'none';
      if (el.gamesCatalogChassis) el.gamesCatalogChassis.style.display = 'none';
      if (el.activeGameTopbar) el.activeGameTopbar.style.display = 'flex';
      if (el.minesChassis) el.minesChassis.style.display = 'grid';
      if (el.crashChassis) el.crashChassis.style.display = 'none';
      stopCrashCanvasLoop();
      resizeMinesCanvas();
      updateMinesTelemetry();
      renderHistoryRibbon();
    }

    try {
      const newUrl = new URL(window.location.href);
      if (targetView === 'home') {
        newUrl.searchParams.delete('game');
      } else {
        newUrl.searchParams.set('game', targetView);
      }
      window.history.replaceState({}, '', newUrl.toString());
    } catch {}
  }

  // =========================================================================
  // 13. PROFILE INITIALIZATION & RECOVERY
  // =========================================================================

  async function refreshProfile(allowRestore = false) {
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
      instantGamesUi?.profile();
      rewardsUi?.profile();

      if (Array.isArray(data.history)) state.minesHistory = data.history;
      if (Array.isArray(data.crashHistory)) state.crashHistory = data.crashHistory;
      renderHistoryRibbon();

      if (data.crashArena || data.crashState) {
        applyServerCrashState(data.crashArena || data.crashState);
      }

      if (allowRestore && data.activeGame && !data.activeGame.cashedOut && !state.activeGame && !state.cashedOut) {
        state.gameId = data.activeGame.gameId || null;
        state.activeGame = true;
        state.wager = data.activeGame.wager;
        state.bombs = data.activeGame.bombs;
        state.currentMult = data.activeGame.multiplier;
        state.currentWin = data.activeGame.currentWin;
        state.revealedIndices.clear();

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

  if (el.brandHomeLink) {
    el.brandHomeLink.addEventListener('click', (e) => {
      e.preventDefault();
      switchView('home', true);
    });
  }
  // Topbar & Sidebar Navigation
  if (el.topNavGames) el.topNavGames.addEventListener('click', () => switchView('all-games', true));
  if (el.navHome) el.navHome.addEventListener('click', () => switchView('home', true));
  if (el.navAllGames) el.navAllGames.addEventListener('click', () => switchView('all-games', true));
  if (el.btnBackHome) el.btnBackHome.addEventListener('click', () => switchView('home', true));
  if (el.btnHomeViewAllGames) el.btnHomeViewAllGames.addEventListener('click', () => switchView('all-games', true));

  if (el.btnSwitchMines) el.btnSwitchMines.addEventListener('click', () => switchView('mines', true));
  if (el.btnSwitchCrash) el.btnSwitchCrash.addEventListener('click', () => switchView('crash', true));
  if (el.tabPlayMines) el.tabPlayMines.addEventListener('click', () => switchView('mines', true));
  if (el.tabPlayCrash) el.tabPlayCrash.addEventListener('click', () => switchView('crash', true));

  if (el.btnHeroPlayNow) el.btnHeroPlayNow.addEventListener('click', () => switchView('mines', true));
  if (el.cardPlayMines) el.cardPlayMines.addEventListener('click', () => switchView('mines', true));
  if (el.cardPlayCrash) el.cardPlayCrash.addEventListener('click', () => switchView('crash', true));
  if (el.btnCatalogPlayMines) el.btnCatalogPlayMines.addEventListener('click', () => switchView('mines', true));
  if (el.btnCatalogPlayCrash) el.btnCatalogPlayCrash.addEventListener('click', () => switchView('crash', true));
  if (el.btnPlayMinesHome) el.btnPlayMinesHome.addEventListener('click', (e) => { e.stopPropagation(); switchView('mines', true); });
  if (el.btnPlayCrashHome) el.btnPlayCrashHome.addEventListener('click', (e) => { e.stopPropagation(); switchView('crash', true); });

  // Game Info Modal Data & Mechanics
  const GAME_INFO_DETAILS = {
    blackjack: {
      title: 'Blackjack 21',
      category: 'Table & Cards',
      desc: 'The classic casino card showdown. Beat the dealer, double down on advantageous hands, split pairs, and hit natural 21 for 3:2 token payouts! Bets and balances are instantly synced with your Discord wallet.',
      maxWin: '3:2 Natural Payout',
      cmd: '/blackjack bet:100',
      img: '/play/assets/game-blackjack.png?v=6.0',
    },
    keno: {
      title: 'Neon Keno',
      category: 'Arcade & Lottery',
      desc: 'Pick your lucky numbers and match the drawn spheres for high multiplier returns! Volatility multipliers pay out according to your hits, with jackpot multipliers reaching up to 1,000×. Playable directly in Discord channels.',
      maxWin: '1,000× Jackpot',
      cmd: '/keno bet:100 picks:5',
      img: '/play/assets/game-keno.png?v=6.0',
    },
    slots: {
      title: 'Cyber Slots',
      category: 'Arcade & Lottery',
      desc: 'Spin 3 reels for Triple Neon 777s, diamonds, lunar crescents, and rockets. Hit 3 matching symbols on the center payline to trigger progressive community jackpots and bonus token payouts!',
      maxWin: '500× Multiplier',
      cmd: '/slots bet:100',
      img: '/play/assets/game-slots.png?v=6.0',
    },
    coinflip: {
      title: 'Coinflip',
      category: 'PvP & Solo Toss',
      desc: 'High-speed double-or-nothing coin toss with cryptographic fair physics. Play solo against the house or challenge server players to heads-or-tails duels for 1.96× token returns!',
      maxWin: '1.96× Instant Win',
      cmd: '/coinflip bet:100 choice:heads',
      img: '/play/assets/game-coinflip.png?v=6.0',
    },
  };

  function openGameInfoModal(gameKey) {
    const info = GAME_INFO_DETAILS[gameKey];
    if (!info) return;
    Sound.click();
    if (el.gameInfoTitle) el.gameInfoTitle.textContent = info.title;
    if (el.gameInfoDesc) el.gameInfoDesc.textContent = info.desc;
    if (el.gameInfoCategory) el.gameInfoCategory.textContent = info.category;
    if (el.gameInfoMaxWin) el.gameInfoMaxWin.textContent = info.maxWin;
    if (el.gameInfoCmd) el.gameInfoCmd.textContent = info.cmd;
    if (el.gameInfoImg) el.gameInfoImg.src = info.img;
    if (el.gameInfoModal) el.gameInfoModal.classList.add('active');
  }

  function closeGameInfoModal() {
    Sound.click();
    if (el.gameInfoModal) el.gameInfoModal.classList.remove('active');
  }

  if (el.btnCloseGameInfo) el.btnCloseGameInfo.addEventListener('click', closeGameInfoModal);
  if (el.btnDoneGameInfo) el.btnDoneGameInfo.addEventListener('click', closeGameInfoModal);

  if (el.btnCopyGameCmd) {
    el.btnCopyGameCmd.addEventListener('click', () => {
      Sound.click();
      const cmdText = el.gameInfoCmd ? el.gameInfoCmd.textContent : '';
      if (navigator.clipboard && cmdText) {
        navigator.clipboard.writeText(cmdText);
        el.btnCopyGameCmd.textContent = 'Copied!';
        setTimeout(() => {
          if (el.btnCopyGameCmd) el.btnCopyGameCmd.textContent = 'Copy Command';
        }, 1500);
      }
    });
  }

  // Delegated clicks for any element with data-catalog-game
  document.querySelectorAll('[data-catalog-game]').forEach((card) => {
    card.addEventListener('click', (e) => {
      // Don't open if clicked directly on an external button
      const gameKey = card.dataset.catalogGame;
      if (gameKey === 'coinflip' || gameKey === 'plinko') switchView(gameKey,true);
      else if (gameKey) openGameInfoModal(gameKey);
    });
  });

  // All Games Search & Filter System
  let activeCatalogCategory = 'all';

  function filterCatalogGames(category, query = '') {
    activeCatalogCategory = category;
    const q = (query || '').toLowerCase().trim();
    let visibleCount = 0;

    const cards = document.querySelectorAll('#catalogGrid .mf-catalog-card');
    cards.forEach((card) => {
      const cardCat = card.dataset.category || '';
      const cardTitle = (card.dataset.title || card.textContent || '').toLowerCase();

      const matchesCat = (category === 'all') || (cardCat === category);
      const matchesQuery = !q || cardTitle.includes(q);

      if (matchesCat && matchesQuery) {
        card.style.display = 'flex';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (el.catalogEmptySearch) {
      el.catalogEmptySearch.style.display = visibleCount === 0 ? 'block' : 'none';
    }
    if (el.btnClearSearch) {
      el.btnClearSearch.style.display = q ? 'block' : 'none';
    }
  }

  if (el.catalogFilterPills) {
    el.catalogFilterPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        Sound.click();
        el.catalogFilterPills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const cat = pill.dataset.filter || 'all';
        const q = el.gamesSearchInput ? el.gamesSearchInput.value : '';
        filterCatalogGames(cat, q);
      });
    });
  }

  if (el.gamesSearchInput) {
    el.gamesSearchInput.addEventListener('input', () => {
      filterCatalogGames(activeCatalogCategory, el.gamesSearchInput.value);
    });
  }

  if (el.btnClearSearch) {
    el.btnClearSearch.addEventListener('click', () => {
      if (el.gamesSearchInput) el.gamesSearchInput.value = '';
      filterCatalogGames(activeCatalogCategory, '');
    });
  }

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
    el.btnModalClose.addEventListener('click', () => {
      Sound.click();
      hideMinesVictory();
      if (state.lastAllBombs && state.lastAllBombs.length > 0) {
        revealFullBoardPeek(state.lastAllBombs);
      }
      state.activeGame = false;
      el.wagerInput.disabled = false;
      el.minesCountSelect.disabled = false;
      el.mainActionButton.disabled = false;
      el.mainActionButton.className = 'btn-stake-cta btn-bet';
      el.actionBtnTitle.textContent = 'Bet';
      el.actionBtnSub.textContent = `${Number(state.wager).toLocaleString()}`;
      setMinesHud('Board Revealed', 'Full board shown! Click Bet on the left to start your next round.', 'won');
    });
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
    if (e.defaultPrevented || document.querySelector('.fairness-modal.active') || e.code !== 'Space') return;
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    if (state.currentView === 'crash') {
      e.preventDefault();
      handleCrashPrimaryButton();
    } else if (state.currentView === 'mines' && state.activeGame && state.revealedIndices.size > 0) {
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
  if (el.sidebarLeaderboard) el.sidebarLeaderboard.addEventListener('click', openLeaderboard);
  if (el.btnExpandLeaderboard) el.btnExpandLeaderboard.addEventListener('click', openLeaderboard);
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
        renderLiveActivityTable(state.activeStageTab);
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
  if (el.sidebarSupport) el.sidebarSupport.addEventListener('click', openFairness);
  if (el.btnCloseFairness) el.btnCloseFairness.addEventListener('click', closeFairness);
  if (el.btnDoneFairness) el.btnDoneFairness.addEventListener('click', closeFairness);

  document.querySelectorAll('.mf-catalog-card').forEach((card) => {
    const action = card.querySelector('button');
    if (action) {
      card.setAttribute('aria-label', card.querySelector('.mf-card-title').textContent);
      action.tabIndex = -1;
      card.addEventListener('click', (event) => {
        if (event.target.closest('button') || card.dataset.catalogGame || card.id) return;
        action.click();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          card.click();
        }
      });
    }
  });

  // =========================================================================
  // 15. BOOTSTRAP
  // =========================================================================

  instantGamesUi = window.createInstantGamesUI({api,updateBalance:updateBalanceDisplay,refreshProfile,state,onPendingChange:()=>renderLiveActivityTable(state.activeStageTab)});
  document.querySelectorAll('[data-instant-game]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.instantGame,true)));

  rewardsUi = window.createRewardsUI({api,state,updateBalance:updateBalanceDisplay,refreshProfile});
  document.getElementById('btnOpenRewards')?.addEventListener('click',()=>rewardsUi.open());

  buildGrid();
  updateMinesTelemetry();
  updateCrashTelemetry();
  resizeMinesCanvas();
  resizeCrashCanvas();

  switchView(state.currentView);
  refreshProfile(true);
  connectRealtimeStream();
  loadLeaderboard();

  if (!state.soundEnabled) {
    if (el.soundSvgOn) el.soundSvgOn.style.display = 'none';
    if (el.soundSvgOff) el.soundSvgOff.style.display = 'block';
  }
})();
