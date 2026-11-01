import crypto from 'crypto';
import { generateMinesBombs, calculateMinesMultiplier } from '../games/rng.js';
import { getBalance, deductTokens, addTokens, getUser } from '../games/economy.js';

export const webPlaySessions = new Map();
export const activeWebMines = new Map();

// Recent win/loss multipliers feed for live history ticker
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

// Clean up expired sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, sess] of webPlaySessions.entries()) {
    if (sess.expiresAt < now) {
      webPlaySessions.delete(token);
      if (sess.userId) activeWebMines.delete(sess.userId);
    }
  }
}, 10 * 60 * 1000);

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
      const { authenticated, session } = resolvePlayer(req);
      const balance = authenticated ? getBalance(session.userId) : (session.demoBalance || 1000);
      const activeGame = authenticated && session.userId ? activeWebMines.get(session.userId) : null;

      let safeGame = null;
      if (activeGame && !activeGame.gameOver) {
        safeGame = {
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

      res.json({
        authenticated,
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        balance,
        activeGame: safeGame,
        history: recentPlayHistory.slice(0, 10),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /api/play/mines/start - Initialize a new 5x5 Mines Round
  app.post('/api/play/mines/start', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
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
      const gameKey = authenticated ? session.userId : (token || 'demo');

      const gameState = {
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
        wager: cleanBet,
        bombs: cleanBombs,
        multiplier: 1.0,
        currentWin: cleanBet,
        nextMultiplier: nextMult,
        balance: newBalance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. POST /api/play/mines/reveal - Click a Tile (0..24)
  app.post('/api/play/mines/reveal', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const { tileIdx } = req.body || {};
      const idx = Number(tileIdx);

      if (isNaN(idx) || idx < 0 || idx > 24) {
        return res.status(400).json({ error: 'Invalid tile index (0 to 24 required)' });
      }

      const gameKey = authenticated ? session.userId : (token || 'demo');
      const game = activeWebMines.get(gameKey);

      if (!game || game.gameOver) {
        return res.status(400).json({ error: 'No active game in progress. Start a new bet!' });
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

        return res.json({
          gameOver: true,
          won: true,
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
    }
  });

  // 4. POST /api/play/mines/cashout - Lock in Winnings & Enter Exploration Mode
  app.post('/api/play/mines/cashout', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const gameKey = authenticated ? session.userId : (token || 'demo');
      const game = activeWebMines.get(gameKey);

      if (!game || game.gameOver || game.revealed.length === 0) {
        return res.status(400).json({ error: 'Cannot cash out without uncovering at least 1 safe gem.' });
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

      res.json({
        success: true,
        cashedOut: true,
        multiplier: game.multiplier,
        winAmount,
        profit: winAmount - game.wager,
        allBombs: Array.from(game.bombIndices),
        balance: newBalance,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. POST /api/play/mines/peek - Reveal Remaining Tiles Post-Cashout
  app.post('/api/play/mines/peek', (req, res) => {
    try {
      const { authenticated, session, token } = resolvePlayer(req);
      const { tileIdx } = req.body || {};
      const idx = Number(tileIdx);

      const gameKey = authenticated ? session.userId : (token || 'demo');
      const game = activeWebMines.get(gameKey);

      if (!game || !game.peekMode) {
        return res.status(400).json({ error: 'Game not in exploration peek mode.' });
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
}
