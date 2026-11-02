import { databasePool } from '../database.js';
import { readDocument, updateDocument } from '../documentStore.js';
import fs from 'fs';
import { getDataDirectory } from '../dataDirectory.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from 'discord.js';
import { createWebPlaySession, getPublicBaseUrl } from '../web/playApi.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = getDataDirectory();
const LEADERBOARD_FILE = path.join(DATA_DIR, 'crash_leaderboard.json');
const TEMP_FILE = path.join(DATA_DIR, 'crash_leaderboard.tmp.json');

if (!databasePool && !fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let store = {
  wins: [],
  players: {},
};

let saveTimer = null;
let isSaving = false;
let pendingSave = false;

function getInitialSeedData() {
  const now = Date.now();
  const seedWins = [
    {
      id: 'crash_seed_1',
      userId: '996534058362339512',
      username: 'ShadowStrike',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
      wager: 1500,
      multiplier: 38.45,
      payout: 57675,
      profit: 56175,
      timestamp: now - 22 * 60 * 1000,
    },
    {
      id: 'crash_seed_2',
      userId: '1451146143038832671',
      username: 'CryptoViper',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      wager: 2500,
      multiplier: 14.80,
      payout: 37000,
      profit: 34500,
      timestamp: now - 58 * 60 * 1000,
    },
    {
      id: 'crash_seed_3',
      userId: '1188571033310085181',
      username: 'NeonPulse',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/3.png',
      wager: 5000,
      multiplier: 5.60,
      payout: 28000,
      profit: 23000,
      timestamp: now - 110 * 60 * 1000,
    },
    {
      id: 'crash_seed_4',
      userId: '996534058362339512',
      username: 'ShadowStrike',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png',
      wager: 500,
      multiplier: 72.10,
      payout: 36050,
      profit: 35550,
      timestamp: now - 180 * 60 * 1000,
    },
    {
      id: 'crash_seed_5',
      userId: '1451146143038832671',
      username: 'CryptoViper',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
      wager: 3000,
      multiplier: 3.25,
      payout: 9750,
      profit: 6750,
      timestamp: now - 240 * 60 * 1000,
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

function initCrashLeaderboardDb() {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    try {
      const raw = fs.readFileSync(LEADERBOARD_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.wins) && typeof parsed.players === 'object') {
        store = parsed;
        return;
      }
    } catch (err) {
      console.error('[Crash Leaderboard Load Error]', err.message);
    }
  }

  store = getInitialSeedData();
  flushCrashLeaderboardSync();
}

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
      console.error('[Crash Leaderboard Async Save Error]', writeErr.message);
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

export function flushCrashLeaderboardSync() {
  if (databasePool) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Crash Leaderboard Sync Save Error]', err.message);
  }
}

if (!databasePool) initCrashLeaderboardDb();

process.on('exit', () => {
  if (saveTimer || pendingSave) {
    flushCrashLeaderboardSync();
  }
});

export function recordCrashWin(input) {
  if (databasePool) return updateDocument('crash_leaderboard', { wins: [], players: {} }, data => recordCrashWinInto(data, input));
  const result = recordCrashWinInto(store, input);
  scheduleSave();
  return result;
}

