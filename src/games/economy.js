import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EventEmitter } from 'events';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'economy.json');
const TEMP_FILE = path.join(DATA_DIR, 'economy.tmp.json');

// Global Economy Event Emitter for ultra-fast real-time SSE stream synchronization
export const economyEvents = new EventEmitter();
economyEvents.setMaxListeners(200);

// Ensure data directory exists once at startup
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = { users: {} };
let saveTimer = null;
let isSaving = false;
let pendingSave = false;

/**
 * Loads database once at startup into memory for 0ms O(1) reads.
 */
function initDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.users === 'object') {
        db = parsed;
      }
    } catch (err) {
      console.error('[Economy DB Load Error]', err.message);
    }
  } else {
    flushDbSync();
  }
}

/**
 * Non-blocking asynchronous atomic disk persistence (debounced).
 * Coalesces rapid game updates into a single background write so the Node.js event loop never blocks.
 */
async function performAsyncSave() {
  if (isSaving) {
    pendingSave = true;
    return;
  }
  isSaving = true;
  pendingSave = false;

  try {
    const payload = JSON.stringify(db, null, 2);
    await fs.promises.writeFile(TEMP_FILE, payload, 'utf-8');
    await fs.promises.rename(TEMP_FILE, DATA_FILE);
  } catch (err) {
    // Fallback direct write if rename across locks fails on Windows
    try {
      await fs.promises.writeFile(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
    } catch (writeErr) {
      console.error('[Economy DB Async Save Error]', writeErr.message);
    }
  } finally {
    isSaving = false;
    if (pendingSave) {
      scheduleSave(50);
    }
  }
}

function scheduleSave(delayMs = 80) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    performAsyncSave();
  }, delayMs);
}

/**
 * Synchronous flush used only on process exit or initial creation.
 */
export function flushDbSync() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Economy DB Sync Save Error]', err.message);
  }
}

export function saveEconomyDb() {
  scheduleSave();
}

// Initialize in-memory store immediately
initDb();

// Guarantee in-memory changes are flushed on graceful exit
process.on('exit', () => {
  if (saveTimer || pendingSave) {
    flushDbSync();
  }
});

const STARTING_BALANCE = 1000;
const DAILY_AMOUNT = 500;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getEconomyStats() {
  let totalTokens = 0;
  let totalWagered = 0;
  let totalGamesPlayed = 0;
  const userList = Object.values(db.users || {});
  for (const u of userList) {
    totalTokens += u.balance || 0;
    totalWagered += u.totalBet || 0;
    totalGamesPlayed += u.gamesPlayed || 0;
  }
  return {
    totalTokens,
    totalWagered,
    totalGamesPlayed,
    totalUsers: userList.length,
  };
}

export function getEconomyPlayers() {
  return Object.entries(db.users || {}).map(([userId, data]) => ({
    userId,
    username: data.username || null,
    avatarUrl: data.avatarUrl || null,
    balance: data.balance || 0,
    totalBet: data.totalBet || 0,
    totalWon: data.totalWon || 0,
    gamesPlayed: data.gamesPlayed || 0,
    lastDaily: data.lastDaily || null,
    createdAt: data.createdAt || null,
  })).sort((a, b) => b.balance - a.balance);
}

export function setUserMeta(userId, username, avatarUrl) {
  if (!userId) return;
  const user = getUser(userId);
  let changed = false;
  if (username && user.username !== username) {
    user.username = username;
    changed = true;
  }
  if (avatarUrl && user.avatarUrl !== avatarUrl) {
    user.avatarUrl = avatarUrl;
    changed = true;
  }
  if (changed) {
    scheduleSave();
  }
  return user;
}

function emitEconomyChange(userId, action, amount) {
  process.nextTick(() => {
    economyEvents.emit('balanceChanged', {
      userId,
      action,
      amount,
      balance: db.users[userId]?.balance ?? 0,
      stats: getEconomyStats(),
      timestamp: Date.now(),
    });
  });
}

export function getUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: STARTING_BALANCE,
      lastDaily: 0,
      totalBet: 0,
      totalWon: 0,
      gamesPlayed: 0,
      xp: 0,
      level: 1,
      createdAt: Date.now(),
    };
    scheduleSave();
    emitEconomyChange(userId, 'create', STARTING_BALANCE);
  }
  return db.users[userId];
}

export function getAllUsers() {
  return db.users;
}

export function getBalance(userId) {
  return getUser(userId).balance;
}

export function deductTokens(userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount) || 0);
  const user = getUser(userId);
  if (user.balance < cleanAmount) {
    return false;
  }
  user.balance -= cleanAmount;
  user.totalBet = (user.totalBet || 0) + cleanAmount;
  user.gamesPlayed = (user.gamesPlayed || 0) + 1;
  scheduleSave();
  emitEconomyChange(userId, 'deduct', cleanAmount);
  return true;
}

export function addTokens(userId, amount, countAsWin = true) {
  const cleanAmount = Math.max(0, Math.floor(amount) || 0);
  const user = getUser(userId);
  user.balance += cleanAmount;
  if (countAsWin) {
    user.totalWon = (user.totalWon || 0) + cleanAmount;
  }
  scheduleSave();
  emitEconomyChange(userId, 'add', cleanAmount);
  return user.balance;
}

export function setBalance(userId, amount) {
  const user = getUser(userId);
  user.balance = Math.max(0, Math.floor(amount) || 0);
  scheduleSave();
  emitEconomyChange(userId, 'set', user.balance);
  return user.balance;
}

export function transferTokens(fromUserId, toUserId, amount) {
  const cleanAmount = Math.floor(amount) || 0;
  if (cleanAmount <= 0) return { success: false, error: 'Amount must be greater than 0.' };
  const sender = getUser(fromUserId);
  if (sender.balance < cleanAmount) return { success: false, error: 'Insufficient balance.' };

  sender.balance -= cleanAmount;
  const receiver = getUser(toUserId);
  receiver.balance += cleanAmount;
  scheduleSave();
  emitEconomyChange(fromUserId, 'transfer_out', cleanAmount);
  emitEconomyChange(toUserId, 'transfer_in', cleanAmount);
  return { success: true, senderBalance: sender.balance, receiverBalance: receiver.balance };
}

export function claimDaily(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const elapsed = now - (user.lastDaily || 0);

  if (elapsed < DAILY_COOLDOWN_MS) {
    const remainingMs = DAILY_COOLDOWN_MS - elapsed;
    const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
    const remainingMinutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return {
      success: false,
      remainingHours,
      remainingMinutes,
    };
  }

  user.lastDaily = now;
  user.balance += DAILY_AMOUNT;
  scheduleSave();
  emitEconomyChange(userId, 'daily', DAILY_AMOUNT);

  return {
    success: true,
    amount: DAILY_AMOUNT,
    newBalance: user.balance,
  };
}

export function getLeaderboard(limit = 10) {
  return Object.entries(db.users)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}
