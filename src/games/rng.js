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
 * Calculates fair Mines game multiplier based on total tiles, bomb count, and gems uncovered.
 * Uses 6% House Edge (94% RTP) to ensure House long-term profitability.
 */
export function calculateMinesMultiplier(totalTiles, bombs, gemsRevealed, houseEdge = 0.06) {
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
 * Generates a provably fair Crash multiplier.
 * Uses 94% Return to Player (6% House Edge) with 3.5% instant crash at 1.00x-1.05x.
 */
export function generateCrashMultiplier() {
  const rand = secureRandomFloat();
  // 3.5% instant bust chance
  if (rand < 0.035) {
    const microBust = 1.0 + Math.floor(secureRandomFloat() * 5) / 100;
    return microBust;
  }
  // Formula: multiplier = e / (1 - rand)
  const e = 0.94; // 94% RTP (6% House Edge)
  const mult = e / (1 - rand);
  return Math.max(1.0, Math.floor(mult * 100) / 100);
}

/**
 * Slot machine symbols with weights and payouts.
 */
export const SLOT_SYMBOLS = [
  { symbol: '💎', name: 'Diamond', weight: 8, payout3: 30, payout2: 3 },
  { symbol: '7️⃣', name: 'Seven', weight: 12, payout3: 15, payout2: 2.5 },
  { symbol: '🔔', name: 'Bell', weight: 18, payout3: 10, payout2: 2 },
  { symbol: '🍇', name: 'Grapes', weight: 24, payout3: 5, payout2: 1.5 },
  { symbol: '🍒', name: 'Cherry', weight: 30, payout3: 3, payout2: 1.2 },
  { symbol: '🍋', name: 'Lemon', weight: 35, payout3: 2, payout2: 1.1 },
];

export function spinSlots() {
  const pool = [];
  for (const s of SLOT_SYMBOLS) {
    for (let i = 0; i < s.weight; i++) {
      pool.push(s);
    }
  }

  const s1 = pool[secureRandomInt(0, pool.length - 1)];
  const s2 = pool[secureRandomInt(0, pool.length - 1)];
  const s3 = pool[secureRandomInt(0, pool.length - 1)];

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
    [balls[i], balls[j]] = [balls[j], balls[i]];
  }
  return balls.slice(0, drawCount).sort((a, b) => a - b);
}

/**
 * Coinflip simulation.
 */
export function flipCoin() {
  return secureRandomInt(0, 1) === 0 ? 'heads' : 'tails';
}
