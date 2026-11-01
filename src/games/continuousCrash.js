import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { generateCrashMultiplier } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';
import { getCrashPreviewGif } from './animator.js';

// Active per-user Crash flights: userId -> FlightState
export const activeCrashFlights = new Map();

// Per-user interaction lock so rapid clicks never race
const processingCrashUsers = new Set();

// Persistent per-user preferences (betAmount, autoCashout, winStreak)
const userCrashPrefs = new Map();

// Global recent crash multipliers for live casino history
const recentCrashHistory = ['2.45x', '1.18x', '8.45x', '1.85x', '12.50x', '3.20x'];

let globalFlightCounter = 0;

function getOrCreateUserPrefs(userId) {
  if (!userCrashPrefs.has(userId)) {
    userCrashPrefs.set(userId, {
      betAmount: 100,
      autoCashout: null,
      streak: 0,
    });
  }
  return userCrashPrefs.get(userId);
}

function recordCrashHistory(mult) {
  recentCrashHistory.unshift(`${mult.toFixed(2)}x`);
  if (recentCrashHistory.length > 7) recentCrashHistory.pop();
}

export function formatCrashHistory() {
  return recentCrashHistory
    .slice(0, 6)
    .map((h) => {
      const val = parseFloat(h);
      if (val >= 10.0) return `👑\`${h}\``;
      if (val >= 2.0) return `🟩\`${h}\``;
      return `🟥\`${h}\``;
    })
    .join(' • ');
}

function getAltitudeZone(mult) {
  if (mult >= 10.0) return { name: 'LUNAR SUPERNOVA', badge: '👑 LUNAR SUPERNOVA', color: 0xf1c40f };
  if (mult >= 5.0) return { name: 'DEEP SPACE', badge: '☄️ DEEP SPACE', color: 0x9b59b6 };
  if (mult >= 2.0) return { name: 'HIGH ORBIT', badge: '🚀 HIGH ORBIT', color: 0x2ecc71 };
  if (mult >= 1.35) return { name: 'STRATOSPHERE', badge: '🛰️ STRATOSPHERE', color: 0x3498db };
  return { name: 'LOW ATMOSPHERE', badge: '🛫 LIFTOFF ZONE', color: 0x3498db };
}

/**
 * Shows the Custom Wager & Auto-Cashout Target Modal for Crash.
 */
export async function showCrashModal(interaction) {
  const prefs = getOrCreateUserPrefs(interaction.user.id);

  const modal = new ModalBuilder()
    .setCustomId('crash_custom_modal')
    .setTitle('🚀 Orbital Crash — Custom Flight Setup');

  const betInput = new TextInputBuilder()
    .setCustomId('crash_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500, 2500')
    .setValue(String(prefs.betAmount || 100))
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const autoInput = new TextInputBuilder()
    .setCustomId('crash_auto_input')
    .setLabel('Auto-Cashout Multiplier (Optional, e.g. 2.00)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Leave blank for Manual, or e.g. 2.0, 3.5, 10.0')
    .setValue(prefs.autoCashout ? prefs.autoCashout.toFixed(2) : '')
    .setMinLength(0)
    .setMaxLength(6)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(betInput),
    new ActionRowBuilder().addComponents(autoInput)
  );

  return interaction.showModal(modal);
}

/**
 * Renders the 47-char wide 2D Orbital Trajectory Radar & Cockpit Telemetry Cabinet.
 */
