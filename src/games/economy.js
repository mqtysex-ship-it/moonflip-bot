import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'economy.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = { users: {} };

function loadDb() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      db = JSON.parse(raw);
    } catch {
      db = { users: {} };
    }
  } else {
    saveDb();
  }
}

function saveDb() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Economy DB Save Error]', err.message);
  }
}

loadDb();

const STARTING_BALANCE = 1000;
const DAILY_AMOUNT = 500;
const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getUser(userId) {
  loadDb();
  if (!db.users[userId]) {
    db.users[userId] = {
      balance: STARTING_BALANCE,
      lastDaily: 0,
      totalBet: 0,
      totalWon: 0,
      gamesPlayed: 0,
      createdAt: Date.now(),
    };
    saveDb();
  }
  return db.users[userId];
}

export function getBalance(userId) {
  const user = getUser(userId);
  return user.balance;
}

export function deductTokens(userId, amount) {
  const user = getUser(userId);
  if (user.balance < amount) {
    return false;
  }
  user.balance -= amount;
  user.totalBet += amount;
  user.gamesPlayed += 1;
  saveDb();
  return true;
}

export function addTokens(userId, amount) {
  const user = getUser(userId);
  user.balance += amount;
  user.totalWon = (user.totalWon || 0) + amount;
  saveDb();
  return user.balance;
}

export function setBalance(userId, amount) {
  const user = getUser(userId);
  user.balance = Math.max(0, amount);
  saveDb();
  return user.balance;
}

export function transferTokens(fromUserId, toUserId, amount) {
  if (amount <= 0) return { success: false, error: 'Amount must be greater than 0.' };
  const sender = getUser(fromUserId);
  if (sender.balance < amount) return { success: false, error: 'Insufficient balance.' };
  
  sender.balance -= amount;
  const receiver = getUser(toUserId);
  receiver.balance += amount;
  saveDb();
  return { success: true, senderBalance: sender.balance, receiverBalance: receiver.balance };
}

export function claimDaily(userId) {
  const user = getUser(userId);
  const now = Date.now();
  const elapsed = now - user.lastDaily;

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
  saveDb();

  return {
    success: true,
    amount: DAILY_AMOUNT,
    newBalance: user.balance,
  };
}

export function getLeaderboard(limit = 10) {
  const sorted = Object.entries(db.users)
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
  return sorted;
}
