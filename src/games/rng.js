import crypto from 'crypto';

/**
 * Returns a cryptographically secure random float in [0, 1).
 */
export function secureRandomFloat() {
  const buf = crypto.randomBytes(4);
  return buf.readUInt32LE(0) / 0xffffffff;
}

/**
 * Returns a cryptographically secure random integer between min and max (inclusive).
 */
export function secureRandomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

/**
 * Combination calculation n choose k.
 */
export function combinations(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n / 2) k = n - k;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - i + 1)) / i;
  }
  return res;
}

/**
 * Calculates Mines game multiplier based on total tiles, bomb count, and gems uncovered.
 * Uses 8% House Edge (92% base RTP) to ensure strong House long-term profitability.
 */
export function calculateMinesMultiplier(totalTiles, bombs, gemsRevealed, houseEdge = 0.08) {
  if (gemsRevealed <= 0) return 1.0;
  const prob = combinations(totalTiles - bombs, gemsRevealed) / combinations(totalTiles, gemsRevealed);
  const rawMult = (1 - houseEdge) / prob;
  return Math.max(1.01, Math.floor(rawMult * 100) / 100);
}

/**
 * Generates randomized positions for bombs in a grid.
 */
export function generateMinesBombs(totalTiles, bombCount) {
  const indices = Array.from({ length: totalTiles }, (_, i) => i);
  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const bombIndices = new Set(indices.slice(0, bombCount));
  return bombIndices;
}

/**
 * Generates a Crash multiplier calibrated for a strong Pro-House edge (~78% RTP).
 * Features natural early turbulence busts and subtle altitude gravity while preserving
 * occasional exciting high-multiplier runs so gameplay feels completely organic.
 */
export function generateCrashMultiplier(totalBetAmount = 0) {
  const rand = secureRandomFloat();
  const highStakesBoost = totalBetAmount >= 1000 ? 0.035 : totalBetAmount >= 500 ? 0.015 : 0;

  // 7.5% (+ high-stakes boost) instant launchpad bust (1.00x - 1.06x)
  if (rand < 0.075 + highStakesBoost * 0.5) {
    return 1.0 + Math.floor(secureRandomFloat() * 7) / 100;
  }

  // 14% (+ high-stakes boost) early turbulence bust (1.07x - 1.48x)
  if (rand < 0.215 + highStakesBoost) {
    return Math.floor((1.07 + Math.pow(secureRandomFloat(), 1.1) * 0.41) * 100) / 100;
  }

  // Remaining curve scaled for ~79%–82% RTP with natural 2x–15x+ runs
  const u = secureRandomFloat();
  let mult = 1.02 / (1 - u * 0.96);
  if (mult > 4.0) {
    mult = 4.0 + (mult - 4.0) * 0.72;
  }
  return Math.max(1.01, Math.floor(mult * 100) / 100);
}

/**
 * Slot machine symbols with weights and payouts.
 */
export const SLOT_SYMBOLS = [
  { symbol: '💎', name: 'Diamond', weight: 7, payout3: 30, payout2: 3 },
  { symbol: '7️⃣', name: 'Seven', weight: 11, payout3: 15, payout2: 2.5 },
  { symbol: '🔔', name: 'Bell', weight: 17, payout3: 10, payout2: 2 },
  { symbol: '🍇', name: 'Grapes', weight: 23, payout3: 5, payout2: 1.5 },
  { symbol: '🍒', name: 'Cherry', weight: 31, payout3: 3, payout2: 1.2 },
  { symbol: '🍋', name: 'Lemon', weight: 38, payout3: 2, payout2: 1.1 },
];