function buildCrashRadarAscii(state) {
  const mult = state.currentMultiplier;
  const isCrashed = state.crashed && !state.cashedOut;
  const isCashed = state.cashedOut;
  const zone = getAltitudeZone(mult);

  const padCenter = (str, w) => {
    const clean = String(str);
    if (clean.length >= w) return clean.slice(0, w);
    const l = Math.floor((w - clean.length) / 2);
    return ' '.repeat(l) + clean + ' '.repeat(w - clean.length - l);
  };

  const padRight = (str, w) => {
    const clean = String(str);
    if (clean.length >= w) return clean.slice(0, w);
    return clean + ' '.repeat(w - clean.length);
  };

  let headerTitle = '★ MOONFLIP ORBITAL TELEMETRY • IN FLIGHT ★';
  if (isCashed) {
    headerTitle = `★ EJECTION LOCKED AT ${state.cashoutMult.toFixed(2)}X • VICTORY! ★`;
  } else if (isCrashed) {
    headerTitle = `✖ HULL DETONATION AT ${state.crashPoint.toFixed(2)}X • SIGNAL LOST ✖`;
  }

  // 7 Altitude Radar Rows (Row 0 = 10.0x+ down to Row 6 = 1.0x)
  const axisLabels = [
    '10.0x ┤',
    ' 5.0x ┤',
    ' 3.0x ┤',
    ' 2.0x ┤',
    ' 1.5x ┤',
    ' 1.2x ┤',
    ' 1.0x ┼',
  ];

  // Determine Rocket vertical row (0..6, where 6 is bottom 1.0x and 0 is top 10.0x+)
  let targetRow = 6;
  if (mult >= 8.5) targetRow = 0;
  else if (mult >= 4.5) targetRow = 1;
  else if (mult >= 2.75) targetRow = 2;
  else if (mult >= 1.90) targetRow = 3;
  else if (mult >= 1.45) targetRow = 4;
  else if (mult >= 1.15) targetRow = 5;
  else targetRow = 6;

  const stepsClimbed = 6 - targetRow; // 0..6
  const baseCol = 3 + stepsClimbed * 3; // Advances horizontally from col 3 to col 21

  // Build each of the 7 radar rows (40 chars wide after the 7-char axis label)
  const radarRows = [];
  for (let r = 0; r < 7; r++) {
    const rowStepsFromBottom = 6 - r; // 0 at bottom, 6 at top

    if (r < targetRow) {
      // Sky above the rocket: twinkling deep-space stars
      const starLine =
        r === 0
          ? '    ·             ⋆              ·      '
          : r === 1
          ? '          ✦                ·            '
          : r === 2
          ? '     ·            ·               ✦     '
          : r === 3
          ? '             ⋆              ·           '
          : '       ·              ✦                 ';
      radarRows.push(`║${axisLabels[r]}${padRight(starLine, 40)}║`);
    } else if (r === targetRow) {
      // Rocket / Outcome Row!
      const leadSpaces = ' '.repeat(Math.max(1, baseCol - 1));
      let iconAndTag = `🚀 [ ${mult.toFixed(2)}x ]`;
      if (isCashed) {
        iconAndTag = `👑 [ ${state.cashoutMult.toFixed(2)}x WIN ]`;
      } else if (isCrashed) {
        iconAndTag = `💥 [ ${state.crashPoint.toFixed(2)}x BUST ]`;
      } else if (mult >= 5.0) {
        iconAndTag = `☄️ [ ${mult.toFixed(2)}x ]`;
      }
      const trailPrefix = r < 6 ? '✦╱' : '══';
      const lineContent = `${leadSpaces}${trailPrefix}${iconAndTag}`;
      radarRows.push(`║${axisLabels[r]}${padRight(lineContent, 40)}║`);
    } else {
      // Trajectory trail below the rocket (r > targetRow)
      const colAtRow = 3 + rowStepsFromBottom * 3;
      const fillWidth = Math.max(1, baseCol - colAtRow + 2);
      const shadeChar = isCrashed ? '▓' : '▒';
      const shadeBlock = shadeChar.repeat(fillWidth);

      if (r === 6) {
        // Bottom launchpad axis line
        const prefix = '═'.repeat(Math.max(1, colAtRow));
        const suffixLen = Math.max(0, 40 - (prefix.length + 1 + shadeBlock.length));
        const lineContent = `${prefix}╱${shadeBlock}${'═'.repeat(suffixLen)}`;
        radarRows.push(`║${axisLabels[r]}${padRight(lineContent, 40)}║`);
      } else {
        const prefix = ' '.repeat(Math.max(1, colAtRow));
        const lineContent = `${prefix}╱${shadeBlock}`;
        radarRows.push(`║${axisLabels[r]}${padRight(lineContent, 40)}║`);
      }
    }
  }

  // Altitude Progress Bar (12 blocks)
  const totalBlocks = 12;
  const filledBlocks = Math.min(
    totalBlocks,
    Math.max(1, Math.round(Math.log(Math.max(1, mult)) / Math.log(10) * totalBlocks) + 1)
  );
  const altBar = '█'.repeat(filledBlocks) + '░'.repeat(totalBlocks - filledBlocks);

  let statusFooter = '';
  if (isCashed) {
    const profit = state.winAmount - state.betAmount;
    statusFooter = `★ CASHED OUT! WON +${state.winAmount.toLocaleString()} TOKENS (+${profit.toLocaleString()}) ★`;
  } else if (isCrashed) {
    statusFooter = `✖ ROCKET EXPLODED AT ${state.crashPoint.toFixed(2)}X — LOST -${state.betAmount.toLocaleString()} ✖`;
  } else if (state.autoCashout) {
    statusFooter = `>> AUTO-CASHOUT ARMED @ ${state.autoCashout.toFixed(2)}X • CLIMBING <<`;
  } else {
    statusFooter = `>> THRUSTERS AT 100% — CLICK CASH OUT NOW <<`;
  }

  return (
    `╔═══════════════════════════════════════════════╗\n` +
    `║${padCenter(headerTitle, 47)}║\n` +
    `╠═══════════════════════════════════════════════╣\n` +
    `${radarRows.join('\n')}\n` +
    `╠═══════════════════════════════════════════════╣\n` +
    `║${padCenter(`ALT: [${altBar}] • ${zone.name}`, 47)}║\n` +
    `║${padCenter(statusFooter, 47)}║\n` +
    `╚═══════════════════════════════════════════════╝`
  );
}

