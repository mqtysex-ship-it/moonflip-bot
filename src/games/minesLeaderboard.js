import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'mines_leaderboard.json');
const TEMP_FILE = path.join(DATA_DIR, 'mines_leaderboard.tmp.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store = {
  wins: [],
  players: {},
};

let saveTimer = null;
let isSaving = false;
let pendingSave = false;

/**
 * Realistic default seed entries to ensure the leaderboard is populated and vibrant immediately.
 */
function getInitialSeedData() {
  const now = Date.now();
  const seedWins = [
    {
      id: 'seed_1',
      userId: '996534058362339512',
      username: 'ShadowStrike',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
      wager: 1000,
      bombs: 5,
      gemsFound: 7,
      multiplier: 18.52,
      payout: 18520,
      profit: 17520,
      timestamp: now - 18 * 60 * 1000,
    },
    {
      id: 'seed_2',
      userId: '1451146143038832671',
      username: 'CryptoViper',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      wager: 500,
      bombs: 10,
      gemsFound: 4,
      multiplier: 24.38,
      payout: 12190,
      profit: 11690,
      timestamp: now - 45 * 60 * 1000,
    },
    {
      id: 'seed_3',
      userId: '1188571033310085181',
      username: 'NeonPulse',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/3.png',
      wager: 2500,
      bombs: 3,
      gemsFound: 8,
      multiplier: 4.86,
      payout: 12150,
      profit: 9650,
      timestamp: now - 90 * 60 * 1000,
    },
    {
      id: 'seed_4',
      userId: '996534058362339512',
      username: 'ShadowStrike',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
      wager: 500,
      bombs: 15,
      gemsFound: 3,
      multiplier: 31.25,
      payout: 15625,
      profit: 15125,
      timestamp: now - 140 * 60 * 1000,
    },
    {
      id: 'seed_5',
      userId: '1451146143038832671',
      username: 'CryptoViper',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      wager: 200,
      bombs: 24,
      gemsFound: 1,
      multiplier: 24.25,
      payout: 4850,
      profit: 4650,
      timestamp: now - 210 * 60 * 1000,
    },
    {
      id: 'seed_6',
      userId: '1188571033310085181',
      username: 'NeonPulse',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/3.png',
      wager: 1500,
      bombs: 3,
      gemsFound: 5,
      multiplier: 2.38,
      payout: 3570,
      profit: 2070,
      timestamp: now - 320 * 60 * 1000,
    },
  ];

  const seedPlayers = {};
  for (const w of seedWins) {
    if (!seedPlayers[w.userId]) {
      seedPlayers[w.userId] = {
        userId: w.userId,
        username: w.username,
        avatarUrl: w.avatarUrl,
        totalWins: 0,
        totalWagered: 0,
        totalPayout: 0,
        totalProfit: 0,
        highestMultiplier: 0,
        highestProfit: 0,
        lastWinAt: w.timestamp,
      };
    }
    const p = seedPlayers[w.userId];
    p.totalWins += 1;
    p.totalWagered += w.wager;
    p.totalPayout += w.payout;
    p.totalProfit += w.profit;
    p.highestMultiplier = Math.max(p.highestMultiplier, w.multiplier);
    p.highestProfit = Math.max(p.highestProfit, w.profit);
    p.lastWinAt = Math.max(p.lastWinAt, w.timestamp);
  }

  return { wins: seedWins, players: seedPlayers };
}

/**
 * Initializes database from disk or seeds defaults.
 */
function initLeaderboardDb() {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    try {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.wins) && typeof parsed.players === 'object') {
        store = parsed;
        return;
      }
    } catch (err) {
      console.error('[Mines Leaderboard Load Error]', err.message);
    }
  }

  store = getInitialSeedData();
  flushLeaderboardSync();
}

/**
 * Async atomic save to avoid any event-loop blockage.
 */
