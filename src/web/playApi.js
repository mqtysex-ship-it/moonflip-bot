import crypto from 'crypto';
import { generateMinesBombs, calculateMinesMultiplier, generateCrashMultiplier } from '../games/rng.js';
import { getBalance, deductTokens, addTokens, getUser } from '../games/economy.js';
import { recordMinesWin, getMinesLeaderboard } from '../games/minesLeaderboard.js';
import { recordCrashWin, getCrashLeaderboard } from '../games/crashLeaderboard.js';

export const webPlaySessions = new Map();
export const activeWebMines = new Map();
export const activeWebCrash = new Map();

// Per-player concurrency lock to ensure rapid clicks or network reordering never race
const playerLocks = new Set();

// Recent win/loss multipliers feed for live history ticker (Mines)
export const recentPlayHistory = [
  { multiplier: 1.85, won: true },
  { multiplier: 0.00, won: false },
  { multiplier: 2.45, won: true },
  { multiplier: 1.14, won: true },
  { multiplier: 0.00, won: false },
  { multiplier: 3.75, won: true },
  { multiplier: 0.00, won: false },
  { multiplier: 5.20, won: true },
];

// Recent crash multipliers for live crash history ticker
export const recentCrashHistory = [2.45, 1.18, 8.45, 1.85, 12.50, 3.20];

// Clean up expired sessions every 10 minutes
const sessionCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of webPlaySessions.entries()) {
    if (sess.expiresAt < now) {
      webPlaySessions.delete(token);
      if (sess.userId) {
        activeWebMines.delete(sess.userId);
        activeWebCrash.delete(sess.userId);
      }
    }
  }
}, 10 * 60 * 1000);
if (sessionCleanupTimer.unref) sessionCleanupTimer.unref();

export function createWebPlaySession(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const session = {
    userId: user.id,
    username: user.username,
    avatarUrl: typeof user.displayAvatarURL === 'function' ? user.displayAvatarURL() : user.avatarUrl,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour session
    demoBalance: 1000,
  };
  webPlaySessions.set(token, session);
  return token;
}

export function getPublicBaseUrl(interaction = null) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function resolvePlayer(req) {
  const token = req.headers['x-play-token'] || req.query.token || req.body?.token;
  if (token && webPlaySessions.has(token)) {
    const sess = webPlaySessions.get(token);
    if (sess.expiresAt > Date.now()) {
      sess.expiresAt = Date.now() + 60 * 60 * 1000;
      return { authenticated: true, session: sess, token };
    }
  }
  return {
    authenticated: false,
    session: {
      userId: null,
      username: 'Guest Player',
      avatarUrl: null,
      demoBalance: 1000,
    },
    token: null,
  };
}

