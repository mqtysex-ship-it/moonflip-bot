import { LiveChatRain } from '../games/liveChatRain.js';
import { setupLiveChatApi } from './liveChatApi.js';
import { LiveChatStore } from '../games/liveChatStore.js';
import { setupPlayerFeaturesApi } from './playerFeaturesApi.js';
import { setupRewardsApi } from './rewardsApi.js';
import { setupInstantGameApi } from './instantGameApi.js';
import crypto from 'crypto';
import { signSession, verifySession } from './sessionSecurity.js';
import { createSessionRegistry } from './sessionRegistry.js';
import { EmbedBuilder } from 'discord.js';
import { generateMinesBombs, calculateMinesMultiplier, generateCrashMultiplier } from '../games/rng.js';
import { getBalance, deductTokens, addTokens, getUser, setUserMeta, economyEvents, databaseEconomy } from '../games/economy.js';
import { recordMinesWin, getMinesLeaderboard } from '../games/minesLeaderboard.js';
import { recordCrashWin, getCrashLeaderboard } from '../games/crashLeaderboard.js';
import { getDiscordClient } from '../discord.js';
import { databasePool } from '../database.js';
import { PersistentMines } from '../games/persistentMines.js';
import { activeCrashFlights } from '../games/continuousCrash.js';
import { readDocument, writeDocument } from '../documentStore.js';

const sessionRegistry = createSessionRegistry({ read: readDocument, write: writeDocument });

export const webPlaySessions = new Map();
export const activeWebMines = new Map();
export const activeWebCrash = new Map();
const guestBalances = new Map();

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
export const recentCrashHistory = [2.45, 1.18, 8.45, 1.85, 12.50, 3.20, 1.42, 4.60, 2.15, 19.40];

// Active SSE Clients for Web Arena (/api/play/stream)
const arenaSseClients = new Set();

function broadcastArenaEvent(eventName, payload, demo = null) {
  if (arenaSseClients.size === 0) return;
  const msg = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of arenaSseClients) {
    if (demo !== null && demo !== !client.userId) continue;
    try {
      client.res.write(msg);
    } catch {
      arenaSseClients.delete(client);
    }
  }
}

// Forward live Discord / Dashboard wallet balance updates to the specific Web Arena player at 0ms
economyEvents.on('balanceChanged', (change) => {
  if (!change || !change.userId || arenaSseClients.size === 0) return;
  const msg = `event: wallet\ndata: ${JSON.stringify({
    userId: change.userId,
    balance: change.balance,
    action: change.action,
    amount: change.amount,
    timestamp: Date.now(),
  })}\n\n`;

  for (const client of arenaSseClients) {
    if (client.userId === change.userId) {
      client.walletDelivery = (client.walletDelivery || Promise.resolve()).then(async () => {
        if (!client.res.writableEnded && await ensureActiveStream(client)) client.res.write(msg);
      }).catch(() => client.res.end());
    }
  }
});

async function ensureActiveStream(client) {
  if (!databasePool || !client.userId) return true;
  const active = !!verifyTokenPayload(client.token) && await sessionRegistry.isActive(client.userId, client.token);
  if (!active) client.res.end();
  return active;
}

// ============================================================================
// CRYPTOGRAPHIC STATELESS SESSION TOKENS (SURVIVES SERVER RESTARTS / REDEPLOYS)
// ============================================================================

// Without configured credentials, never use a public signing key. Sessions in
// this development-only case intentionally stop working after a restart.
const ephemeralSigningSecret = crypto.randomBytes(32).toString('hex');
function getSigningSecret() {
  const secret = process.env.WEB_SESSION_SECRET;
  if ((!secret || secret.length < 32) && process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('WEB_SESSION_SECRET must contain at least 32 characters');
  return secret || ephemeralSigningSecret;
}

function signTokenPayload(payloadObj) {
  return signSession(payloadObj, getSigningSecret());
}

function verifyTokenPayload(token) {
  return verifySession(token, getSigningSecret());
}

export function createWebPlaySession(userOrId, maybeUsername, maybeAvatarUrl) {
  const user =
    typeof userOrId === 'object' && userOrId !== null
      ? userOrId
      : { id: userOrId, username: maybeUsername, avatarUrl: maybeAvatarUrl };

  const avatarUrl =
    typeof user.displayAvatarURL === 'function'
      ? user.displayAvatarURL({ extension: 'png', size: 128 })
      : user.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';

  // Persist user profile metadata into economy DB so it survives restarts
  const metadataSave = setUserMeta(user.id, user.username, avatarUrl);

  const token = signTokenPayload({
    u: String(user.id),
    n: String(user.username || 'Player'),
    a: String(avatarUrl),
    t: Date.now(),
    nonce: crypto.randomBytes(24).toString('base64url'),
  });

  const session = {
    userId: String(user.id),
    username: String(user.username || 'Player'),
    avatarUrl,
    createdAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
    demoBalance: 1000,
  };
  if (databasePool) return Promise.resolve(metadataSave).then(async () => {
    await sessionRegistry.activate(session.userId, token);
    for (const client of arenaSseClients) {
      if (client.userId === session.userId && client.token !== token) client.res.end();
    }
    return token;
  });
  webPlaySessions.set(token, session);
  return metadataSave && typeof metadataSave.then === 'function' ? metadataSave.then(() => token) : token;
}

export function getPublicBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
  return 'https://moonflip-bot-8clx.onrender.com';
}

async function resolvePlayer(req) {
  const token = req.headers['x-play-token'] || req.query?.token || req.body?.token;

  // 1. Check in-memory session map first (supports custom test tokens & cached tokens)
  if (!databasePool && token && webPlaySessions.has(token)) {
    const sess = webPlaySessions.get(token);
    if ((!sess.expiresAt || sess.expiresAt > Date.now()) && (!token.startsWith('mf1.') || verifyTokenPayload(token))) {
      return { authenticated: true, session: sess, token };
    }
  }

  // 2. Verify stateless HMAC-signed token (survives server restarts & Render deploys!)
  const verified = verifyTokenPayload(token);
  if (verified && verified.u && (!databasePool || await sessionRegistry.isActive(String(verified.u), token))) {
    const dbUser = await getUser(verified.u);
    const session = {
      userId: String(verified.u),
      username: verified.n || dbUser.username || 'Discord Player',
      avatarUrl: verified.a || dbUser.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
      createdAt: verified.t || Date.now(),
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };
    await setUserMeta(session.userId, session.username, session.avatarUrl);
    if (!databasePool) webPlaySessions.set(token, session);
    return { authenticated: true, session, token };
  }

  // 3. Persistent Demo Guest Session (keyed by guestId or IP so demo balance doesn't reset every click)
  const rawGuestId = req.headers['x-guest-id'] || req.query?.guestId || req.body?.guestId;
  const guestId = (typeof rawGuestId === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(rawGuestId))
    ? rawGuestId
    : (req.ip || 'default_guest');
  const guestKey = `guest:${guestId}`;

  const now = Date.now();
  if (guestBalances.get(guestKey)?.expiresAt <= now) evictGuest(guestKey);
  if (!guestBalances.has(guestKey)) {
    if (guestBalances.size >= 2000) {
      const oldestKey = guestBalances.keys().next().value;
      if (oldestKey) evictGuest(oldestKey);
    }
    guestBalances.set(guestKey, {
      userId: guestKey,
      username: 'Guest Player',
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
      demoBalance: 1000,
    });
  }

  guestBalances.get(guestKey).expiresAt = now + 15 * 60_000;

  return {
    authenticated: false,
    session: guestBalances.get(guestKey),
    token: null,
    guestKey,
  };
}