function recordCrashWinInto(target, {
  id,
  userId,
  username,
  avatarUrl,
  wager,
  multiplier,
  payout,
  profit,
  timestamp = Date.now(),
}) {
  if (id && target.recordedIds?.[id]) return target.wins.find(win => win.id === id) ?? { id };
  const cleanWager = Math.max(10, Math.floor(Number(wager)) || 100);
  const cleanMult = Math.max(1.0, Math.round(Number(multiplier) * 100) / 100);
  const cleanPayout = Math.max(0, Math.floor(Number(payout)) || 0);
  const cleanProfit = Math.max(0, Math.floor(Number(profit)) || (cleanPayout - cleanWager));

  const winRecord = {
    id: id || `cwin_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    userId: userId || 'guest',
    username: username || 'Guest Player',
    avatarUrl: avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
    wager: cleanWager,
    multiplier: cleanMult,
    payout: cleanPayout,
    profit: cleanProfit,
    timestamp,
  };

  target.wins.unshift(winRecord);
  if (target.wins.length > 500) {
    target.wins.pop();
  }

  const pKey = userId || `guest_${username || 'unknown'}`;
  if (!target.players[pKey]) {
    target.players[pKey] = {
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

  const p = target.players[pKey];
  p.username = username || p.username;
  if (avatarUrl) p.avatarUrl = avatarUrl;
  p.totalWins += 1;
  p.totalWagered += cleanWager;
  p.totalPayout += cleanPayout;
  p.totalProfit += cleanProfit;
  p.highestMultiplier = Math.max(p.highestMultiplier, cleanMult);
  p.highestProfit = Math.max(p.highestProfit, cleanProfit);
  p.lastWinAt = timestamp;

  if (id) { target.recordedIds ??= {}; target.recordedIds[id] = true; }
  return winRecord;
}

export function getCrashLeaderboard(limit = 20) {
  if (databasePool) return readDocument('crash_leaderboard', { wins: [], players: {} }).then(data => formatCrashLeaderboard(data, limit));
  return formatCrashLeaderboard(store, limit);
}

function formatCrashLeaderboard(data, limit = 20) {
  const topMultipliers = [...data.wins]
    .sort((a, b) => b.multiplier - a.multiplier || b.profit - a.profit)
    .slice(0, limit);

  const topPayouts = [...data.wins]
    .sort((a, b) => b.profit - a.profit || b.multiplier - a.multiplier)
    .slice(0, limit);

  const topPlayers = Object.values(data.players)
    .sort((a, b) => b.totalProfit - a.totalProfit || b.highestMultiplier - a.highestMultiplier)
    .slice(0, limit);

  const recentWins = [...data.wins]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);

  return {
    topMultipliers,
    topPayouts,
    topPlayers,
    recentWins,
  };
}

export async function showCrashLeaderboard(interaction) {
  const lb = await getCrashLeaderboard();
  const topMults = (lb.topMultipliers || []).slice(0, 5);
  const topProfits = (lb.topPayouts || []).slice(0, 5);

  let multList = '';
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  for (let i = 0; i < topMults.length; i++) {
    const entry = topMults[i];
    const medal = medals[i] || `#${i + 1}`;
    multList += `${medal} **${entry.username}** — **\`${entry.multiplier.toFixed(2)}×\`** *(+${entry.profit.toLocaleString()} 🪙 • ${entry.wager.toLocaleString()} bet)*\n`;
  }
  if (!multList) multList = '*No multipliers recorded yet.*';

  let profitList = '';
  for (let i = 0; i < topProfits.length; i++) {
    const entry = topProfits[i];
    const medal = medals[i] || `#${i + 1}`;
    profitList += `${medal} **${entry.username}** — **\`+${entry.profit.toLocaleString()} 🪙\`** *(Wager: ${entry.wager.toLocaleString()} • ${entry.multiplier.toFixed(2)}×)*\n`;
  }
  if (!profitList) profitList = '*No payouts recorded yet.*';

  const embed = new EmbedBuilder()
    .setColor(0xff9900)
    .setTitle('🚀  ORBITAL CRASH — HALL OF FAME')
    .setDescription(
      `> **Official Hall of Fame: Highest Flight Multipliers & Biggest Wins!** 🚀🌌\n\n` +
      `🔥 **TOP ORBITAL FLIGHTS**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${multList}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 **BIGGEST TOKEN PAYOUTS**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${profitList}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({ text: 'Moonflip Crash • Real-Time Synchronized' })
    .setTimestamp();

  const token = await createWebPlaySession(interaction.user);
  const baseUrl = getPublicBaseUrl(interaction);
  const playUrl = `${baseUrl}/play?game=crash&token=${token}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🚀 Launch Orbital Crash')
      .setStyle(ButtonStyle.Link)
      .setURL(playUrl),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 My Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}