export function setupPlayApi(app) {
  // 1. GET /api/play/profile - Live User Wallet & Active Game State
  app.get('/api/play/profile', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const balance = authenticated ? getBalance(session.userId) : (session.demoBalance || 1000);
      const gameKey = authenticated && session.userId ? session.userId : (token || 'demo');
      const activeGame = activeWebMines.get(gameKey);
      const activeCrash = activeWebCrash.get(gameKey);

      let safeGame = null;
      if (activeGame && !activeGame.gameOver) {
        safeGame = {
          gameId: activeGame.id,
          wager: activeGame.wager,
          bombs: activeGame.bombs,
          revealed: activeGame.revealed,
          multiplier: activeGame.multiplier,
          currentWin: Math.floor(activeGame.wager * activeGame.multiplier),
          nextMultiplier: calculateMinesMultiplier(25, activeGame.bombs, activeGame.revealed.length + 1),
          peekMode: Boolean(activeGame.peekMode),
          peekRevealed: activeGame.peekRevealed || [],
        };
      }

      let safeCrash = null;
      if (activeCrash && !activeCrash.crashed && !activeCrash.cashedOut) {
        safeCrash = {
          flightId: activeCrash.id,
          wager: activeCrash.wager,
          autoCashout: activeCrash.autoCashout,
          startTime: activeCrash.startTime,
        };
      }

      res.json({
        authenticated,
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        balance,
        activeGame: safeGame,
        activeCrash: safeCrash,
        history: recentPlayHistory.slice(0, 10),
        crashHistory: recentCrashHistory.slice(0, 10),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /api/play/mines/start - Initialize a new 5x5 Mines Round
  app.post('/api/play/mines/start', (req, res) => {
    const { authenticated, session, token } = resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { wager, bombs } = req.body || {};

      const cleanBet = Math.max(10, Math.floor(Number(wager)) || 100);
      const cleanBombs = Math.min(24, Math.max(1, Math.floor(Number(bombs)) || 3));

      const currentBalance = authenticated
        ? getBalance(session.userId)
        : (session.demoBalance || 1000);

      if (currentBalance < cleanBet) {
        return res.status(400).json({
          error: `Insufficient balance! You have ${currentBalance.toLocaleString()} tokens, but bet is ${cleanBet.toLocaleString()} tokens.`,
          balance: currentBalance,
        });
      }

      // If an existing game was still running, terminate it so delayed clicks cannot leak
      const existing = activeWebMines.get(gameKey);
      if (existing) {
        existing.gameOver = true;
        activeWebMines.delete(gameKey);
      }

      // Atomic Token Deduction
      let newBalance = currentBalance;
      if (authenticated) {
        deductTokens(session.userId, cleanBet);
        newBalance = getBalance(session.userId);
      } else {
        session.demoBalance -= cleanBet;
        newBalance = session.demoBalance;
      }

      const bombIndices = generateMinesBombs(25, cleanBombs);
      const gameId = 'mg_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');

      const gameState = {
        id: gameId,
        userId: session.userId,
        wager: cleanBet,
        bombs: cleanBombs,
        bombIndices,
        revealed: [],
        multiplier: 1.0,
        gameOver: false,
        cashedOut: false,
        peekMode: false,
        peekRevealed: [],
        createdAt: Date.now(),
      };

      activeWebMines.set(gameKey, gameState);

      const nextMult = calculateMinesMultiplier(25, cleanBombs, 1);

      res.json({
        success: true,
        gameId,
        wager: cleanBet,
        bombs: cleanBombs,
        multiplier: 1.0,
        currentWin: cleanBet,
        nextMultiplier: nextMult,
        balance: newBalance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 3. POST /api/play/mines/reveal - Click a Tile (0..24)
  app.post('/api/play/mines/reveal', (req, res) => {
    const { authenticated, session, token } = resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { tileIdx, gameId } = req.body || {};
      const idx = Number(tileIdx);

      if (isNaN(idx) || idx < 0 || idx > 24) {
        return res.status(400).json({ error: 'Invalid tile index (0 to 24 required)' });
      }

      const game = activeWebMines.get(gameKey);

      if (!game || game.gameOver) {
        return res.status(400).json({ error: 'No active game in progress. Start a new bet!' });
      }

      // Check for round desync / stale action
      if (gameId && game.id !== gameId) {
        return res.status(400).json({ error: 'Stale game round. Please refresh.' });
      }

      if (game.revealed.includes(idx)) {
        return res.status(400).json({ error: 'Tile already uncovered.' });
      }

      // Check for Bomb Detonation
      if (game.bombIndices.has(idx)) {
        game.gameOver = true;
        game.explodedIdx = idx;
        activeWebMines.delete(gameKey);

        recentPlayHistory.unshift({ multiplier: 0.0, won: false });
        if (recentPlayHistory.length > 20) recentPlayHistory.pop();

        const balance = authenticated ? getBalance(session.userId) : session.demoBalance;

        return res.json({
          gameOver: true,
          hitBomb: true,
          gameId: game.id,
          explodedIdx: idx,
          allBombs: Array.from(game.bombIndices),
          allGems: Array.from({ length: 25 }, (_, i) => i).filter((i) => !game.bombIndices.has(i)),
          balance,
        });
      }

      // Safe Gem Uncovered!
      game.revealed.push(idx);
      const mult = calculateMinesMultiplier(25, game.bombs, game.revealed.length);
      game.multiplier = mult;
      const currentWin = Math.floor(game.wager * mult);
      const safeGemsTotal = 25 - game.bombs;

      // Check for Perfect Clear!
      if (game.revealed.length >= safeGemsTotal) {
        game.gameOver = true;
        activeWebMines.delete(gameKey);

        let finalBalance = 0;
        if (authenticated) {
          addTokens(session.userId, currentWin, true);
          finalBalance = getBalance(session.userId);
        } else {
          session.demoBalance += currentWin;
          finalBalance = session.demoBalance;
        }

        recentPlayHistory.unshift({ multiplier: mult, won: true });
        if (recentPlayHistory.length > 20) recentPlayHistory.pop();

        // Record to persistent Mines Leaderboard
        recordMinesWin({
          userId: session.userId,
          username: session.username,
          avatarUrl: session.avatarUrl,
          wager: game.wager,
          bombs: game.bombs,
          gemsFound: game.revealed.length,
          multiplier: mult,
          payout: currentWin,
          profit: currentWin - game.wager,
        });

        return res.json({
          gameOver: true,
          won: true,
          gameId: game.id,
          tileIdx: idx,
          multiplier: mult,
          winAmount: currentWin,
          profit: currentWin - game.wager,
          allBombs: Array.from(game.bombIndices),
          balance: finalBalance,
        });
      }

      const nextMult = calculateMinesMultiplier(25, game.bombs, game.revealed.length + 1);
      const balance = authenticated ? getBalance(session.userId) : session.demoBalance;

      res.json({
        gameOver: false,
        isGem: true,
        gameId: game.id,
        tileIdx: idx,
        multiplier: mult,
        currentWin,
        nextMultiplier: nextMult,
        profit: currentWin - game.wager,
        revealedCount: game.revealed.length,
        safeGemsLeft: safeGemsTotal - game.revealed.length,
        balance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 4. POST /api/play/mines/cashout - Lock in Winnings & Enter Exploration Mode
  app.post('/api/play/mines/cashout', (req, res) => {
    const { authenticated, session, token } = resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { gameId } = req.body || {};
      const game = activeWebMines.get(gameKey);

      if (!game || game.gameOver || game.revealed.length === 0) {
        return res.status(400).json({ error: 'Cannot cash out without uncovering at least 1 safe gem.' });
      }

      if (gameId && game.id !== gameId) {
        return res.status(400).json({ error: 'Stale game round.' });
      }

      const winAmount = Math.floor(game.wager * game.multiplier);
      let newBalance = 0;

      if (authenticated) {
        addTokens(session.userId, winAmount, true);
        newBalance = getBalance(session.userId);
      } else {
        session.demoBalance += winAmount;
        newBalance = session.demoBalance;
      }

      // Switch to Curiosity Peek Mode so player can explore remaining tiles!
      game.cashedOut = true;
      game.peekMode = true;
      game.peekRevealed = [];

      recentPlayHistory.unshift({ multiplier: game.multiplier, won: true });
      if (recentPlayHistory.length > 20) recentPlayHistory.pop();

      // Record to persistent Mines Leaderboard
      recordMinesWin({
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        wager: game.wager,
        bombs: game.bombs,
        gemsFound: game.revealed.length,
        multiplier: game.multiplier,
        payout: winAmount,
        profit: winAmount - game.wager,
      });

      res.json({
        success: true,
        cashedOut: true,
        gameId: game.id,
        multiplier: game.multiplier,
        winAmount,
        profit: winAmount - game.wager,
        allBombs: Array.from(game.bombIndices),
        balance: newBalance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 5. POST /api/play/mines/peek - Reveal Remaining Tiles Post-Cashout
  app.post('/api/play/mines/peek', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const { tileIdx, gameId } = req.body || {};
      const idx = Number(tileIdx);

      const gameKey = authenticated ? session.userId : (token || 'demo');
      const game = activeWebMines.get(gameKey);

      if (!game || !game.peekMode) {
        return res.status(400).json({ error: 'Game not in exploration peek mode.' });
      }

      if (gameId && game.id !== gameId) {
        return res.status(400).json({ error: 'Stale game peek.' });
      }

      const isBomb = game.bombIndices.has(idx);
      if (!game.peekRevealed.includes(idx)) {
        game.peekRevealed.push(idx);
      }

      res.json({
        tileIdx: idx,
        isBomb,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. GET /api/play/mines/leaderboard - Real-time Mines Hall of Fame & Rankings
  app.get('/api/play/mines/leaderboard', (req, res) => {
    try {
      const leaderboard = getMinesLeaderboard();
      res.json(leaderboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // ORBITAL CRASH ENGINE API
  // =========================================================================

  // 7. POST /api/play/crash/start - Initialize a new Orbital Crash Flight
  app.post('/api/play/crash/start', (req, res) => {
    const { authenticated, session, token } = resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { wager, autoCashout } = req.body || {};
      const cleanBet = Math.max(10, Math.floor(Number(wager)) || 100);
      const cleanAuto = autoCashout && !isNaN(Number(autoCashout)) && Number(autoCashout) >= 1.01
        ? Math.round(Number(autoCashout) * 100) / 100
        : null;

      const currentBalance = authenticated
        ? getBalance(session.userId)
        : (session.demoBalance || 1000);

      if (currentBalance < cleanBet) {
        return res.status(400).json({
          error: `Insufficient balance! You have ${currentBalance.toLocaleString()} tokens, but bet is ${cleanBet.toLocaleString()} tokens.`,
          balance: currentBalance,
        });
      }

      // If an existing flight was still running, terminate it
      const existing = activeWebCrash.get(gameKey);
      if (existing) {
        existing.crashed = true;
        if (Array.isArray(existing.monitorResolvers)) {
          existing.monitorResolvers.forEach((fn) => {
            try { fn(); } catch {}
          });
        }
        activeWebCrash.delete(gameKey);
      }

      // Atomic Token Deduction
      let newBalance = currentBalance;
      if (authenticated) {
        deductTokens(session.userId, cleanBet);
        newBalance = getBalance(session.userId);
      } else {
        session.demoBalance -= cleanBet;
        newBalance = session.demoBalance;
      }

      const crashPoint = generateCrashMultiplier(cleanBet);
      const flightDurationMs = Math.max(100, Math.round(Math.log(crashPoint) / 0.00006));
      const flightId = 'cf_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');

      const flightState = {
        id: flightId,
        userId: session.userId,
        wager: cleanBet,
        autoCashout: cleanAuto,
        crashPoint,
        durationMs: flightDurationMs,
        startTime: Date.now(),
        cashedOut: false,
        crashed: false,
        finalMult: null,
        createdAt: Date.now(),
        monitorResolvers: [],
      };

      activeWebCrash.set(gameKey, flightState);

      res.json({
        success: true,
        flightId,
        wager: cleanBet,
        autoCashout: cleanAuto,
        balance: newBalance,
        startTime: flightState.startTime,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 8. POST /api/play/crash/monitor - Synchronous Flight Monitor
  app.post('/api/play/crash/monitor', async (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const { flightId } = req.body || {};
      const gameKey = authenticated ? session.userId : (token || 'demo');
      const flight = activeWebCrash.get(gameKey);

      if (!flight || flight.id !== flightId) {
        return res.json({ crashed: true, crashPoint: 1.00 });
      }

      if (flight.crashed || flight.cashedOut) {
        return res.json({
          crashed: flight.crashed,
          cashedOut: flight.cashedOut,
          finalMult: flight.finalMult,
          crashPoint: flight.crashPoint,
        });
      }

      const elapsed = Date.now() - flight.startTime;
      const remainingMs = Math.max(0, flight.durationMs - elapsed);

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          resolve();
        }, remainingMs);

        flight.monitorResolvers.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });

      if (!flight.cashedOut && !flight.crashed) {
        flight.crashed = true;
        activeWebCrash.delete(gameKey);
        recentCrashHistory.unshift(flight.crashPoint);
        if (recentCrashHistory.length > 20) recentCrashHistory.pop();
      }

      const balance = authenticated ? getBalance(session.userId) : session.demoBalance;

      res.json({
        crashed: !flight.cashedOut,
        cashedOut: flight.cashedOut,
        finalMult: flight.finalMult,
        crashPoint: flight.crashPoint,
        balance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. POST /api/play/crash/cashout - Lock in Flight Winnings
  app.post('/api/play/crash/cashout', (req, res) => {
    const { authenticated, session, token } = resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { flightId } = req.body || {};
      const flight = activeWebCrash.get(gameKey);

      if (!flight || flight.crashed || flight.cashedOut) {
        return res.status(400).json({ error: 'No active flight to cash out.' });
      }

      if (flightId && flight.id !== flightId) {
        return res.status(400).json({ error: 'Stale flight session.' });
      }

      const elapsedMs = Date.now() - flight.startTime;

      // Check if flight already crashed
      if (elapsedMs > flight.durationMs + 150) {
        flight.crashed = true;
        activeWebCrash.delete(gameKey);
        recentCrashHistory.unshift(flight.crashPoint);
        if (recentCrashHistory.length > 20) recentCrashHistory.pop();

        if (Array.isArray(flight.monitorResolvers)) {
          flight.monitorResolvers.forEach((fn) => {
            try { fn(); } catch {}
          });
        }

        const balance = authenticated ? getBalance(session.userId) : session.demoBalance;
        return res.json({
          crashed: true,
          crashPoint: flight.crashPoint,
          balance,
        });
      }

      let achievedMult = Math.min(flight.crashPoint, Math.exp(0.00006 * elapsedMs));
      if (flight.autoCashout && achievedMult >= flight.autoCashout) {
        achievedMult = flight.autoCashout;
      }
      achievedMult = Math.max(1.01, Math.round(achievedMult * 100) / 100);

      const winAmount = Math.floor(flight.wager * achievedMult);
      const profit = winAmount - flight.wager;

      let newBalance = 0;
      if (authenticated) {
        addTokens(session.userId, winAmount, true);
        newBalance = getBalance(session.userId);
      } else {
        session.demoBalance += winAmount;
        newBalance = session.demoBalance;
      }

      flight.cashedOut = true;
      flight.finalMult = achievedMult;

      recentCrashHistory.unshift(achievedMult);
      if (recentCrashHistory.length > 20) recentCrashHistory.pop();

      // Wake up monitor listener
      if (Array.isArray(flight.monitorResolvers)) {
        flight.monitorResolvers.forEach((fn) => {
          try { fn(); } catch {}
        });
      }

      // Record to Crash Leaderboard
      recordCrashWin({
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        wager: flight.wager,
        multiplier: achievedMult,
        payout: winAmount,
        profit,
      });

      res.json({
        success: true,
        cashedOut: true,
        flightId: flight.id,
        multiplier: achievedMult,
        winAmount,
        profit,
        crashPoint: flight.crashPoint,
        balance: newBalance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 10. GET /api/play/crash/leaderboard - Real-time Crash Hall of Fame
  app.get('/api/play/crash/leaderboard', (req, res) => {
    try {
      res.json(getCrashLeaderboard());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