// ============================================================================
// DISCORD SERVER LIVE WIN FEED BROADCASTER
// ============================================================================

let lastDiscordBroadcastAt = 0;

async function broadcastWinToDiscord({ game, username, userId, avatarUrl, wager, multiplier, payout, profit }) {
  // Broadcast wins to Discord if authenticated and either profit >= 250 or multiplier >= 2.0x (throttled to avoid rate-limits)
  if (!userId || String(userId).startsWith('test_')) return;
  if (profit < 150 && multiplier < 1.8) return;

  const now = Date.now();
  if (now - lastDiscordBroadcastAt < 4000) return;
  lastDiscordBroadcastAt = now;

  try {
    const client = await getDiscordClient().catch(() => null);
    if (!client || !client.isReady()) return;

    const guild = client.guilds.cache.first();
    if (!guild) return;

    // Never post win announcements to game rooms (#mines, #crash)!
    // Win broadcasts are routed exclusively to a dedicated wins feed channel (e.g. #live-wins, #big-wins, #casino-feed).
    // If no dedicated wins channel exists, do not broadcast to Discord.
    const channel = guild.channels.cache.find(
      (c) =>
        c.isTextBased?.() &&
        !c.name?.toLowerCase().includes('mines') &&
        !c.name?.toLowerCase().includes('crash') &&
        (c.name?.toLowerCase().includes('live-wins') ||
          c.name?.toLowerCase().includes('big-wins') ||
          c.name?.toLowerCase().includes('casino-feed') ||
          c.name?.toLowerCase().includes('arena-wins') ||
          c.name?.toLowerCase().includes('wins'))
    );
    if (!channel) return;

    const isCrash = game === 'crash';
    const embed = new EmbedBuilder()
      .setColor(multiplier >= 10 ? 0xffd700 : isCrash ? 0xff9900 : 0x00e701)
      .setAuthor({
        name: `${username} • Live Web Arena Win`,
        iconURL: avatarUrl || undefined,
      })
      .setDescription(
        `${isCrash ? '🚀 **ORBITAL CRASH CASHOUT**' : '💎 **5x5 MINES CASHOUT**'} — <@${userId}> locked in **\`${multiplier.toFixed(2)}×\`** for **\`+${payout.toLocaleString()} 🪙\`** *(Net Profit: **\`+${profit.toLocaleString()} 🪙\`**, Wager: \`${wager.toLocaleString()} 🪙\`)*!`
      )
      .setFooter({ text: 'Moonflip Web Arena • Instant Discord Wallet Settlement' })
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  } catch {
    // Ignore broadcast errors so game loop is never affected
  }
}

// ============================================================================
// 24/7 CONTINUOUS GLOBAL MULTIPLAYER CRASH ENGINE
// ============================================================================

function reportCrashError(err) { console.error('[Crash persistence]', err.message); }