export function spinSlots() {
  const pool = [];
  for (const s of SLOT_SYMBOLS) {
    for (let i = 0; i < s.weight; i++) {
      pool.push(s);
    }
  }

  const pickFromPool = (excludeSymbols = []) => {
    if (excludeSymbols.length === 0) {
      return pool[secureRandomInt(0, pool.length - 1)];
    }
    const filtered = pool.filter((item) => !excludeSymbols.includes(item.symbol));
    return filtered[secureRandomInt(0, filtered.length - 1)];
  };

  const s1 = pickFromPool();
  let s2 = pickFromPool();
  let s3 = pickFromPool();

  // Subtle Pro-House Reel Slip (~80% RTP / ~20% House Edge):
  // Converts a small fraction of raw matches into exciting near-misses so players still hit
  // frequent pair wins (~43% hit rate) while the House holds a steady ~20% mathematical edge.
  if (s1.symbol === s2.symbol && s2.symbol === s3.symbol) {
    if (secureRandomFloat() < 0.25) {
      s3 = pickFromPool([s1.symbol]);
    }
  } else if (s1.symbol === s2.symbol || s2.symbol === s3.symbol || s1.symbol === s3.symbol) {
    const matchedSym = s1.symbol === s2.symbol ? s1 : s1.symbol === s3.symbol ? s1 : s2;
    const slipProb = matchedSym.payout2 >= 2.0 ? 0.22 : 0.16;
    if (secureRandomFloat() < slipProb) {
      if (s1.symbol === s2.symbol) {
        s2 = pickFromPool([s1.symbol, s3.symbol]);
      } else {
        s3 = pickFromPool([s1.symbol, s2.symbol]);
      }
    }
  }

  // Check 3 matching
  if (s1.symbol === s2.symbol && s2.symbol === s3.symbol) {
    return {
      reels: [s1.symbol, s2.symbol, s3.symbol],
      multiplier: s1.payout3,
      matches: 3,
      symbolName: s1.name,
    };
  }

  // Check 2 matching
  if (s1.symbol === s2.symbol || s2.symbol === s3.symbol) {
    const matchSymbol = s2;
    return {
      reels: [s1.symbol, s2.symbol, s3.symbol],
      multiplier: matchSymbol.payout2,
      matches: 2,
      symbolName: matchSymbol.name,
    };
  }
  if (s1.symbol === s3.symbol) {
    const matchSymbol = s1;
    return {
      reels: [s1.symbol, s2.symbol, s3.symbol],
      multiplier: matchSymbol.payout2,
      matches: 2,
      symbolName: matchSymbol.name,
    };
  }

  return {
    reels: [s1.symbol, s2.symbol, s3.symbol],
    multiplier: 0,
    matches: 0,
    symbolName: null,
  };
}

/**
 * Draws Keno numbers (between 1 and totalBalls, default 40, draw 10).
 */
export function drawKenoNumbers(totalBalls = 40, drawCount = 10) {
  const balls = Array.from({ length: totalBalls }, (_, i) => i + 1);
  for (let i = balls.length - 1; i > 0; i--) {
    const j = secureRandomInt(0, i);
    [balls[i], balls[j]] = [balls[i], balls[i]];
  }
  return balls.slice(0, drawCount).sort((a, b) => a - b);
}

/**
 * Coinflip simulation with subtle Pro-House edge.
 * If playerChoice ('heads' | 'tails') and context are provided, applies a calibrated
 * house edge (~44% base win probability, scaling down slightly on streaks/high wagers)
 * while feeling completely natural.
 */
export function flipCoin(playerChoice = null, betAmount = 100, currentStreak = 0) {
  if (!playerChoice) {
    return secureRandomInt(0, 1) === 0 ? 'heads' : 'tails';
  }
  const choice = String(playerChoice).toLowerCase().startsWith('t') ? 'tails' : 'heads';
  const opposite = choice === 'heads' ? 'tails' : 'heads';

  // Base win rate: 44.5% (giving ~85.4% RTP at 1.92x payout -> ~14.6% House Edge)
  let winProb = 0.445;

  // Subtle streak & high-wager gravity to prevent runaway martingale/streak farming
  if (currentStreak >= 2) {
    winProb -= Math.min(0.10, (currentStreak - 1) * 0.035);
  }
  if (betAmount >= 1000) {
    winProb -= 0.03;
  } else if (betAmount >= 500) {
    winProb -= 0.015;
  }

  return secureRandomFloat() < winProb ? choice : opposite;
}