/**
 * Builds the live Cockpit Embed during or after a flight.
 */
function buildCrashCockpitEmbed(state, user, autoNotice = null) {
  const mult = state.currentMultiplier;
  const isCrashed = state.crashed && !state.cashedOut;
  const isCashed = state.cashedOut;
  const zone = getAltitudeZone(mult);
  const radarAscii = buildCrashRadarAscii(state);
  const historyText = formatCrashHistory();
  const prefs = getOrCreateUserPrefs(user.id);

  const prefixNotice = autoNotice ? `> ${autoNotice}\n` : '';

  if (isCashed || isCrashed) {
    const newBalance = getBalance(user.id);
    const profit = isCashed ? state.winAmount - state.betAmount : -state.betAmount;
    const color = isCashed ? (state.cashoutMult >= 5.0 ? 0xf1c40f : 0x2ecc71) : 0xe74c3c;

    const streakBadge =
      prefs.streak >= 2
        ? `🔥 ${prefs.streak}x Win Streak!`
        : prefs.streak === 1
        ? `✨ 1x Win`
        : `❄️ 0x`;

    let headline = '';
    let blackboxLine = '';

    if (isCashed) {
      const autoTag = state.cashedViaAuto ? ' *(Auto-Cashout Triggered)*' : '';
      headline = `✅ **CASHED OUT @ ${state.cashoutMult.toFixed(2)}x! YOU WON +${state.winAmount.toLocaleString()} 🪙!** *(Net Profit: **+${profit.toLocaleString()} 🪙**)*${autoTag}`;
      if (state.crashPoint <= state.cashoutMult + 0.15) {
        blackboxLine = `\n🔥 **Clutch Ejection**: The rocket detonated almost immediately after at **\`${state.crashPoint.toFixed(2)}x\`**!`;
      } else {
        blackboxLine = `\n🛰️ **Blackbox Telemetry**: You locked in **\`${state.cashoutMult.toFixed(2)}x\`** — rocket later detonated at **\`${state.crashPoint.toFixed(2)}x\`**.`;
      }
    } else {
      headline = `❌ **ROCKET DETONATED @ ${state.crashPoint.toFixed(2)}x — LOST -${state.betAmount.toLocaleString()} 🪙!**`;
      if (state.autoCashout) {
        blackboxLine = `\n🎯 **Target Missed**: Rocket exploded at **\`${state.crashPoint.toFixed(2)}x\`** before reaching your **\`${state.autoCashout.toFixed(2)}x\`** Auto-Cashout.`;
      }
    }

    return new EmbedBuilder()
      .setColor(color)
      .setTitle(
        isCashed
          ? `👑  CRASH — CASHED OUT +${state.winAmount.toLocaleString()} 🪙 (${state.cashoutMult.toFixed(2)}x)!`
          : `💥  CRASH — EXPLODED AT ${state.crashPoint.toFixed(2)}x (-${state.betAmount.toLocaleString()} 🪙)`
      )
      .setDescription(
        `${prefixNotice}${headline}${blackboxLine}\n` +
        `\`\`\`asciidoc\n${radarAscii}\n\`\`\`\n` +
        `📈 **Result**: \`${isCashed ? `Cashed @ ${state.cashoutMult.toFixed(2)}x` : `Crashed @ ${state.crashPoint.toFixed(2)}x`}\`  •  💥 **Crash Point**: \`${state.crashPoint.toFixed(2)}x\`  •  🔥 **Streak**: \`${streakBadge}\`\n` +
        `💵 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`  •  💰 **Payout**: \`${isCashed ? `+${state.winAmount.toLocaleString()} 🪙` : '0 🪙'}\`\n` +
        `💳 **Wallet Balance**: \`${state.prevBalance.toLocaleString()} 🪙\` ➔ **\`${newBalance.toLocaleString()} 🪙\`** *(${profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} 🪙)*\n` +
        `📜 **Recent Flights**: ${historyText}`
      )
      .setFooter({
        text: `${user.username} • Instant Settlement • Provably Fair Orbital Crash`,
        iconURL: user.displayAvatarURL() || undefined,
      })
      .setTimestamp();
  }

  // Active In-Flight Cockpit Embed
  const livePayout = Math.floor(state.betAmount * mult);
  const liveProfit = livePayout - state.betAmount;
  const autoBadge = state.autoCashout ? `🎯 \`${state.autoCashout.toFixed(2)}x Armed\`` : '`Manual Control`';

  return new EmbedBuilder()
    .setColor(zone.color)
    .setTitle(`🚀  ORBITAL CRASH — IN FLIGHT [ ${mult.toFixed(2)}x ]`)
    .setDescription(
      `${prefixNotice}> **Rocket is ascending!** Click **💰 CASH OUT NOW** to lock in **+${livePayout.toLocaleString()} 🪙**, or tap an **Auto-Cashout Target** below!\n` +
      `\`\`\`asciidoc\n${radarAscii}\n\`\`\`\n` +
      `📈 **Live Multiplier**: **\`${mult.toFixed(2)}x\`**  •  🛰️ **Zone**: ${zone.badge}  •  ⚙️ **Auto-Cash**: ${autoBadge}\n` +
      `💵 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`  •  💰 **Cashout Value**: **\`+${livePayout.toLocaleString()} 🪙\`** *(Profit: **\`+${liveProfit.toLocaleString()} 🪙\`**)*\n` +
      `📜 **Recent Flights**: ${historyText}`
    )
    .setFooter({
      text: `${user.username} • Click 💰 CASH OUT NOW before hull detonation!`,
      iconURL: user.displayAvatarURL() || undefined,
    });
}