const AI_PILOT_POOL = [
  { id: 'ai_1', username: 'VortexPilot', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
  { id: 'ai_2', username: 'LunarWhale', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png' },
  { id: 'ai_3', username: 'HyperNova', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/3.png' },
  { id: 'ai_4', username: 'ApexTrader', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/4.png' },
  { id: 'ai_5', username: 'CyberDrifter', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  { id: 'ai_6', username: 'StarlightX', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
];

class GlobalCrashArenaEngine {
  constructor(demo = false) {
    this.demo = demo;
    this.history = demo ? [...recentCrashHistory] : recentCrashHistory;
    this.phase = 'BETTING'; // 'BETTING' | 'IN_FLIGHT' | 'CRASHED'
    this.roundNumber = 1042;
    this.roundId = `global_${Date.now()}`;
    this.countdownMs = 6000;
    this.cooldownMs = 3000;
    this.phaseStartTime = Date.now();
    this.flightStartTime = null;
    this.crashPoint = 2.0;
    this.flightDurationMs = 5000;
    this.currentMultiplier = 1.0;
    this.tickCounter = 0;

    // Active bets in current round: gameKey -> BetEntry
    this.bets = new Map();
    this.queuedBets = new Map();

    this.timer = null;
    this.tickTimer = null;
    this.stopped = false;
    this.startLoop();
  }

  startLoop() {
    this.enterBettingPhase().catch(reportCrashError);
  }

  seedAmbientPilots() {
    // Populate 2-4 realistic ambient telemetry pilots so the live flight feed is always vibrant
    const count = 2 + Math.floor(Math.random() * 3);
    const shuffled = [...AI_PILOT_POOL].sort(() => Math.random() - 0.5).slice(0, count);
    const wagers = [100, 250, 500, 1000, 1500, 2500];
    const targets = [1.45, 1.85, 2.10, 2.50, 3.40, 5.00, 8.50];

    for (const bot of shuffled) {
      const wager = wagers[Math.floor(Math.random() * wagers.length)];
      const autoCashout = targets[Math.floor(Math.random() * targets.length)];
      this.bets.set(bot.id, {
        key: bot.id,
        userId: null,
        username: bot.username,
        avatarUrl: bot.avatarUrl,
        wager,
        autoCashout,
        cashedOut: false,
        cashoutMult: null,
        winAmount: 0,
        profit: 0,
        isAmbient: true,
      });
    }
  }

  async enterBettingPhase() {
    if (this.stopped) return;
    this.roundNumber++;
    this.roundId = `cround_${this.roundNumber}_${Date.now()}`;
    this.phase = 'BETTING';
    this.phaseStartTime = Date.now();
    this.flightStartTime = null;
    this.currentMultiplier = 1.0;
    this.bets.clear();

    this.seedAmbientPilots();

    // Promote any queued bets from players who bet during the previous flight
    for (const [gameKey, q] of this.queuedBets.entries()) {
      this.queuedBets.delete(gameKey);
      await this.placeBetInternal(gameKey, q);
    }

    this.broadcastState('crash_phase');

    if (this.timer) clearTimeout(this.timer);
    if (!this.stopped) {
      this.timer = setTimeout(() => {
        this.enterFlightPhase().catch(reportCrashError);
      }, this.countdownMs);
      if (this.timer.unref) this.timer.unref();
    }
  }

  async enterFlightPhase() {
    if (this.stopped) return;
    // Close betting before any asynchronous database work. No flight is
    // published until every accepted wager has the same durable flight state.
    this.phase = 'STARTING';
    let totalHumanWager = 0;
    for (const bet of this.bets.values()) if (!bet.isAmbient) totalHumanWager += bet.wager;
    const crashPoint = generateCrashMultiplier(totalHumanWager);
    const flightStartTime = Date.now();
    const flightDurationMs = Math.max(80, Math.round(Math.log(crashPoint) / 0.00006));
    const durableBets = [...this.bets.values()].filter(b => !b.isAmbient && b.authenticated && b.roundId);
    try {
      if (databaseEconomy && durableBets.length) {
        await databaseEconomy.recordCrashFlight(durableBets.map(b => ({
          roundId: b.roundId, userId: b.userId,
          state: { engine: 'web-global-v1', phase: 'IN_FLIGHT', autoCashout: b.autoCashout,
            roundNumber: this.roundNumber, crashPoint, flightStartTime, flightDurationMs },
        })));
      }
    } catch (error) {
      // Keep wagers unstarted and retry the transition; recovery refunds them.
      this.phase = 'BETTING';
      if (!this.stopped) {
        this.timer = setTimeout(() => this.enterFlightPhase().catch(reportCrashError), 1000);
        this.timer.unref?.();
      }
      throw error;
    }
    if (this.stopped) return;
    this.phase = 'IN_FLIGHT';
    this.phaseStartTime = flightStartTime;
    this.flightStartTime = flightStartTime;
    this.currentMultiplier = 1.0;
    this.crashPoint = crashPoint;
    this.flightDurationMs = flightDurationMs;

    this.broadcastState('crash_phase');

    // High-frequency server tick (every 100ms) for auto-cashouts & live SSE telemetry
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => {
      this.onFlightTick().catch(reportCrashError);
    }, 100);
    if (this.tickTimer.unref) this.tickTimer.unref();

    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.enterCrashedPhase().catch(reportCrashError);
    }, Math.max(0, this.flightDurationMs - (Date.now() - this.flightStartTime)));
    if (this.timer.unref) this.timer.unref();
  }

  async onFlightTick() {
    if (this.stopped || this.phase !== 'IN_FLIGHT') return;
    const elapsed = Math.max(0, Date.now() - this.flightStartTime);

    if (elapsed >= this.flightDurationMs) {
      await this.enterCrashedPhase();
      return;
    }

    const liveMult = Math.min(this.crashPoint, Math.max(1.0, Math.exp(0.00006 * elapsed)));
    this.currentMultiplier = Math.round(liveMult * 100) / 100;
    this.tickCounter++;

    const cashedPlayers = [];
    for (const bet of this.bets.values()) {
      if (!bet.cashedOut && bet.autoCashout && liveMult >= bet.autoCashout && this.crashPoint >= bet.autoCashout) {
        await this.executeBetCashout(bet, bet.autoCashout);
        cashedPlayers.push(this.serializeBet(bet));
      }
    }

    for (const p of cashedPlayers) {
      this.broadcast('crash_cashout', {
        ...this.getPublicSnapshot(),
        player: p,
      });
    }

    // Broadcast authoritative flight telemetry tick every 200ms to prevent any client clock drift
    if (this.tickCounter % 2 === 0) {
      this.broadcast('crash_tick', {
        roundId: this.roundId,
        roundNumber: this.roundNumber,
        phase: 'IN_FLIGHT',
        elapsedMs: elapsed,
        currentMult: this.currentMultiplier,
        serverNow: Date.now(),
      });
    }
  }

  async executeBetCashout(bet, achievedMult) {
    if (bet.cashedOut) return null;
    if (bet.settlementPromise) return bet.settlementPromise;
    bet.pendingCashoutMult ??= achievedMult;
    bet.settlementPromise = this.settleBetCashout(bet, bet.pendingCashoutMult);
    try { return await bet.settlementPromise; }
    finally { bet.settlementPromise = null; }
  }

  async settleBetCashout(bet, achievedMult) {
    const cleanMult = Math.max(1.01, Math.round(achievedMult * 100) / 100);
    const winAmount = Math.floor(bet.wager * cleanMult);
    const profit = winAmount - bet.wager;

    let newBalance = 0;
    if (!bet.isAmbient) {
      if (bet.authenticated && bet.userId) {
        if (databaseEconomy && bet.roundId) {
          const roundState = {
            outcome: 'cashed_out',
            winAmount,
            multiplier: cleanMult,
            crashPoint: this.crashPoint,
            roundNumber: this.roundNumber,
          };
          const res = await databaseEconomy.settleRound(bet.roundId, bet.userId, winAmount, roundState);
          newBalance = res.balance;
        } else {
          await addTokens(bet.userId, winAmount, true);
          newBalance = await getBalance(bet.userId);
        }
      } else if (bet.session) {
        bet.session.demoBalance = (bet.session.demoBalance || 0) + winAmount;
        newBalance = bet.session.demoBalance;
      }

      bet.cashedOut = true;
      bet.cashoutMult = cleanMult;
      bet.winAmount = winAmount;
      bet.profit = profit;
      // Sync with individual activeWebCrash map if tracked
      const flight = activeWebCrash.get(bet.key);
      if (flight) {
        flight.cashedOut = true;
        flight.finalMult = cleanMult;
        if (Array.isArray(flight.monitorResolvers)) {
          flight.monitorResolvers.forEach((fn) => {
            try { fn(); } catch {}
          });
        }
      }

      if (bet.authenticated) {
        await recordCrashWin({
          userId: bet.userId,
          username: bet.username,
          avatarUrl: bet.avatarUrl,
          wager: bet.wager,
          multiplier: cleanMult,
          payout: winAmount,
          profit,
      });

      broadcastWinToDiscord({
        game: 'crash',
        username: bet.username,
        userId: bet.userId,
        avatarUrl: bet.avatarUrl,
        wager: bet.wager,
        multiplier: cleanMult,
        payout: winAmount,
        profit,
      });
      }
    }

    if (bet.isAmbient) { bet.cashedOut = true; bet.cashoutMult = cleanMult; bet.winAmount = winAmount; bet.profit = profit; }
    return { winAmount, profit, multiplier: cleanMult, balance: newBalance };
  }

  async enterCrashedPhase() {
    if (this.stopped || this.phase !== 'IN_FLIGHT') return;
    if (this.crashSettlementPromise) return this.crashSettlementPromise;
    this.crashSettlementPromise = this.finishCrashedPhase();
    try { return await this.crashSettlementPromise; }
    catch (error) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => this.enterCrashedPhase().catch(reportCrashError), 1000);
      this.timer.unref?.();
      throw error;
    } finally { this.crashSettlementPromise = null; }
  }

  async finishCrashedPhase() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }

    // The target can be reached between the last timer tick and the crash.
    // Settle those bets before publishing the completed round.
    for (const bet of this.bets.values()) {
      if (!bet.cashedOut && (bet.pendingCashoutMult || (bet.autoCashout && bet.autoCashout <= this.crashPoint))) {
        await this.executeBetCashout(bet, bet.pendingCashoutMult || bet.autoCashout);
      } else if (!bet.cashedOut && !bet.isAmbient && bet.authenticated && bet.userId && bet.roundId && databaseEconomy) {
        const roundState = {
          outcome: 'crashed',
          crashPoint: this.crashPoint,
          winAmount: 0,
          roundNumber: this.roundNumber,
        };
        await databaseEconomy.settleRound(bet.roundId, bet.userId, 0, roundState);
      }
    }

    this.phase = 'CRASHED';
    this.phaseStartTime = Date.now();
    this.currentMultiplier = this.crashPoint;

    this.history.unshift(this.crashPoint);
    if (this.history.length > 20) this.history.pop();

    this.broadcastState('crash_phase');

    if (this.timer) clearTimeout(this.timer);
    if (!this.stopped) {
      this.timer = setTimeout(() => {
        this.enterBettingPhase().catch(reportCrashError);
      }, this.cooldownMs);
      if (this.timer.unref) this.timer.unref();
    }
  }

  async placeBetInternal(gameKey, { authenticated, session, wager, autoCashout }) {
    if (this.phase !== 'BETTING') {
      return { error: 'Flight is already in progress! Wait for the next launchpad countdown to place a bet.', phase: this.phase };
    }

    if (authenticated && databaseEconomy && session?.userId) {
      const existing = await databaseEconomy.loadActiveCrash(session.userId);
      if (existing && !this.bets.has(gameKey)) {
        throw new Error('A Crash round is still active or awaiting recovery. Please try again later.');
      }
    }

    const currentBalance = authenticated ? await getBalance(session.userId) : (session.demoBalance ?? 1000);
    if (currentBalance < wager) {
      return { error: `Insufficient balance! You have ${currentBalance.toLocaleString()} 🪙.`, balance: currentBalance };
    }

    let newBalance = currentBalance;
    let roundId = null;
    if (authenticated) {
      if (databaseEconomy) {
        roundId = crypto.randomUUID();
        const res = await databaseEconomy.startRound(roundId, session.userId, 'crash', wager, {
          autoCashout,
          roundNumber: this.roundNumber,
          phase: 'BETTING',
        });
        newBalance = res.balance;

        if (this.phase !== 'BETTING') {
          const refundRes = await databaseEconomy.settleRound(roundId, session.userId, wager, {
            outcome: 'refunded',
            reason: 'flight_started_during_bet',
            roundNumber: this.roundNumber,
          });
          return { error: 'Flight started before bet could be locked in. Wager refunded.', phase: this.phase, balance: refundRes.balance };
        }
      } else {
        await deductTokens(session.userId, wager);
        newBalance = await getBalance(session.userId);
        if (this.phase !== 'BETTING') {
          await addTokens(session.userId, wager, false);
          return { error: 'Flight started before bet could be locked in. Wager refunded.', phase: this.phase };
        }
      }
    } else {
      if (this.phase !== 'BETTING') {
        return { error: 'Flight is already in progress! Wait for the next launchpad countdown to place a bet.', phase: this.phase };
      }
      session.demoBalance = currentBalance - wager;
      newBalance = session.demoBalance;
    }

    const betEntry = {
      key: gameKey,
      roundId,
      authenticated,
      session,
      userId: session.userId,
      username: session.username || 'Player',
      avatarUrl: session.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
      wager,
      autoCashout,
      cashedOut: false,
      cashoutMult: null,
      winAmount: 0,
      profit: 0,
      isAmbient: false,
    };

    this.bets.set(gameKey, betEntry);
    return { success: true, balance: newBalance, bet: this.serializeBet(betEntry) };
  }

  serializeBet(b) {
    return {
      userId: b.userId || b.key,
      username: b.username,
      avatarUrl: b.avatarUrl,
      wager: b.wager,
      autoCashout: b.autoCashout,
      cashedOut: b.cashedOut,
      cashoutMult: b.cashoutMult,
      winAmount: b.winAmount,
      profit: b.profit,
    };
  }

  getPublicSnapshot(gameKey = null) {
    const now = Date.now();
    let elapsedMs = Math.max(0, now - this.phaseStartTime);
    let remainingMs = 0;

    if (this.phase === 'BETTING') {
      remainingMs = Math.max(0, this.countdownMs - elapsedMs);
    } else if (this.phase === 'CRASHED') {
      remainingMs = Math.max(0, this.cooldownMs - elapsedMs);
    } else if (this.phase === 'IN_FLIGHT') {
      elapsedMs = Math.max(0, now - this.flightStartTime);
      this.currentMultiplier = Math.min(this.crashPoint, Math.max(1.0, Math.exp(0.00006 * elapsedMs)));
    }

    const players = Array.from(this.bets.values()).map((b) => this.serializeBet(b));
    const myBet = gameKey && this.bets.has(gameKey) ? this.serializeBet(this.bets.get(gameKey)) : null;
    const myQueued = gameKey && this.queuedBets.has(gameKey) ? {
      wager: this.queuedBets.get(gameKey).wager,
      autoCashout: this.queuedBets.get(gameKey).autoCashout,
    } : null;

    const roundedMult = Math.round(this.currentMultiplier * 100) / 100;

    return {
      roundId: this.roundId,
      roundNumber: this.roundNumber,
      phase: this.phase,
      serverNow: now,
      phaseStartTime: this.phaseStartTime,
      flightStartTime: this.flightStartTime,
      elapsedMs,
      remainingMs,
      countdownTotalMs: this.countdownMs,
      bettingDurationMs: this.countdownMs,
      multiplier: roundedMult,
      currentMult: roundedMult,
      crashPoint: this.phase === 'CRASHED' ? this.crashPoint : undefined,
      history: this.history.slice(0, 12),
      players,
      myBet: gameKey ? myBet : undefined,
      myQueued: gameKey ? myQueued : undefined,
      myQueuedBet: gameKey ? myQueued : undefined,
    };
  }

  broadcast(eventType, payload) {
    broadcastArenaEvent(eventType, payload, this.demo);
  }

  broadcastState(eventType = 'crash_state') {
    this.broadcast(eventType, this.getPublicSnapshot());
  }
}