async function performAsyncSave() {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;

  try {
    const payload = JSON.stringify(store, null, 2);
    await fs.promises.writeFile(TEMP_FILE, payload, 'utf-8');
    await fs.promises.rename(TEMP_FILE, LEADERBOARD_FILE);
  } catch (err) {
    try {
      await fs.promises.writeFile(LEADERBOARD_FILE, JSON.stringify(store, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error('[Mines Leaderboard Async Save Error]', writeErr.message);
    }
  } finally {
    isSaving = false;
    if (pendingSave) {
      scheduleSave(60);
    }
  }
}

function scheduleSave(delayMs = 100) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    performAsyncSave();
  }, delayMs);
}

export function flushLeaderboardSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Mines Leaderboard Sync Save Error]', err.message);
  }
}

// Initialize on module load
initLeaderboardDb();

process.on('exit', () => {
  if (saveTimer || pendingSave) {
    flushLeaderboardSync();
  }
});

/**
 * Records a successful cashout or perfect clear win into the leaderboard.
 */
export function recordMinesWin({
  userId,
  username,
  avatarUrl,
  wager,
  bombs,
  gemsFound,
  multiplier,
  payout,
  profit,
  timestamp = Date.now(),
}) {
  const cleanWager = Math.max(10, Math.floor(Number(wager)) || 100);
  const cleanBombs = Math.min(24, Math.max(1, Math.floor(Number(bombs)) || 3));
  const cleanGems = Math.max(1, Math.floor(Number(gemsFound)) || 1);
  const cleanMult = Math.max(1.0, Math.round(Number(multiplier) * 100) / 100);
  const cleanPayout = Math.max(0, Math.floor(Number(payout)) || 0);
  const cleanProfit = Math.max(0, Math.floor(Number(profit)) || (cleanPayout - cleanWager));

  const winRecord = {
    id: `win_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: userId || 'guest',
    username: username || 'Guest Player',
    avatarUrl: avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
    wager: cleanWager,
    bombs: cleanBombs,
    gemsFound: cleanGems,
    multiplier: cleanMult,
    payout: cleanPayout,
    profit: cleanProfit,
    timestamp,
  };

  store.wins.unshift(winRecord);
  // Cap raw wins log to latest 500
  if (store.wins.length > 500) {
    store.wins.pop();
  }

  // Update aggregated player profile
  const pKey = userId || `guest_${username || 'unknown'}`;
  if (!store.players[pKey]) {
    store.players[pKey] = {
      userId: pKey,
      username: username || 'Guest Player',
      avatarUrl: avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
      totalWins: 0,
      totalWagered: 0,
      totalPayout: 0,
      totalProfit: 0,
      highestMultiplier: 0,
      highestProfit: 0,
      lastWinAt: timestamp,
    };
  }

  const p = store.players[pKey];
  p.username = username || p.username;
  if (avatarUrl) p.avatarUrl = avatarUrl;
  p.totalWins += 1;
  p.totalWagered += cleanWager;
  p.totalPayout += cleanPayout;
  p.totalProfit += cleanProfit;
  p.highestMultiplier = Math.max(p.highestMultiplier, cleanMult);
  p.highestProfit = Math.max(p.highestProfit, cleanProfit);
  p.lastWinAt = timestamp;

  scheduleSave();
  return winRecord;
}

/**
 * Returns structured leaderboard categories for API and embeds.
 */
export function getMinesLeaderboard(limit = 20) {
  // 1. Top Multipliers: unique or top multiplier wins
  const topMultipliers = [...store.wins]
    .sort((a, b) => b.multiplier - a.multiplier || b.profit - a.profit)
    .slice(0, limit);

  // 2. Biggest Payouts: top single profit wins
  const topPayouts = [...store.wins]
    .sort((a, b) => b.profit - a.profit || b.multiplier - a.multiplier)
    .slice(0, limit);

  // 3. Top Players: by total profit
  const topPlayers = Object.values(store.players)
    .sort((a, b) => b.totalProfit - a.totalProfit || b.highestMultiplier - a.highestMultiplier)
    .slice(0, limit);

  // 4. Recent Wins: live recent feed
  const recentWins = [...store.wins]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return {
    topMultipliers,
    topPayouts,
    topPlayers,
    recentWins,
  };
}