/**
 * Builds the 5-button Live Cockpit ActionRow during flight:
 * - Primary Green Button: 💰 CASH OUT NOW (X.XXx • +Y 🪙)
 * - 4 Quick Mid-Flight Auto-Cashout Target Toggles: 2.0x, 3.0x, 5.0x, 10.0x
 */
function buildFlightActionRow(state) {
  const mult = state.currentMultiplier;
  const livePayout = Math.floor(state.betAmount * mult);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('crash_live_cashout')
      .setLabel(`💰 CASH OUT (${mult.toFixed(2)}x • ${livePayout.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success)
  );

  const targets = [
    { id: 'crash_target_200', val: 2.0, label: '2.0x' },
    { id: 'crash_target_300', val: 3.0, label: '3.0x' },
    { id: 'crash_target_500', val: 5.0, label: '5.0x' },
    { id: 'crash_target_1000', val: 10.0, label: '10x' },
  ];

  for (const t of targets) {
    const isArmed = state.autoCashout && Math.abs(state.autoCashout - t.val) < 0.01;
    const alreadyPassed = mult >= t.val;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(t.id)
        .setLabel(isArmed ? `✅ Auto ${t.label}` : `🎯 Auto ${t.label}`)
        .setStyle(isArmed ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(alreadyPassed && !isArmed)
    );
  }

  return [row];
}

/**
 * Builds the 1-Click Replay ActionRow shown after a flight finishes (Cashout or Crash).
 */
function buildReplayActionRow(state) {
  const bet = state.betAmount;
  const doubleBet = Math.min(50000, bet * 2);
  const autoTarget = state.autoCashout || 2.0;
  const autoCode = Math.round(autoTarget * 100);

  const replayButtons = [
    new ButtonBuilder()
      .setCustomId(`crash_bet_${bet}`)
      .setLabel(`🚀 Fly Again (${bet.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success),
  ];

  if (doubleBet !== bet) {
    replayButtons.push(
      new ButtonBuilder()
        .setCustomId(`crash_bet_${doubleBet}`)
        .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  replayButtons.push(
    new ButtonBuilder()
      .setCustomId(`crash_quickauto_${bet}_${autoCode}`)
      .setLabel(`🎯 ${bet.toLocaleString()} 🪙 @ ${autoTarget.toFixed(1)}x`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('crash_modal_btn')
      .setLabel('⚙️ Custom / Auto')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  const seenIds = new Set();
  const safeButtons = replayButtons.filter((btn) => {
    const id = btn.data.custom_id;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  }).slice(0, 5);

  return [new ActionRowBuilder().addComponents(safeButtons)];
}

/**
 * Builds the Permanent Lobby Panel Embed & ActionRow for the #crash channel.
 */
export function buildCrashLobbyPanel() {
  const crashGif = new AttachmentBuilder(getCrashPreviewGif(), {
    name: 'moonflip_crash_preview.gif',
  });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🚀  MOONFLIP ORBITAL CRASH — REAL-TIME TELEMETRY')
    .setDescription(
      `> Strap into the **Moonflip Orbital Rocket Cockpit**! Watch the real-time exponential trajectory radar climb through the atmosphere and **Cash Out** before hull detonation!\n\n` +
      `### 🛰️ Altitude Zones & Cockpit Controls:\n` +
      `✦ **🛫 Liftoff & Stratosphere (\`1.01x – 1.99x\`)**: High-frequency orbital ascent\n` +
      `✦ **🚀 High Orbit (\`2.00x – 4.99x\`)**: Double to quintuple your token wager\n` +
      `✦ **☄️ Deep Space & Supernova (\`5.00x – 50.0x+\`)**: Massive high-altitude multipliers\n` +
      `✦ **🎯 Live Auto-Cashout**: Lock in a target (\`2.0x\`, \`3.0x\`, \`5.0x\`, \`10x\`, or any custom multiplier) before or during flight for zero-latency ejection!\n\n` +
      `📜 **Recent Orbital Flights**: ${formatCrashHistory()}`
    )
    .setFooter({ text: 'Moonflip Casino • Instant Zero-Lag Cockpit • Provably Fair' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('crash_bet_100')
      .setLabel('🚀 Launch (100 🪙)')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('crash_bet_250')
      .setLabel('🚀 Launch (250 🪙)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('crash_bet_500')
      .setLabel('🔥 High Orbit (500 🪙)')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('crash_modal_btn')
      .setLabel('🎯 Custom / Auto-Cash')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  return { files: [crashGif], embeds: [embed], components: [row] };
}

class ContinuousCrashEngine {
  constructor() {
    this.channel = null;
    this.message = null;
    this.isRunning = false;
  }

  /**
   * Deploys or refreshes the permanent Moonflip Orbital Crash Lobby Panel in #crash.
   */
  async start(guild) {
    try {
      const chans = await guild.channels.fetch().catch(() => guild.channels.cache);
      this.channel = chans.find((c) => c.name && c.name.toLowerCase().includes('crash'));
      if (!this.channel) {
        console.error('[Crash Engine] Could not find #crash channel!');
        return;
      }

      // Clean up previous messages in #crash so the fresh GIF + Lobby Panel is spotless
      const msgs = await this.channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (msgs && msgs.size > 0) {
        await this.channel.bulkDelete(msgs, true).catch(async () => {
          for (const [, m] of msgs) await m.delete().catch(() => {});
        });
      }

      const payload = buildCrashLobbyPanel();
      this.message = await this.channel.send(payload);
      this.isRunning = true;
      console.log('[Crash Engine] Deployed Moonflip Orbital Crash panel in #' + this.channel.name);
    } catch (err) {
      console.error('[Crash Engine Start Error]', err.message);
    }
  }

  /**
   * Launches a personal, rate-limit-free, zero-lag Crash Flight for the player.
   */
  async handleBet(interaction, amount = 100, explicitAutoCashout = undefined) {
    const userId = interaction.user.id;

    if (processingCrashUsers.has(userId)) {
      if (interaction.isButton()) {
        return interaction.deferUpdate().catch(() => {});
      }
      return;
    }
    processingCrashUsers.add(userId);

    try {
      let autoNotice = null;

      // Auto-recover if player had a previous unfinished flight (never let a player get stuck!)
      if (activeCrashFlights.has(userId)) {
        const oldFlight = activeCrashFlights.get(userId);
        oldFlight.stopped = true;
        if (oldFlight.stepTimer) {
          clearTimeout(oldFlight.stepTimer);
          oldFlight.stepTimer = null;
        }
        activeCrashFlights.delete(userId);

        if (!oldFlight.cashedOut && !oldFlight.crashed) {
          if (oldFlight.currentMultiplier > 1.0) {
            const autoWin = Math.floor(oldFlight.betAmount * oldFlight.currentMultiplier);
            addTokens(userId, autoWin, true);
            autoNotice = `✅ **Auto-Eject**: Settled your previous active flight at **${oldFlight.currentMultiplier.toFixed(2)}x** for **+${autoWin.toLocaleString()} 🪙**!`;
          } else {
            addTokens(userId, oldFlight.betAmount, false);
            autoNotice = `🔄 **Launchpad Reset**: Refunded your untouched **${oldFlight.betAmount.toLocaleString()} 🪙** launch and ignited a fresh rocket!`;
          }
        }
      }

      const prefs = getOrCreateUserPrefs(userId);
      const cleanAmount = Math.max(10, Math.floor(amount) || prefs.betAmount || 100);

      let targetAuto = prefs.autoCashout;
      if (explicitAutoCashout !== undefined) {
        targetAuto =
          explicitAutoCashout && explicitAutoCashout >= 1.05
            ? Math.min(1000, Math.round(explicitAutoCashout * 100) / 100)
            : null;
      }

      const prevBalance = getBalance(userId);
      if (prevBalance < cleanAmount) {
        const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this launch requires **\`${cleanAmount.toLocaleString()} 🪙\`**.`;
        if (interaction.replied || interaction.deferred) {
          return await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
        }
        return await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      // Deduct tokens upfront (0ms in-memory)
      deductTokens(userId, cleanAmount);
      prefs.betAmount = cleanAmount;
      prefs.autoCashout = targetAuto;

      const crashPoint = generateCrashMultiplier(cleanAmount);
      const flightId = ++globalFlightCounter;

      const state = {
        flightId,
        userId,
        user: interaction.user,
        interaction,
        betAmount: cleanAmount,
        prevBalance,
        crashPoint,
        currentMultiplier: 1.0,
        autoCashout: targetAuto,
        cashedOut: false,
        cashedViaAuto: false,
        cashoutMult: 1.0,
        winAmount: 0,
        crashed: false,
        stopped: false,
        step: 0,
        stepTimer: null,
        currentEditPromise: null,
      };

      activeCrashFlights.set(userId, state);

      // Frame 0 (0ms — Liftoff at 1.00x via interaction.update or interaction.reply -> 0 PATCH rate limit cost!)
      const initialEmbed = buildCrashCockpitEmbed(state, interaction.user, autoNotice);
      const initialRows = buildFlightActionRow(state);

      const isEphemeralCard =
        interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

      if (!interaction.deferred && !interaction.replied) {
        if (isEphemeralCard) {
          await interaction.update({
            embeds: [initialEmbed],
            components: initialRows,
            files: [],
            attachments: [],
          });
        } else {
          await interaction.reply({
            embeds: [initialEmbed],
            components: initialRows,
            flags: MessageFlags.Ephemeral,
          });
        }
      } else {
        await interaction
          .editReply({ embeds: [initialEmbed], components: initialRows, files: [], attachments: [] })
          .catch(() => {});
      }

      // Schedule sequential flight steps
      const firstDelay = crashPoint <= 1.06 ? 650 : 1100;
      state.stepTimer = setTimeout(() => {
        this.runFlightStep(state).catch(() => {});
      }, firstDelay);
    } finally {
      processingCrashUsers.delete(userId);
    }
  }

  /**
   * Executes a single sequential step of the rocket's ascent.
   * Uses sequential setTimeout (never overlapping setInterval) and stays well under Discord's
   * 5 edits / 5 seconds webhook bucket so the animation never lags or drops frames.
   */
  async runFlightStep(state) {
    if (state.stopped || state.cashedOut || state.crashed) return;
    if (activeCrashFlights.get(state.userId)?.flightId !== state.flightId) return;

    state.step++;

    // Smooth exponential multiplier curve
    const rawNext = 1.0 + Math.pow(state.step * 0.16, 1.48);
    const nextMult = Math.max(
      state.currentMultiplier + 0.08,
      Math.floor(rawNext * 100) / 100
    );

    // 1. Check if Auto-Cashout target was reached before (or at) crashPoint
    if (
      state.autoCashout &&
      nextMult >= state.autoCashout &&
      state.crashPoint >= state.autoCashout
    ) {
      state.stopped = true;
      state.cashedOut = true;
      state.cashedViaAuto = true;
      state.cashoutMult = state.autoCashout;
      state.currentMultiplier = state.autoCashout;
      state.winAmount = Math.floor(state.betAmount * state.cashoutMult);

      activeCrashFlights.delete(state.userId);
      addTokens(state.userId, state.winAmount, true);

      const prefs = getOrCreateUserPrefs(state.userId);
      prefs.streak = (prefs.streak || 0) + 1;
      recordCrashHistory(state.crashPoint);

      const finalEmbed = buildCrashCockpitEmbed(state, state.user);
      const replayRows = buildReplayActionRow(state);

      await state.interaction
        .editReply({ embeds: [finalEmbed], components: replayRows })
        .catch(() => {});
      return;
    }

    // 2. Check if Rocket Crashed!
    if (nextMult >= state.crashPoint) {
      state.stopped = true;
      state.crashed = true;
      state.currentMultiplier = state.crashPoint;

      activeCrashFlights.delete(state.userId);

      const prefs = getOrCreateUserPrefs(state.userId);
      prefs.streak = 0;
      recordCrashHistory(state.crashPoint);

      const crashEmbed = buildCrashCockpitEmbed(state, state.user);
      const replayRows = buildReplayActionRow(state);

      await state.interaction
        .editReply({ embeds: [crashEmbed], components: replayRows })
        .catch(() => {});
      return;
    }

    // 3. Continue Ascent — Update Live Cockpit Frame
    state.currentMultiplier = nextMult;
    const flightEmbed = buildCrashCockpitEmbed(state, state.user);
    const flightRows = buildFlightActionRow(state);

    const editPromise = state.interaction
      .editReply({ embeds: [flightEmbed], components: flightRows })
      .catch(() => null);
    state.currentEditPromise = editPromise;
    await editPromise;
    state.currentEditPromise = null;

    // Re-verify flight hasn't been cashed out or stopped while editReply was in flight
    if (state.stopped || state.cashedOut || state.crashed) return;
    if (activeCrashFlights.get(state.userId)?.flightId !== state.flightId) return;

    const nextDelay = state.step >= 4 ? 1250 : 1150;
    state.stepTimer = setTimeout(() => {
      this.runFlightStep(state).catch(() => {});
    }, nextDelay);
  }

  /**
   * Handles instant 0ms Manual Cash Out (or Mid-Flight Auto-Cashout Target Toggle).
   */
  async handleCashout(interaction, targetMultiplier = null) {
    const userId = interaction.user.id;
    const state = activeCrashFlights.get(userId);

    if (!state || state.stopped || state.cashedOut || state.crashed) {
      // If user clicked on an expired/finished card, smoothly launch a new round with their last bet!
      const prefs = getOrCreateUserPrefs(userId);
      return this.handleBet(interaction, prefs.betAmount, prefs.autoCashout);
    }

    // If the user clicked a Mid-Flight Auto-Cashout Target Button (e.g. 🎯 Auto 2.0x)
    if (targetMultiplier !== null && state.currentMultiplier < targetMultiplier) {
      if (state.autoCashout && Math.abs(state.autoCashout - targetMultiplier) < 0.01) {
        state.autoCashout = null;
      } else {
        state.autoCashout = targetMultiplier;
      }
      const prefs = getOrCreateUserPrefs(userId);
      prefs.autoCashout = state.autoCashout;

      const updatedEmbed = buildCrashCockpitEmbed(state, interaction.user);
      const updatedRows = buildFlightActionRow(state);
      return interaction.update({ embeds: [updatedEmbed], components: updatedRows }).catch(() => {});
    }

    // Otherwise: Instant Manual Cash Out at currentMultiplier!
    state.stopped = true;
    state.cashedOut = true;
    state.cashedViaAuto = false;
    if (state.stepTimer) {
      clearTimeout(state.stepTimer);
      state.stepTimer = null;
    }
    activeCrashFlights.delete(userId);

    state.cashoutMult = state.currentMultiplier;
    state.winAmount = Math.floor(state.betAmount * state.cashoutMult);
    addTokens(userId, state.winAmount, true);

    const prefs = getOrCreateUserPrefs(userId);
    prefs.streak = (prefs.streak || 0) + 1;
    recordCrashHistory(state.crashPoint);

    const finalEmbed = buildCrashCockpitEmbed(state, interaction.user);
    const replayRows = buildReplayActionRow(state);
    const inFlightEdit = state.currentEditPromise;

    await interaction
      .update({ embeds: [finalEmbed], components: replayRows })
      .catch(async () => {
        await interaction
          .editReply({ embeds: [finalEmbed], components: replayRows })
          .catch(() => {});
      });

    // Guarantee that if a frame edit was mid-flight at the exact millisecond of Cash Out,
    // our final Cashed Out state is re-asserted after it settles so it can NEVER be overwritten!
    if (inFlightEdit) {
      await inFlightEdit.catch(() => {});
      await interaction
        .editReply({ embeds: [finalEmbed], components: replayRows })
        .catch(() => {});
    }
  }
}

export const continuousCrash = new ContinuousCrashEngine();