export const globalCrashEngine = new GlobalCrashArenaEngine();
export const demoCrashEngine = new GlobalCrashArenaEngine(true);
const crashEngineFor = authenticated => authenticated ? globalCrashEngine : demoCrashEngine;

function evictGuest(key) {
  guestBalances.delete(key);
  activeWebMines.delete(key);
  activeWebCrash.delete(key);
  demoCrashEngine.bets.delete(key);
  demoCrashEngine.queuedBets.delete(key);
}


function operationUuid(roundId, action) {
  const hex = crypto.createHash('sha256').update(`${roundId}:${action}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

async function loadDatabaseMines(userId, gameId = null) {
  if (gameId) return databaseEconomy.loadRound(gameId, userId);
  return databaseEconomy.loadActiveMines(userId);
}

function publicDatabaseMines(round) {
  if (!round || round.status !== 'active') return null;
  return { gameId: round.roundId, wager: round.wager, bombs: round.state.bombs,
    revealed: round.state.revealed, multiplier: round.state.multiplier,
    currentWin: Math.floor(round.wager * round.state.multiplier),
    nextMultiplier: calculateMinesMultiplier(25, round.state.bombs, round.state.revealed.length + 1),
    peekMode: false, peekRevealed: [] };
}

async function databaseMinesAction(action, req, session) {
  const mines = new PersistentMines(databaseEconomy);
  const userId = session.userId;
  const body = req.body || {};
  if (action === 'start') {
    const wager = Math.max(10, Math.floor(Number(body.wager)) || 100);
    const bombs = Math.min(24, Math.max(1, Math.floor(Number(body.bombs)) || 3));
    const existing = await loadDatabaseMines(userId);
    if (existing) {
      if (existing.wager !== wager || existing.state.bombs !== bombs) throw new Error('Finish your active Mines round first.');
      return { success: true, ...publicDatabaseMines(existing), balance: await getBalance(userId) };
    }
    const id = crypto.randomUUID();
    const result = await mines.start(id, userId, wager, bombs);
    return { success: true, ...result, currentWin: wager, nextMultiplier: calculateMinesMultiplier(25,bombs,1) };
  }
  if (!body.gameId) throw new Error('Game ID is required.');
  const round = await loadDatabaseMines(userId, body.gameId);
  if (!round || round.game !== 'mines') throw new Error('Mines round not found.');
  if (action === 'peek') {
    if (round.status !== 'settled' || round.state.lastAction?.type !== 'cashout') throw new Error('Game not in exploration peek mode.');
    const tile = Number(body.tileIdx);
    if (!Number.isInteger(tile) || tile < 0 || tile > 24) throw new Error('Invalid tile index.');
    return { tileIdx: tile, isBomb: round.state.bombIndices.includes(tile) };
  }
  const result = action === 'reveal'
    ? await mines.reveal(operationUuid(round.roundId, `reveal:${body.tileIdx}`), round.roundId, userId, Number(body.tileIdx), round)
    : await mines.cashout(operationUuid(round.roundId, 'cashout'), round.roundId, userId, round);
  const payout = result.payout;
  if (payout > 0) {
    await recordMinesWin({ id: round.roundId, userId, username: session.username, avatarUrl: session.avatarUrl,
      wager: round.wager, bombs: round.state.bombs, gemsFound: result.revealed?.length ?? round.state.revealed.length,
      multiplier: result.multiplier, payout, profit: payout - round.wager });
  }
  if (action === 'cashout') return { ...result, success: true, cashedOut: true, winAmount: payout, profit: payout-round.wager };
  if (result.gameOver) return { ...result, won: !result.hitBomb, explodedIdx: result.hitBomb ? Number(body.tileIdx) : undefined,
    winAmount: payout, profit: payout-round.wager,
    allGems: Array.from({length:25},(_,i)=>i).filter(i=>!result.allBombs.includes(i)) };
  const currentWin = Math.floor(round.wager * result.multiplier);
  return { ...result, isGem: true, currentWin, profit: currentWin-round.wager, revealedCount: result.revealed.length,
    safeGemsLeft: 25-round.state.bombs-result.revealed.length,
    nextMultiplier: calculateMinesMultiplier(25,round.state.bombs,result.revealed.length+1) };
}

// ============================================================================
// EXPRESS PLAY API ROUTES & AUTONOMOUS RECOVERY SWEEPER
// ============================================================================

let crashSweeperTimer = null;

export function startCrashSweeper(intervalMs = 300000, olderThanSeconds = 1200) {
  const sweep = () => {
    const now = Date.now();
    for (const [key, guest] of guestBalances) {
      if (guest.expiresAt <= now) evictGuest(key);
    }
    if (!databaseEconomy) return;
    const activeIds = [
      ...Array.from(activeCrashFlights.values(), flight => flight.roundId),
      ...Array.from(activeWebCrash.values(), flight =>
        now < flight.startTime + flight.durationMs ? flight.roundId : null),
      ...Array.from(globalCrashEngine.bets.values(), bet => bet.roundId),
    ].filter(Boolean);
    databaseEconomy.recoverInterruptedRounds('crash', true, olderThanSeconds, activeIds).catch(reportCrashError);
  };
  sweep();
  if (crashSweeperTimer) clearInterval(crashSweeperTimer);
  crashSweeperTimer = setInterval(sweep, intervalMs);
  if (crashSweeperTimer.unref) crashSweeperTimer.unref();
}

export function stopCrashSweeper() {
  if (crashSweeperTimer) {
    clearInterval(crashSweeperTimer);
    crashSweeperTimer = null;
  }
}

export async function shutdownWebCrash() {
  stopCrashSweeper();
  for (const engine of [globalCrashEngine, demoCrashEngine]) {
    engine.stopped = true;
    clearTimeout(engine.timer);
    clearInterval(engine.tickTimer);
  }
  const roundIds = [
    ...Array.from(globalCrashEngine.bets.values(), bet => bet.roundId),
    ...Array.from(activeWebCrash.values(), flight => flight.roundId),
  ].filter(Boolean);
  if (databaseEconomy && roundIds.length) {
    await databaseEconomy.recoverInterruptedRounds('crash', true, 0, [], roundIds);
  }
}

async function finishDirectCrash(gameKey, flight, authenticated, session) {
  let payout = 0;
  if (authenticated && databaseEconomy && flight.roundId) {
    await databaseEconomy.recoverInterruptedRounds('crash', true, 0, [], [flight.roundId]);
    const settled = await databaseEconomy.loadRound(flight.roundId, session.userId);
    if (settled?.status !== 'settled') throw new Error('Crash settlement is pending');
    payout = settled.payout;
  } else if (flight.autoCashout && flight.autoCashout <= flight.crashPoint) {
    payout = Math.floor(flight.wager * flight.autoCashout);
    if (authenticated) await addTokens(session.userId, payout);
    else session.demoBalance += payout;
  }
  flight.cashedOut = payout > 0;
  flight.crashed = !flight.cashedOut;
  flight.finalMult = flight.cashedOut ? flight.autoCashout : null;
  if (activeWebCrash.get(gameKey) === flight) activeWebCrash.delete(gameKey);
  for (const notify of flight.monitorResolvers) notify();
  return { crashed: flight.crashed, cashedOut: flight.cashedOut, finalMult: flight.finalMult,
    winAmount: payout, crashPoint: flight.crashPoint,
    balance: authenticated ? await getBalance(session.userId) : session.demoBalance };
}

const streamTickets = new Map(); // ticket -> { session, expiresAt }

export function broadcastLiveChatMessage(message) { broadcastArenaEvent('live_chat', message); }
export function broadcastLiveChatDelete(id) { broadcastArenaEvent('live_chat_delete', {id}); }
// Run after the Discord cursor is caught up, so missed chat messages are
// considered before the corresponding hourly reward is calculated.
export async function processLiveChatRain() {
  if (!databasePool) return;
  const rain=new LiveChatRain(databasePool);
  for(let i=0;i<25;i++) {
    const result=await rain.run();
    if(!result.applied)break;
    if (!result.awards.length) continue;
    for (const award of result.awards) economyEvents.emit('balanceChanged', {userId:award.userId,balance:award.balance,action:'chat_rain',amount:award.amount});
    broadcastArenaEvent('live_chat_rain',{total:result.total,count:result.awards.length,period:result.period});
  }
}

export function setupPlayApi(app) {
  setupLiveChatApi(app,{store:databasePool ? new LiveChatStore(databasePool) : null,resolvePlayer,broadcast:broadcastLiveChatMessage});
  setupPlayerFeaturesApi(app,{resolvePlayer,pool:databasePool});
  setupRewardsApi(app,{resolvePlayer,pool:databasePool,economyEvents});
  setupInstantGameApi(app,{resolvePlayer,pool:databasePool,economyEvents,onRound:round=>broadcastArenaEvent('instant_round',round)});
  startCrashSweeper(300000, 1200);
  const MAX_GLOBAL_SSE = 250;
  const MAX_PER_IP_SSE = 8;
  const ipSseCounts = new Map();

  // POST /api/play/stream-ticket - Short-lived, single-use ticket for EventSource
  app.post('/api/play/stream-ticket', async (req, res) => {
    try {
      const { authenticated, session, token } = await resolvePlayer(req);
      if (!authenticated || !session?.userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const ticket = crypto.randomUUID();
      if (streamTickets.size >= 1000) {
        const now = Date.now();
        for (const [k, v] of streamTickets.entries()) {
          if (v.expiresAt <= now) streamTickets.delete(k);
        }
      }
      if (streamTickets.size >= 1000) return res.status(429).json({ error: 'Too many pending stream tickets' });
      streamTickets.set(ticket, { session, token, expiresAt: Date.now() + 30_000 });
      res.json({ success: true, ticket });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 0. GET /api/play/stream - Real-Time SSE Stream for Continuous Crash & Live Discord Wallet Sync
  app.get('/api/play/stream', async (req, res) => {
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const streamLimitReached = () => arenaSseClients.size >= MAX_GLOBAL_SSE || (ipSseCounts.get(clientIp) || 0) >= MAX_PER_IP_SSE;
    if (streamLimitReached()) {
      return res.status(429).json({ error: 'Too many active stream connections. Please wait.' });
    }

    let streamTicket = null;
    const ticketParam = req.query?.ticket;
    if (ticketParam && typeof ticketParam === 'string' && streamTickets.has(ticketParam)) {
      const entry = streamTickets.get(ticketParam);
      streamTickets.delete(ticketParam);
      if (entry.expiresAt > Date.now()) {
        streamTicket = entry;
      }
    }

    if (ticketParam && !streamTicket) {
      return res.status(401).json({ error: 'Stream ticket expired or already used' });
    }

    let resolved;
    try {
      if (streamTicket) {
        const { session, token } = streamTicket;
        if (databasePool && (!verifyTokenPayload(token) || !await sessionRegistry.isActive(session.userId, token))) {
          return res.status(401).json({ error: 'Stream session expired' });
        }
        resolved = { authenticated: true, session, token };
      } else {
        resolved = await resolvePlayer(req);
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to resolve player stream session' });
    }

    const { session, token, guestKey } = resolved;
    const gameKey = session?.userId || token || guestKey || 'demo';

    if (streamLimitReached()) return res.status(429).json({ error: 'Too many active stream connections. Please wait.' });
    ipSseCounts.set(clientIp, (ipSseCounts.get(clientIp) || 0) + 1);

    const decrementIp = () => {
      const cur = ipSseCounts.get(clientIp) || 1;
      if (cur <= 1) ipSseCounts.delete(clientIp);
      else ipSseCounts.set(clientIp, cur - 1);
    };

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const clientEntry = { res, userId: resolved.authenticated ? session?.userId : null, gameKey, token };
    arenaSseClients.add(clientEntry);

    // Push immediate snapshot
    const snapshot = crashEngineFor(resolved.authenticated).getPublicSnapshot(gameKey);
    res.write(`event: crash_phase\ndata: ${JSON.stringify(snapshot)}\n\n`);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      arenaSseClients.delete(clientEntry);
      decrementIp();
    };

    const heartbeat = setInterval(async () => {
      try {
        if (!await ensureActiveStream(clientEntry) || res.writableEnded) return;
        res.write(': heartbeat\n\n');
      } catch {
        res.end();
        cleanup();
      }
    }, 15000);
    if (heartbeat.unref) heartbeat.unref();

    req.on('close', cleanup);
    res.on('finish', cleanup);
    res.on('error', cleanup);
  });

  // 1. GET /api/play/profile - Live User Wallet & Active Game State
  app.get('/api/play/profile', async (req, res) => {
    try {
      const { authenticated, session, token, guestKey } = await resolvePlayer(req);
      const balance = authenticated ? await getBalance(session.userId) : (session.demoBalance ?? 1000);
      const gameKey = authenticated && session.userId ? session.userId : (token || guestKey || 'demo');
      const activeGame = activeWebMines.get(gameKey);
      const databaseGame = authenticated && databaseEconomy ? await loadDatabaseMines(session.userId) : null;

      let safeGame = null;
      if (activeGame && !activeGame.gameOver && !activeGame.cashedOut) {
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

      const crashSnapshot = crashEngineFor(authenticated).getPublicSnapshot(gameKey);

      res.json({
        authenticated,
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        balance,
        activeGame: databaseEconomy && authenticated ? publicDatabaseMines(databaseGame) : safeGame,
        crashState: crashSnapshot,
        crashArena: crashSnapshot,
        history: recentPlayHistory.slice(0, 12),
        crashHistory: crashSnapshot.history,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. POST /api/play/mines/start - Initialize a new 5x5 Mines Round
  app.post('/api/play/mines/start', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      if (authenticated && databaseEconomy) return res.json(await databaseMinesAction('start', req, session));
      const { wager, bombs } = req.body || {};

      const cleanBet = Math.max(10, Math.floor(Number(wager)) || 100);
      const cleanBombs = Math.min(24, Math.max(1, Math.floor(Number(bombs)) || 3));

      const currentBalance = authenticated
        ? await getBalance(session.userId)
        : (session.demoBalance ?? 1000);

      if (currentBalance < cleanBet) {
        return res.status(400).json({
          error: `Insufficient balance! You have ${currentBalance.toLocaleString()} tokens, but bet is ${cleanBet.toLocaleString()} tokens.`,
          balance: currentBalance,
        });
      }

      const existing = activeWebMines.get(gameKey);
      if (existing) {
        existing.gameOver = true;
        activeWebMines.delete(gameKey);
      }

      let newBalance = currentBalance;
      if (authenticated) {
        await deductTokens(session.userId, cleanBet);
        newBalance = await getBalance(session.userId);
      } else {
        session.demoBalance = currentBalance - cleanBet;
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
  app.post('/api/play/mines/reveal', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      if (authenticated && databaseEconomy) return res.json(await databaseMinesAction('reveal', req, session));
      const { tileIdx, gameId } = req.body || {};
      const idx = Number(tileIdx);

      if (!Number.isInteger(idx) || idx < 0 || idx > 24) {
        return res.status(400).json({ error: 'Invalid tile index (0 to 24 required)' });
      }

      const game = activeWebMines.get(gameKey);

      if (!game || game.gameOver) {
        return res.status(400).json({ error: 'No active game in progress. Start a new bet!' });
      }

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

        if (authenticated) {
          recentPlayHistory.unshift({ multiplier: 0.0, won: false });
          if (recentPlayHistory.length > 20) recentPlayHistory.pop();
        }

        const balance = authenticated ? await getBalance(session.userId) : session.demoBalance;

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
          await addTokens(session.userId, currentWin, true);
          finalBalance = await getBalance(session.userId);
        } else {
          session.demoBalance += currentWin;
          finalBalance = session.demoBalance;
        }

        if (authenticated) {
          recentPlayHistory.unshift({ multiplier: mult, won: true });
          if (recentPlayHistory.length > 20) recentPlayHistory.pop();
        }

        const profit = currentWin - game.wager;

        if (authenticated) await recordMinesWin({
          userId: session.userId,
          username: session.username,
          avatarUrl: session.avatarUrl,
          wager: game.wager,
          bombs: game.bombs,
          gemsFound: game.revealed.length,
          multiplier: mult,
          payout: currentWin,
          profit,
        });

        if (authenticated) broadcastWinToDiscord({
          game: 'mines',
          username: session.username,
          userId: session.userId,
          avatarUrl: session.avatarUrl,
          wager: game.wager,
          multiplier: mult,
          payout: currentWin,
          profit,
        });

        return res.json({
          gameOver: true,
          won: true,
          gameId: game.id,
          tileIdx: idx,
          multiplier: mult,
          winAmount: currentWin,
          profit,
          allBombs: Array.from(game.bombIndices),
          balance: finalBalance,
        });
      }

      const nextMult = calculateMinesMultiplier(25, game.bombs, game.revealed.length + 1);
      const balance = authenticated ? await getBalance(session.userId) : session.demoBalance;

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
  app.post('/api/play/mines/cashout', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      if (authenticated && databaseEconomy) return res.json(await databaseMinesAction('cashout', req, session));
      const { gameId } = req.body || {};
      const game = activeWebMines.get(gameKey);

      if (game && game.cashedOut) {
        const winAmount = Math.floor(game.wager * game.multiplier);
        const profit = winAmount - game.wager;
        const currentBalance = authenticated ? await getBalance(session.userId) : (session.demoBalance ?? 1000);
        return res.json({
          success: true,
          cashedOut: true,
          alreadyCashedOut: true,
          gameId: game.id,
          multiplier: game.multiplier,
          winAmount,
          profit,
          allBombs: Array.from(game.bombIndices),
          balance: currentBalance,
        });
      }

      if (!game || game.gameOver || game.revealed.length === 0) {
        return res.status(400).json({ error: 'Cannot cash out without uncovering at least 1 safe gem.' });
      }

      if (gameId && game.id !== gameId) {
        return res.status(400).json({ error: 'Stale game round.' });
      }

      const winAmount = Math.floor(game.wager * game.multiplier);
      const profit = winAmount - game.wager;
      let newBalance = 0;

      if (authenticated) {
        await addTokens(session.userId, winAmount, true);
        newBalance = await getBalance(session.userId);
      } else {
        session.demoBalance += winAmount;
        newBalance = session.demoBalance;
      }

      game.cashedOut = true;
      game.peekMode = true;
      game.peekRevealed = [];

      if (authenticated) {
        recentPlayHistory.unshift({ multiplier: game.multiplier, won: true });
        if (recentPlayHistory.length > 20) recentPlayHistory.pop();
      }

      if (authenticated) await recordMinesWin({
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        wager: game.wager,
        bombs: game.bombs,
        gemsFound: game.revealed.length,
        multiplier: game.multiplier,
        payout: winAmount,
        profit,
      });

      if (authenticated) broadcastWinToDiscord({
        game: 'mines',
        username: session.username,
        userId: session.userId,
        avatarUrl: session.avatarUrl,
        wager: game.wager,
        multiplier: game.multiplier,
        payout: winAmount,
        profit,
      });

      res.json({
        success: true,
        cashedOut: true,
        gameId: game.id,
        multiplier: game.multiplier,
        winAmount,
        profit,
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
  app.post('/api/play/mines/peek', async (req, res) => {
    try {
      const { authenticated, session, token, guestKey } = await resolvePlayer(req);
      if (authenticated && databaseEconomy) return res.json(await databaseMinesAction('peek', req, session));
      const { tileIdx, gameId } = req.body || {};
      const idx = Number(tileIdx);

      const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');
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
  app.get('/api/play/mines/leaderboard', async (req, res) => {
    try {
      const leaderboard = await getMinesLeaderboard();
      res.json(leaderboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // =========================================================================
  // CONTINUOUS ORBITAL CRASH ENGINE API
  // =========================================================================

  // 7. GET /api/play/crash/state - Current Global Continuous Crash State
  app.get('/api/play/crash/state', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const crashEngine = crashEngineFor(authenticated);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');
    res.json(crashEngine.getPublicSnapshot(gameKey));
  });

  // 8. POST /api/play/crash/bet - Place or Queue Bet in the Global Continuous Crash Loop
  app.post('/api/play/crash/bet', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const crashEngine = crashEngineFor(authenticated);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { wager, autoCashout, cancelQueue } = req.body || {};

      // Allow canceling a queued next-round bet
      if (cancelQueue) {
        crashEngine.queuedBets.delete(gameKey);
        const balance = authenticated ? await getBalance(session.userId) : (session.demoBalance ?? 1000);
        return res.json({
          success: true,
          canceledQueue: true,
          balance,
          crashState: crashEngine.getPublicSnapshot(gameKey),
        });
      }

      const cleanBet = Math.max(10, Math.floor(Number(wager)) || 100);
      const cleanAuto =
        autoCashout && !isNaN(Number(autoCashout)) && Number(autoCashout) >= 1.01
          ? Math.round(Number(autoCashout) * 100) / 100
          : null;

      const currentBalance = authenticated ? await getBalance(session.userId) : (session.demoBalance ?? 1000);
      if (currentBalance < cleanBet) {
        return res.status(400).json({
          error: `Insufficient balance! You have ${currentBalance.toLocaleString()} 🪙, but bet is ${cleanBet.toLocaleString()} 🪙.`,
          balance: currentBalance,
        });
      }

      // Strictly allow bets ONLY during the BETTING countdown phase!
      if (crashEngine.phase !== 'BETTING') {
        return res.status(400).json({
          error: 'Flight is already in progress! Wait for the next launchpad countdown to place a bet.',
          phase: crashEngine.phase,
          crashState: crashEngine.getPublicSnapshot(gameKey),
        });
      }

      if (crashEngine.bets.has(gameKey)) {
        return res.status(400).json({ error: 'You already placed a bet for this flight!' });
      }

      const result = await crashEngine.placeBetInternal(gameKey, {
        authenticated,
        session,
        wager: cleanBet,
        autoCashout: cleanAuto,
      });

      if (result.error) {
        return res.status(400).json(result);
      }

      crashEngine.broadcastState('crash_bet');
      return res.json({
        success: true,
        status: 'placed',
        queued: false,
        roundId: crashEngine.roundId,
        wager: cleanBet,
        autoCashout: cleanAuto,
        bet: result.bet,
        balance: result.balance,
        crashState: crashEngine.getPublicSnapshot(gameKey),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    } finally {
      playerLocks.delete(gameKey);
    }
  });

  // 9. POST /api/play/crash/start - Compatibility endpoint (places bet or starts flight)
  app.post('/api/play/crash/start', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { wager, autoCashout } = req.body || {};
      const cleanBet = Math.max(10, Math.floor(Number(wager)) || 100);
      const cleanAuto =
        autoCashout && !isNaN(Number(autoCashout)) && Number(autoCashout) >= 1.01
          ? Math.round(Number(autoCashout) * 100) / 100
          : null;

      const currentBalance = authenticated
        ? await getBalance(session.userId)
        : (session.demoBalance ?? 1000);

      if (currentBalance < cleanBet) {
        return res.status(400).json({
          error: `Insufficient balance! You have ${currentBalance.toLocaleString()} tokens, but bet is ${cleanBet.toLocaleString()} tokens.`,
          balance: currentBalance,
        });
      }

      if (authenticated && databaseEconomy && session?.userId) {
        const dbExisting = await databaseEconomy.loadActiveCrash(session.userId);
        if (dbExisting) {
          return res.status(409).json({ error: 'A Crash round is still active or awaiting recovery. Please try again later.' });
        }
      }

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

      const crashPoint = generateCrashMultiplier(cleanBet);
      const flightDurationMs = Math.max(100, Math.round(Math.log(crashPoint) / 0.00006));
      const flightStartTime = Date.now();
      let newBalance = currentBalance;
      let roundId = null;
      if (authenticated) {
        if (databaseEconomy) {
          roundId = crypto.randomUUID();
          const res = await databaseEconomy.startRound(roundId, session.userId, 'crash', cleanBet, {
            engine: 'web-global-v1', phase: 'IN_FLIGHT', autoCashout: cleanAuto,
            crashPoint, flightStartTime, flightDurationMs,
          });
          newBalance = res.balance;
        } else {
          await deductTokens(session.userId, cleanBet);
          newBalance = await getBalance(session.userId);
        }
      } else {
        session.demoBalance = currentBalance - cleanBet;
        newBalance = session.demoBalance;
      }

      const flightId = 'cf_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex');

      const flightState = {
        roundId,
        id: flightId,
        userId: session.userId,
        wager: cleanBet,
        autoCashout: cleanAuto,
        crashPoint,
        durationMs: flightDurationMs,
        startTime: flightStartTime,
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

  // 10. POST /api/play/crash/monitor - Flight Monitor
  app.post('/api/play/crash/monitor', async (req, res) => {
    try {
      const { authenticated, session, token, guestKey } = await resolvePlayer(req);
      const { flightId } = req.body || {};
      const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');
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
        flight.settlementPromise ??= finishDirectCrash(gameKey, flight, authenticated, session)
          .finally(() => { flight.settlementPromise = null; });
        return res.json(await flight.settlementPromise);
      }
      return res.json({ crashed: flight.crashed, cashedOut: flight.cashedOut,
        finalMult: flight.finalMult, crashPoint: flight.crashPoint });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. POST /api/play/crash/cashout - Lock in Flight Winnings (Supports both Global Continuous Loop & Direct Flight)
  app.post('/api/play/crash/cashout', async (req, res) => {
    const { authenticated, session, token, guestKey } = await resolvePlayer(req);
    const crashEngine = crashEngineFor(authenticated);
    const gameKey = authenticated ? session.userId : (token || guestKey || 'demo');

    if (playerLocks.has(gameKey)) {
      return res.status(429).json({ error: 'Action in progress, please wait.' });
    }
    playerLocks.add(gameKey);

    try {
      const { flightId } = req.body || {};

      // A. Check Global Continuous Crash Engine first (when no custom flightId is passed or matches roundId)
      const globalBet = crashEngine.bets.get(gameKey);

      if (globalBet && (!flightId || flightId === crashEngine.roundId)) {
        if (globalBet.cashedOut) {
          const balance = authenticated ? await getBalance(session.userId) : (session?.demoBalance ?? 1000);
          return res.json({
            success: true,
            cashedOut: true,
            flightId: crashEngine.roundId,
            multiplier: globalBet.cashoutMult || 1.0,
            winAmount: globalBet.winAmount || 0,
            profit: globalBet.profit || 0,
            balance,
            crashState: crashEngine.getPublicSnapshot(gameKey),
          });
        }

        if (crashEngine.phase === 'CRASHED') {
          const balance = authenticated ? await getBalance(session.userId) : (session?.demoBalance ?? 1000);
          return res.json({
            crashed: true,
            crashPoint: crashEngine.crashPoint,
            balance,
            crashState: crashEngine.getPublicSnapshot(gameKey),
          });
        }

        if (crashEngine.phase !== 'IN_FLIGHT') {
          return res.status(400).json({ error: 'Flight is not in progress.' });
        }

        const elapsedMs = Math.max(0, Date.now() - (crashEngine.flightStartTime || crashEngine.phaseStartTime));
        const currentFlightMult = Math.exp(0.00006 * elapsedMs);
        if (elapsedMs >= crashEngine.flightDurationMs || currentFlightMult >= crashEngine.crashPoint) {
          const balance = authenticated ? await getBalance(session.userId) : (session?.demoBalance ?? 1000);
          return res.json({
            crashed: true,
            crashPoint: crashEngine.crashPoint,
            balance,
            crashState: crashEngine.getPublicSnapshot(gameKey),
          });
        }

        let achievedMult = Math.min(crashEngine.crashPoint, currentFlightMult);
        if (globalBet.autoCashout && achievedMult >= globalBet.autoCashout) {
          achievedMult = globalBet.autoCashout;
        }

        const out = await crashEngine.executeBetCashout(globalBet, achievedMult) || {
          multiplier: globalBet.cashoutMult || Math.max(1.01, Math.round(achievedMult * 100) / 100),
          winAmount: globalBet.winAmount || Math.floor(globalBet.wager * (achievedMult || 1.0)),
          profit: globalBet.profit || 0,
          balance: authenticated ? await getBalance(session.userId) : (session?.demoBalance ?? 1000),
        };

        crashEngine.broadcast('crash_cashout', {
          ...crashEngine.getPublicSnapshot(),
          player: crashEngine.serializeBet(globalBet),
        });

        return res.json({
          success: true,
          cashedOut: true,
          flightId: crashEngine.roundId,
          multiplier: out.multiplier,
          winAmount: out.winAmount,
          profit: out.profit,
          balance: out.balance,
          crashState: crashEngine.getPublicSnapshot(gameKey),
        });
      }

      // B. Fallback: Direct Flight Session (for unit tests or legacy flightId)
      const flight = activeWebCrash.get(gameKey);
      if (!flight || flight.crashed || flight.cashedOut || flight.settlementPromise) {
        return res.status(400).json({ error: 'No active flight to cash out.' });
      }

      if (flightId && flight.id !== flightId) {
        return res.status(400).json({ error: 'Stale flight session.' });
      }

      const elapsedMs = Date.now() - flight.startTime;
      const currentFlightMult = Math.exp(0.00006 * elapsedMs);

      if (elapsedMs >= flight.durationMs) {
        flight.settlementPromise ??= finishDirectCrash(gameKey, flight, authenticated, session)
          .finally(() => { flight.settlementPromise = null; });
        return res.json(await flight.settlementPromise);
      }
      if (currentFlightMult >= flight.crashPoint) {
        return res.status(409).json({ error: 'Flight settlement is pending.' });
      }

      let achievedMult = Math.min(flight.crashPoint, currentFlightMult);
      if (flight.autoCashout && achievedMult >= flight.autoCashout) {
        achievedMult = flight.autoCashout;
      }
      achievedMult = Math.max(1.01, Math.round(achievedMult * 100) / 100);

      const winAmount = Math.floor(flight.wager * achievedMult);
      const profit = winAmount - flight.wager;

      let newBalance = 0;
      if (authenticated) {
        if (databaseEconomy && flight.roundId) {
          const roundState = {
            outcome: 'cashed_out',
            winAmount,
            multiplier: achievedMult,
            crashPoint: flight.crashPoint,
          };
          const res = await databaseEconomy.settleRound(flight.roundId, session.userId, winAmount, roundState);
          newBalance = res.balance;
        } else {
          await addTokens(session.userId, winAmount, true);
          newBalance = await getBalance(session.userId);
        }
      } else {
        session.demoBalance += winAmount;
        newBalance = session.demoBalance;
      }

      flight.cashedOut = true;
      flight.finalMult = achievedMult;

      if (authenticated) {
        recentCrashHistory.unshift(achievedMult);
        if (recentCrashHistory.length > 20) recentCrashHistory.pop();
      }

      if (Array.isArray(flight.monitorResolvers)) {
        flight.monitorResolvers.forEach((fn) => {
          try { fn(); } catch {}
        });
      }

      if (authenticated) await recordCrashWin({
        userId: session.userId,
        username: session.username,
        avatarUrl: session.avatarUrl,
        wager: flight.wager,
        multiplier: achievedMult,
        payout: winAmount,
        profit,
      });

      if (authenticated) broadcastWinToDiscord({
        game: 'crash',
        username: session.username,
        userId: session.userId,
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

  // 12. GET /api/play/crash/leaderboard - Real-time Crash Hall of Fame
  app.get('/api/play/crash/leaderboard', async (req, res) => {
    try {
      res.json(await getCrashLeaderboard());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
