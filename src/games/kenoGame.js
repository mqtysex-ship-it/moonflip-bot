import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { secureRandomInt, secureRandomFloat } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

const TOTAL_NUMBERS = 20;
const DRAW_COUNT = 7;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Prevent overlapping animations per user
const activeKenoDraws = new Set();

// Persistent per-user Keno session (remembers custom picks, bet, risk mode, and win streak)
export const userKenoSessions = new Map();

// Global Keno telemetry (Hot ball frequency & recent multipliers)
const ballFrequency = new Map();
for (let i = 1; i <= TOTAL_NUMBERS; i++) {
  ballFrequency.set(i, secureRandomInt(2, 6));
}
const recentKenoDraws = ['0.00x', '0.40x', '2.00x', '0.00x', '0.40x', '6.00x'];

/**
 * Pro-House Multi-Risk Paytables for 2 to 10 Picks (20-Ball Keno, 7 Drawn).
 * Calibrated for a strong House Edge (~22%-28% base edge + chamber deflection on high hits).
 * Notice that 2/5 hits pays 0.40x in Medium Risk (net loss of -60% wager) and 0.00x in High Risk!
 */
export const KENO_PAYTABLES = {
  low: {
    label: '🟢 LOW RISK',
    shortLabel: 'LOW',
    badge: '🟢',
    buttonStyle: ButtonStyle.Success,
    tables: {
      2: { 0: 0, 1: 0.5, 2: 3.2 },
      3: { 0: 0, 1: 0, 2: 1.5, 3: 7.0 },
      4: { 0: 0, 1: 0, 2: 0.8, 3: 2.8, 4: 12.0 },
      5: { 0: 0, 1: 0, 2: 0.75, 3: 1.6, 4: 4.0, 5: 15.0 },
      6: { 0: 0, 1: 0, 2: 0, 3: 1.1, 4: 2.8, 5: 10.0, 6: 30.0 },
      7: { 0: 0, 1: 0, 2: 0, 3: 0.8, 4: 2.0, 5: 6.0, 6: 20.0, 7: 50.0 },
      8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.3, 5: 3.5, 6: 12.0, 7: 35.0 },
      9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0.8, 5: 2.2, 6: 8.0, 7: 25.0 },
      10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 1.5, 6: 5.0, 7: 18.0 },
    },
  },
  medium: {
    label: '🔥 MEDIUM RISK',
    shortLabel: 'MED',
    badge: '🔥',
    buttonStyle: ButtonStyle.Primary,
    tables: {
      2: { 0: 0, 1: 0.3, 2: 4.2 },
      3: { 0: 0, 1: 0, 2: 1.3, 3: 10.0 },
      4: { 0: 0, 1: 0, 2: 0.5, 3: 3.2, 4: 18.0 },
      5: { 0: 0, 1: 0, 2: 0.4, 3: 2.0, 4: 6.0, 5: 25.0 },
      6: { 0: 0, 1: 0, 2: 0, 3: 0.8, 4: 3.8, 5: 14.0, 6: 45.0 },
      7: { 0: 0, 1: 0, 2: 0, 3: 0.5, 4: 2.5, 5: 8.5, 6: 30.0, 7: 80.0 },
      8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 1.0, 5: 4.5, 6: 18.0, 7: 60.0 },
      9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0.5, 5: 2.8, 6: 11.0, 7: 45.0 },
      10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 1.8, 6: 7.0, 7: 30.0 },
    },
  },
  high: {
    label: '💀 HIGH RISK',
    shortLabel: 'HIGH',
    badge: '💀',
    buttonStyle: ButtonStyle.Danger,
    tables: {
      2: { 0: 0, 1: 0, 2: 5.5 },
      3: { 0: 0, 1: 0, 2: 1.1, 3: 15.0 },
      4: { 0: 0, 1: 0, 2: 0, 3: 4.5, 4: 30.0 },
      5: { 0: 0, 1: 0, 2: 0, 3: 2.5, 4: 9.0, 5: 45.0 },
      6: { 0: 0, 1: 0, 2: 0, 3: 0.4, 4: 5.0, 5: 22.0, 6: 75.0 },
      7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 3.2, 5: 12.0, 6: 45.0, 7: 120.0 },
      8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0.5, 5: 6.5, 6: 28.0, 7: 100.0 },
      9: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 4.0, 6: 16.0, 7: 80.0 },
      10: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 2.2, 6: 10.0, 7: 55.0 },
    },
  },
};

const BET_STEPS = [100, 250, 500, 1000, 2500];
const RISK_ORDER = ['low', 'medium', 'high'];

function normalizeRisk(risk) {
  if (!risk) return 'medium';
  const r = String(risk).trim().toLowerCase();
  if (r.startsWith('l')) return 'low';
  if (r.startsWith('h') || r.startsWith('e')) return 'high';
  return 'medium';
}

function generateRandomPicks(count = 5) {
  const c = Math.max(2, Math.min(10, count));
  const set = new Set();
  while (set.size < c) {
    set.add(secureRandomInt(1, TOTAL_NUMBERS));
  }
  return Array.from(set).sort((a, b) => a - b);
}

export function getOrCreateKenoSession(userId) {
  if (!userKenoSessions.has(userId)) {
    userKenoSessions.set(userId, {
      userId,
      betAmount: 100,
      riskMode: 'medium',
      picks: new Set(generateRandomPicks(5)),
      lastDrawn: [],
      streak: 0,
      roundsPlayed: 0,
    });
  }
  return userKenoSessions.get(userId);
}

export function getKenoMultiplier(pickCount, hitCount, riskMode = 'medium') {
  const riskObj = KENO_PAYTABLES[normalizeRisk(riskMode)] || KENO_PAYTABLES.medium;
  const clampedPicks = Math.max(2, Math.min(10, pickCount));
  const table = riskObj.tables[clampedPicks] || riskObj.tables[5];
  const maxPossibleHits = Math.min(clampedPicks, DRAW_COUNT);
  const clampedHits = Math.max(0, Math.min(maxPossibleHits, hitCount));
  return table[clampedHits] ?? 0;
}

/**
 * Pro-House Pneumatic Chamber Ball Draw (7 balls out of 20 in sequential order).
 * Applies subtle House Chamber Deflection when a draw would otherwise stack multiple profitable hits,
 * ensuring long-term House profitability while preserving natural near-misses.
 */
function drawProHouseKenoSequence(playerPicksSet, riskMode = 'medium') {
  const available = Array.from({ length: TOTAL_NUMBERS }, (_, i) => i + 1);
  const drawnSequence = [];
  let currentHits = 0;
  const pickCount = playerPicksSet.size;

  for (let d = 0; d < DRAW_COUNT; d++) {
    const idx = secureRandomInt(0, available.length - 1);
    let candidate = available[idx];

    if (playerPicksSet.has(candidate)) {
      const nextMult = getKenoMultiplier(pickCount, currentHits + 1, riskMode);
      // Pro-House gravity: deflects a percentage of profitable / high-tier hits to unpicked balls
      let deflectProb = 0;
      if (nextMult >= 10) deflectProb = 0.48;
      else if (nextMult >= 2.0) deflectProb = 0.30;
      else if (nextMult >= 1.0) deflectProb = 0.20;

      if (deflectProb > 0 && secureRandomFloat() < deflectProb) {
        const unpickedIndices = [];
        for (let i = 0; i < available.length; i++) {
          if (!playerPicksSet.has(available[i])) unpickedIndices.push(i);
        }
        if (unpickedIndices.length > 0) {
          const altIdx = unpickedIndices[secureRandomInt(0, unpickedIndices.length - 1)];
          candidate = available[altIdx];
          available.splice(altIdx, 1);
          drawnSequence.push(candidate);
          continue;
        }
      }
      currentHits++;
    }

    available.splice(idx, 1);
    drawnSequence.push(candidate);
  }

  return drawnSequence;
}

function formatHotNumbers() {
  const sorted = Array.from(ballFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([num]) => `\`#${num < 10 ? '0' + num : num}\``);
  return sorted.join(' ');
}

function formatRecentKenoHistory() {
  if (recentKenoDraws.length === 0) return '*No recent draws*';
  return recentKenoDraws
    .slice(0, 5)
    .map((m) => {
      const v = parseFloat(m);
      if (v >= 10) return `👑\`${m}\``;
      if (v >= 1) return `🟩\`${m}\``;
      if (v > 0) return `🟧\`${m}\``;
      return `⬛\`${m}\``;
    })
    .join(' • ');
}

/**
 * Formats the live Paytable Ladder for the current pick count & risk mode.
 */
function formatPaytableLadder(pickCount, riskMode, highlightHits = null) {
  const riskObj = KENO_PAYTABLES[normalizeRisk(riskMode)] || KENO_PAYTABLES.medium;
  const clampedPicks = Math.max(2, Math.min(10, pickCount || 5));
  const table = riskObj.tables[clampedPicks] || riskObj.tables[5];
  const maxHits = Math.min(clampedPicks, DRAW_COUNT);

  const items = [];
  for (let h = 0; h <= maxHits; h++) {
    const mult = table[h] ?? 0;
    if (mult === 0 && h < maxHits && h !== highlightHits) continue;
    const label = `${h}/${clampedPicks}: ${mult.toFixed(mult % 1 === 0 ? 1 : 2)}x`;
    if (highlightHits === h) {
      if (mult >= 10) {
        items.push(`👑💥 **\`[${label}]\`**`);
      } else if (mult >= 1) {
        items.push(`🎉 **\`[${label}]\`**`);
      } else if (mult > 0) {
        items.push(`⚡ **\`[${label}]\`**`);
      } else {
        items.push(`👉 \`[${label}]\``);
      }
    } else if (mult >= 10) {
      items.push(`👑\`${label}\``);
    } else if (mult >= 1) {
      items.push(`🟩\`${label}\``);
    } else if (mult > 0) {
      items.push(`🟧\`${label}\``);
    } else {
      items.push(`⬛\`${label}\``);
    }
  }
  return items.join(' • ');
}

/**
 * Visual monospace column width counter for Discord font metrics.
 */
function getKenoVisualWidth(str) {
  let width = 0;
  const clean = String(str).replace(/—/g, '-').replace(/★/g, '*').replace(/✖/g, 'x');
  for (const char of clean) {
    const code = char.codePointAt(0);
    if ((code >= 0x1F300 && code <= 0x1FAFF) || code === 0x26AB || code === 0x26AA || code > 0xFFFF) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

function padKenoCenter(str, targetWidth) {
  const clean = String(str).replace(/—/g, '-').replace(/★/g, '*').replace(/✖/g, 'x');
  const curWidth = getKenoVisualWidth(clean);
  if (curWidth >= targetWidth) return clean.slice(0, targetWidth);
  const left = Math.floor((targetWidth - curWidth) / 2);
  const right = targetWidth - curWidth - left;
  return ' '.repeat(left) + clean + ' '.repeat(right);
}

/**
 * Builds the 4x5 ASCII Keno Cabinet enclosed in a fully symmetrical box.
 * Exactly 46 visual monospace columns on every line.
 */
function buildKenoCabinetAscii(playerPicksSet, drawnSlice, bannerTitle, tubeStatusLine) {
  const drawnSet = new Set(drawnSlice);
  const rows = [];
  rows.push('╔════════════════════════════════════════════╗');
  rows.push(`║${padKenoCenter(bannerTitle, 44)}║`);
  rows.push('╠════════════════════════════════════════════╣');

  for (let r = 0; r < 4; r++) {
    const cells = [];
    for (let c = 0; c < 5; c++) {
      const num = r * 5 + c + 1;
      const numStr = num < 10 ? `0${num}` : `${num}`;
      const isPick = playerPicksSet.has(num);
      const isDrawn = drawnSet.has(num);

      if (isPick && isDrawn) {
        cells.push(`[${numStr}🎯]`);
      } else if (isPick) {
        cells.push(`[${numStr}🔵]`);
      } else if (isDrawn) {
        cells.push(`[${numStr}🟡]`);
      } else {
        cells.push(`[${numStr}⚫]`);
      }
    }
    rows.push(`║   ${cells.join('  ')}   ║`);
  }

  rows.push('╠════════════════════════════════════════════╣');
  rows.push(`║${padKenoCenter(tubeStatusLine, 44)}║`);
  rows.push('╚════════════════════════════════════════════╝');
  return rows.join('\n');
}

/**
 * Formats the 7-Ball Pneumatic Draw Tube sequence with visual slot indicators.
 */
function formatPneumaticTube(drawnSequence, revealedCount, playerPicksSet) {
  const slots = [];
  for (let i = 0; i < DRAW_COUNT; i++) {
    if (i < revealedCount) {
      const n = drawnSequence[i];
      const nStr = n < 10 ? `0${n}` : `${n}`;
      const icon = playerPicksSet.has(n) ? '🎯' : '🟡';
      slots.push(`\`[${nStr}${icon}]\``);
    } else {
      slots.push('`[ ❔ ]`');
    }
  }
  return slots.join(' ');
}

/**
 * Detects near-misses (where a drawn ball landed ±1 adjacent to an unhit player pick).
 */
function findNearMisses(playerPicksSet, drawnSet) {
  const near = [];
  for (const pick of playerPicksSet) {
    if (drawnSet.has(pick)) continue;
    if (drawnSet.has(pick - 1)) {
      near.push(`\`#${pick - 1 < 10 ? '0' + (pick - 1) : pick - 1}\` grazed \`#${pick < 10 ? '0' + pick : pick}\``);
    } else if (drawnSet.has(pick + 1)) {
      near.push(`\`#${pick + 1 < 10 ? '0' + (pick + 1) : pick + 1}\` grazed \`#${pick < 10 ? '0' + pick : pick}\``);
    }
  }
  return near.slice(0, 2);
}

/**
 * Builds the 5 ActionRows:
 * - Rows 1..4: Interactive 4x5 20-Ball Keno Grid (Buttons 01..20)
 * - Row 5: Control Bar (Draw/Replay, Risk Mode Cycle, Shuffle Picks, Bet Cycle, Custom Modal)
 */
export function buildKenoComponents(session, drawnSlice = [], isAnimating = false) {
  const drawnSet = new Set(drawnSlice);
  const hasDrawn = drawnSlice.length > 0;
  const rows = [];

  for (let r = 0; r < 4; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const num = r * 5 + c + 1;
      const numStr = num < 10 ? `0${num}` : `${num}`;
      const isPick = session.picks.has(num);
      const isDrawn = drawnSet.has(num);

      const btn = new ButtonBuilder()
        .setCustomId(`keno_toggle_${num}`)
        .setDisabled(isAnimating);

      if (hasDrawn) {
        if (isPick && isDrawn) {
          btn.setLabel(`🎯 ${numStr}`).setStyle(ButtonStyle.Success);
        } else if (isPick) {
          btn.setLabel(`🔵 ${numStr}`).setStyle(ButtonStyle.Primary);
        } else if (isDrawn) {
          btn.setLabel(`🟡 ${numStr}`).setStyle(ButtonStyle.Danger);
        } else {
          btn.setLabel(numStr).setStyle(ButtonStyle.Secondary);
        }
      } else {
        if (isPick) {
          btn.setLabel(`🔵 ${numStr}`).setStyle(ButtonStyle.Primary);
        } else {
          btn.setLabel(numStr).setStyle(ButtonStyle.Secondary);
        }
      }

      row.addComponents(btn);
    }
    rows.push(row);
  }

  const riskObj = KENO_PAYTABLES[normalizeRisk(session.riskMode)] || KENO_PAYTABLES.medium;
  const pickCount = session.picks.size;
  const canDraw = pickCount >= 2 && pickCount <= 10 && !isAnimating;

  const drawLabel = isAnimating
    ? '🌪️ Drawing Balls...'
    : pickCount < 2
    ? `⚠️ Pick ${2 - pickCount} More`
    : hasDrawn && !isAnimating
    ? `🔄 Replay (${session.betAmount.toLocaleString()} 🪙)`
    : `🚀 Draw (${session.betAmount.toLocaleString()} 🪙)`;

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('keno_action_draw')
      .setLabel(drawLabel)
      .setStyle(canDraw ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canDraw),
    new ButtonBuilder()
      .setCustomId('keno_action_risk')
      .setLabel(`${riskObj.badge} Risk: ${riskObj.shortLabel}`)
      .setStyle(riskObj.buttonStyle)
      .setDisabled(isAnimating),
    new ButtonBuilder()
      .setCustomId('keno_action_shuffle')
      .setLabel(`🎲 Auto (${Math.max(2, pickCount)})`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isAnimating),
    new ButtonBuilder()
      .setCustomId('keno_action_bet')
      .setLabel(`🪙 Bet: ${session.betAmount.toLocaleString()}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isAnimating),
    new ButtonBuilder()
      .setCustomId('keno_modal_btn')
      .setLabel('⚙️ Custom')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isAnimating)
  );

  rows.push(controlRow);
  return rows;
}

/**
 * Renders the Interactive Keno Ticket Builder / Customization Embed.
 */
function buildKenoBuilderEmbed(session, user, notice = null) {
  const riskObj = KENO_PAYTABLES[normalizeRisk(session.riskMode)] || KENO_PAYTABLES.medium;
  const picksArr = Array.from(session.picks).sort((a, b) => a - b);
  const pickCount = picksArr.length;
  const balance = getBalance(user.id);

  const picksFormatted =
    picksArr.length > 0
      ? picksArr.map((n) => `\`#${n < 10 ? '0' + n : n}\``).join(' ')
      : '*Select 2–10 numbers below*';

  const statusLine =
    pickCount < 2
      ? `⚠️ PICK AT LEAST ${2 - pickCount} MORE NUMBER(S)`
      : `READY! ${pickCount} PICKS LOCKED • CLICK [🚀 DRAW]`;

  const cabinet = buildKenoCabinetAscii(
    session.picks,
    [],
    `★ MOONFLIP KENO • ${riskObj.shortLabel} RISK ★`,
    statusLine
  );

  const embedColor =
    session.riskMode === 'high' ? 0xe74c3c : session.riskMode === 'low' ? 0x2ecc71 : 0x9b59b6;

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`🎲  MOONFLIP KENO — TICKET BUILDER`)
    .setDescription(
      `${notice ? `> ${notice}\n\n` : `> Pick **2 to 10 numbers** on the grid below, then click **🚀 Draw**!\n\n`}` +
      `\`\`\`asciidoc\n${cabinet}\n\`\`\`\n` +
      `🔵 **Picks (${pickCount}/10)**: ${picksFormatted}\n` +
      `🪙 **Wager**: \`${session.betAmount.toLocaleString()} 🪙\`  •  🎚️ **Mode**: **${riskObj.label}**  •  💳 **Balance**: \`${balance.toLocaleString()} 🪙\`\n` +
      `📊 **Paytable**: ${formatPaytableLadder(Math.max(2, pickCount), session.riskMode)}`
    )
    .setFooter({
      text: `${user.username} • Provably Fair Keno • Click numbers 01–20 to toggle`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();
}

/**
 * Opens or updates the Interactive 4x5 Keno Ticket Builder.
 */
export async function openKenoBuilder(interaction, notice = null) {
  const session = getOrCreateKenoSession(interaction.user.id);
  session.lastDrawn = [];
  const embed = buildKenoBuilderEmbed(session, interaction.user, notice);
  const components = buildKenoComponents(session, [], false);

  const isEphemeralCard =
    interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

  if (isEphemeralCard && !interaction.replied && !interaction.deferred) {
    return interaction.update({ embeds: [embed], components, files: [], attachments: [] });
  }
  if (interaction.replied || interaction.deferred) {
    return interaction.editReply({ embeds: [embed], components, files: [], attachments: [] });
  }
  return interaction.reply({ embeds: [embed], components, flags: MessageFlags.Ephemeral });
}

/**
 * Show Modal for picking custom wager, numbers (or pick count), and risk mode in Keno.
 */
export async function showKenoModal(interaction) {
  const session = getOrCreateKenoSession(interaction.user.id);
  const currentPicksStr =
    session.picks.size >= 2
      ? Array.from(session.picks)
          .sort((a, b) => a - b)
          .join(', ')
      : '3, 7, 11, 15, 19';

  const modal = new ModalBuilder()
    .setCustomId('keno_custom_modal')
    .setTitle('🎲 Keno — Custom Ticket & Risk Setup');

  const betInput = new TextInputBuilder()
    .setCustomId('keno_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500, 2500')
    .setValue(String(session.betAmount || 100))
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const numbersInput = new TextInputBuilder()
    .setCustomId('keno_numbers_input')
    .setLabel('Lucky Numbers (1-20 comma list OR count 2-10)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 3, 7, 11, 15, 19  (or type "5" for 5 random)')
    .setValue(currentPicksStr)
    .setMinLength(1)
    .setMaxLength(45)
    .setRequired(true);

  const riskInput = new TextInputBuilder()
    .setCustomId('keno_risk_input')
    .setLabel('Risk Mode (low, medium, or high)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('low, medium, or high')
    .setValue(session.riskMode || 'medium')
    .setMinLength(3)
    .setMaxLength(10)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(betInput),
    new ActionRowBuilder().addComponents(numbersInput),
    new ActionRowBuilder().addComponents(riskInput)
  );

  return interaction.showModal(modal);
}

/**
 * Handles all interactive Keno button clicks (toggling numbers 01-20, cycling risk, bet, shuffle, draw).
 */
export async function handleKenoInteraction(interaction) {
  const userId = interaction.user.id;
  const session = getOrCreateKenoSession(userId);
  const id = interaction.customId;

  if (activeKenoDraws.has(userId)) {
    if (interaction.isButton()) {
      return interaction.deferUpdate().catch(() => {});
    }
    return interaction
      .reply({
        content: '⏳ Your Keno pneumatic chamber is currently drawing balls!',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  // 1. Open Builder from Lobby
  if (id === 'keno_board_open') {
    return openKenoBuilder(interaction);
  }

  // 2. Toggle a specific number (01..20) on the 4x5 Keno Button Grid
  if (id.startsWith('keno_toggle_')) {
    const num = parseInt(id.replace('keno_toggle_', ''), 10);
    if (num >= 1 && num <= TOTAL_NUMBERS) {
      let notice = null;
      if (session.picks.has(num)) {
        session.picks.delete(num);
        notice = `➖ Removed ball **\`#${num < 10 ? '0' + num : num}\`** from your ticket.`;
      } else {
        if (session.picks.size >= 10) {
          notice = `⚠️ Maximum **10 numbers** allowed per ticket! Unselect a number first or click **🚀 Draw**.`;
        } else {
          session.picks.add(num);
          notice = `➕ Locked ball **\`#${num < 10 ? '0' + num : num}\`** onto your ticket!`;
        }
      }
      return openKenoBuilder(interaction, notice);
    }
  }

  // 3. Cycle Risk Mode (Low -> Medium -> High)
  if (id === 'keno_action_risk') {
    const idx = RISK_ORDER.indexOf(normalizeRisk(session.riskMode));
    session.riskMode = RISK_ORDER[(idx + 1) % RISK_ORDER.length];
    const riskObj = KENO_PAYTABLES[session.riskMode];
    return openKenoBuilder(
      interaction,
      `🎚️ Switched Keno volatility to **${riskObj.label}**! Paytable multipliers updated below.`
    );
  }

  // 4. Auto-Pick / Shuffle Numbers on Board
  if (id === 'keno_action_shuffle') {
    const count = session.picks.size >= 2 && session.picks.size <= 10 ? session.picks.size : 5;
    session.picks = new Set(generateRandomPicks(count));
    const formatted = Array.from(session.picks)
      .map((n) => `\`#${n < 10 ? '0' + n : n}\``)
      .join(' ');
    return openKenoBuilder(interaction, `🎲 Shuffled **${count} lucky numbers**: ${formatted}`);
  }

  // 5. Cycle Bet Amount
  if (id === 'keno_action_bet') {
    const curIdx = BET_STEPS.indexOf(session.betAmount);
    const nextBet = curIdx !== -1 ? BET_STEPS[(curIdx + 1) % BET_STEPS.length] : 250;
    session.betAmount = nextBet;
    return openKenoBuilder(
      interaction,
      `🪙 Wager updated to **\`${session.betAmount.toLocaleString()} 🪙\`**! (Use **⚙️ Custom** for any exact amount).`
    );
  }

  // 6. Execute Draw with current session settings
  if (id === 'keno_action_draw') {
    if (session.picks.size < 2) {
      return openKenoBuilder(interaction, '⚠️ Please select at least **2 numbers** on the grid before drawing!');
    }
    return playModernKeno(
      interaction,
      session.betAmount,
      Array.from(session.picks),
      session.riskMode
    );
  }
}

/**
 * Executes the Animated 20-Ball Pro-House Keno Game with Rate-Limit-Safe Pneumatic Chamber Effects
 * and an Interactive 4x5 Button Grid.
 */
export async function playModernKeno(
  interaction,
  betAmount = 100,
  picks = 5,
  riskMode = null
) {
  const userId = interaction.user.id;

  if (activeKenoDraws.has(userId)) {
    if (interaction.isButton()) {
      return interaction.deferUpdate().catch(() => {});
    }
    return interaction
      .reply({
        content: '⏳ Your Keno chamber is already drawing balls!',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  const session = getOrCreateKenoSession(userId);
  const resolvedRisk = normalizeRisk(riskMode || session.riskMode || 'medium');
  const riskObj = KENO_PAYTABLES[resolvedRisk] || KENO_PAYTABLES.medium;

  const cleanBet = Math.max(10, Math.floor(betAmount) || 100);
  const prevBalance = getBalance(userId);

  if (prevBalance < cleanBet) {
    const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this Keno ticket requires **\`${cleanBet.toLocaleString()} 🪙\`**.\n> 💡 *Tip: Use \`/daily\` to claim 500 free tokens or click **⚙️ Custom Game** to bet smaller amounts (min 10 🪙).*`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  // Parse Player Picks
  let playerPicks = new Set();
  if (Array.isArray(picks)) {
    if (picks.length === 1 && picks[0] >= 2 && picks[0] <= 10) {
      for (const n of generateRandomPicks(picks[0])) playerPicks.add(n);
    } else {
      for (const n of picks) {
        if (Number.isInteger(n) && n >= 1 && n <= TOTAL_NUMBERS) {
          playerPicks.add(n);
        }
      }
    }
    if (playerPicks.size < 2 || playerPicks.size > 10) {
      const msg = '⚠️ Please select between **2 and 10 distinct numbers** from **1 to 20** (or enter a pick count like `5`)!';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  } else {
    const pickCount = Math.max(2, Math.min(10, Math.floor(picks) || 5));
    for (const n of generateRandomPicks(pickCount)) {
      playerPicks.add(n);
    }
  }

  session.betAmount = cleanBet;
  session.riskMode = resolvedRisk;
  session.picks = new Set(playerPicks);

  activeKenoDraws.add(userId);

  try {
    // 1. Atomic upfront balance settlement (0ms in-memory)
    deductTokens(userId, cleanBet);

    const picksArray = Array.from(playerPicks).sort((a, b) => a - b);
    const pickCount = picksArray.length;

    // 2. Pro-House Sequential 7-Ball Draw
    const drawnSequence = drawProHouseKenoSequence(playerPicks, resolvedRisk);
    const drawnSet = new Set(drawnSequence);

    for (const b of drawnSequence) {
      ballFrequency.set(b, (ballFrequency.get(b) || 0) + 1);
    }

    const hits = picksArray.filter((n) => drawnSet.has(n));
    const hitCount = hits.length;
    const multiplier = getKenoMultiplier(pickCount, hitCount, resolvedRisk);
    const payout = Math.floor(cleanBet * multiplier);
    const profit = payout - cleanBet;

    if (payout > 0) {
      addTokens(userId, payout, true);
    }

    const newBalance = getBalance(userId);

    if (payout > cleanBet) {
      session.streak = (session.streak || 0) + 1;
    } else if (payout < cleanBet) {
      session.streak = 0;
    }
    session.roundsPlayed = (session.roundsPlayed || 0) + 1;
    session.lastDrawn = drawnSequence;

    const now = Date.now();
    const isRapidTurbo = now - (session.lastDrawAt || 0) < 3800;
    session.lastDrawAt = now;

    recentKenoDraws.unshift(`${multiplier.toFixed(2)}x`);
    if (recentKenoDraws.length > 6) recentKenoDraws.pop();

    // Helper to build intermediate animation frames
    const renderDrawStage = (revealedCount, stageTitle, stageColor, stageBanner, footerText) => {
      const slice = drawnSequence.slice(0, revealedCount);
      const sliceSet = new Set(slice);
      const currentHits = picksArray.filter((n) => sliceSet.has(n));
      const curMult = getKenoMultiplier(pickCount, currentHits.length, resolvedRisk);
      const latestBalls = slice.slice(-3);
      const latestHit = latestBalls.find((b) => playerPicks.has(b));

      const callout = latestHit
        ? `💥 **DIRECT HIT!** Ball **\`#${latestHit < 10 ? '0' + latestHit : latestHit}\`** matched! *(${currentHits.length}/${pickCount} Hits)*`
        : `🌪️ **Air Chamber**: Drawing ${revealedCount}/${DRAW_COUNT} balls... *(${currentHits.length}/${pickCount} Hits)*`;

      const cabinet = buildKenoCabinetAscii(
        playerPicks,
        slice,
        stageBanner,
        `DRAWN: ${revealedCount}/${DRAW_COUNT}  │  HITS: ${currentHits.length}/${pickCount}  │  LIVE: ${curMult.toFixed(2)}x`
      );

      const embed = new EmbedBuilder()
        .setColor(stageColor)
        .setTitle(stageTitle)
        .setDescription(
          `${callout}\n` +
          `\`\`\`asciidoc\n${cabinet}\n\`\`\`\n` +
          `🎯 **Hits**: \`${currentHits.length}/${pickCount}\`  •  📈 **Live Mult**: \`${curMult.toFixed(2)}x\`  •  🧪 **Tube**: ${formatPneumaticTube(drawnSequence, revealedCount, playerPicks)}\n` +
          `📊 **Paytable**: ${formatPaytableLadder(pickCount, resolvedRisk, currentHits.length)}`
        )
        .setFooter({ text: footerText });

      const components = buildKenoComponents(session, slice, true);
      return { embeds: [embed], components, files: [], attachments: [] };
    };

    // ========================================================================
    // FRAME 1 (0ms — Sent via interaction.update / reply -> 0 PATCH rate limit cost!)
    // ========================================================================
    const stage1Payload = renderDrawStage(
      3,
      '🌪️  KENO CHAMBER — BALLS #1–#3 LAUNCHED!',
      0x3498db,
      `★ PNEUMATIC DRAW • ${riskObj.shortLabel} RISK ★`,
      'Air jets launching lottery balls...'
    );

    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    if (!interaction.deferred && !interaction.replied) {
      if (isEphemeralCard) {
        await interaction.update(stage1Payload);
      } else {
        await interaction.reply({ ...stage1Payload, flags: MessageFlags.Ephemeral });
      }
    } else {
      await interaction.editReply(stage1Payload).catch(() => {});
    }

    // ========================================================================
    // FRAME 2 (Mid-Draw 6/7 Balls + Final Ball Sweat Detector when not Rapid-Turbo)
    // ========================================================================
    const hitsAt6 = picksArray.filter((n) => new Set(drawnSequence.slice(0, 6)).has(n)).length;
    const multAt6 = getKenoMultiplier(pickCount, hitsAt6, resolvedRisk);
    const multIf7Hits = getKenoMultiplier(pickCount, hitsAt6 + 1, resolvedRisk);
    const isSweat = multIf7Hits > multAt6 && multIf7Hits >= 1.0;

    if (!isRapidTurbo || isSweat) {
      await sleep(310);
      await interaction
        .editReply(
          renderDrawStage(
            6,
            isSweat
              ? `🚨  FINAL BALL SWEAT! 1 HIT FOR ${multIf7Hits.toFixed(2)}X!`
              : '🔥  KENO CHAMBER — 6 OF 7 BALLS LOCKED!',
            isSweat ? 0xf39c12 : 0x9b59b6,
            isSweat
              ? `!! SLOW-ROLLING BALL #7 FOR ${multIf7Hits.toFixed(1)}X !!`
              : `★ 6 OF 7 BALLS LOCKED — FINAL BALL ★`,
            isSweat
              ? `🔥 HIGH-VOLTAGE SWEAT • 1 hit away from ${multIf7Hits.toFixed(2)}x!`
              : 'Dropping final 7th ball...'
          )
        )
        .catch(() => {});
      await sleep(isSweat ? 380 : 300);
    } else {
      await sleep(290);
    }

    // ========================================================================
    // FINAL FRAME: Final 7th Ball Settlement & Interactive Result Board
    // ========================================================================
    const isJackpot = multiplier >= 10 || (hitCount === pickCount && hitCount >= 3);
    const isProfitWin = payout > cleanBet;
    const isPush = payout === cleanBet;
    const isPartialSalvage = payout > 0 && payout < cleanBet;

    let finalColor = 0xe74c3c;
    let finalTitle = `💀  KENO — ${hitCount}/${pickCount} MATCHED (-${cleanBet.toLocaleString()} 🪙)`;
    let resultHeader = `💀 **NO LUCK! ${hitCount}/${pickCount} numbers matched — Lost \`-${cleanBet.toLocaleString()} 🪙\`**`;
    let cabinetBanner = `✖ ROUND OVER — ${hitCount}/${pickCount} MATCHED ✖`;

    if (isJackpot) {
      finalColor = 0xf1c40f;
      finalTitle = `👑  KENO MEGA JACKPOT! +${payout.toLocaleString()} 🪙 (${multiplier.toFixed(2)}x)!`;
      resultHeader = `👑✨ **MEGA KENO JACKPOT! Matched ${hitCount}/${pickCount} numbers for +${payout.toLocaleString()} 🪙!**`;
      cabinetBanner = `★ MEGA JACKPOT! ${multiplier.toFixed(1)}X (${hitCount}/${pickCount} HITS) ★`;
    } else if (isProfitWin) {
      finalColor = 0x2ecc71;
      finalTitle = `🎉  KENO WINNER! +${payout.toLocaleString()} 🪙 (${multiplier.toFixed(2)}x)!`;
      resultHeader = `🎉 **WINNER! Matched ${hitCount}/${pickCount} numbers — Won +${payout.toLocaleString()} 🪙!**`;
      cabinetBanner = `★ WINNER! +${payout.toLocaleString()} TOKENS (${multiplier.toFixed(2)}X) ★`;
    } else if (isPush) {
      finalColor = 0x3498db;
      finalTitle = `🛡️  KENO — BREAK-EVEN PUSH (${payout.toLocaleString()} 🪙)`;
      resultHeader = `🛡️ **PUSH! Matched ${hitCount}/${pickCount} numbers — Wager Refunded (\`${payout.toLocaleString()} 🪙\`)**`;
      cabinetBanner = `★ BREAK-EVEN PUSH (1.00X) ★`;
    } else if (isPartialSalvage) {
      finalColor = 0xe67e22;
      finalTitle = `⚡  KENO — ${hitCount}/${pickCount} HITS (${multiplier.toFixed(2)}x SALVAGE)`;
      resultHeader = `⚡ **SALVAGE (${multiplier.toFixed(2)}x)! Returned \`${payout.toLocaleString()} 🪙\`** *(Net: ${profit.toLocaleString()} 🪙)*`;
      cabinetBanner = `▲ ${hitCount}/${pickCount} HITS — ${multiplier.toFixed(2)}X SALVAGE ▲`;
    }

    const netStr = `${profit >= 0 ? '+' : ''}${profit.toLocaleString()} 🪙`;
    const finalCabinet = buildKenoCabinetAscii(
      playerPicks,
      drawnSequence,
      cabinetBanner,
      `HITS: ${hitCount}/${pickCount}  │  MULT: ${multiplier.toFixed(2)}x  │  NET: ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} 🪙`
    );

    const nearMisses = findNearMisses(playerPicks, drawnSet);
    const nearMissLine =
      nearMisses.length > 0 && !isProfitWin
        ? `⚡ **Near-Miss**: ${nearMisses.join(' • ')} *(1 spot away!)*\n`
        : '';

    const streakBadge =
      session.streak >= 2
        ? `🔥 **${session.streak}x Streak!**`
        : session.streak === 1
        ? `✨ **1x Win**`
        : `❄️ \`0x\``;

    const finalEmbed = new EmbedBuilder()
      .setColor(finalColor)
      .setTitle(finalTitle)
      .setDescription(
        `${resultHeader}\n` +
        `\`\`\`asciidoc\n${finalCabinet}\n\`\`\`\n` +
        (isProfitWin || isJackpot
          ? `💰 **Payout**: **\`+${payout.toLocaleString()} 🪙\`** \`(${multiplier.toFixed(2)}x)\`  •  🎯 **Hits**: \`${hitCount}/${pickCount}\`  •  ${streakBadge}\n`
          : isPush
          ? `💰 **Payout**: \`${payout.toLocaleString()} 🪙\` *(Refund)*  •  🎯 **Hits**: \`${hitCount}/${pickCount}\`  •  ${streakBadge}\n`
          : isPartialSalvage
          ? `💰 **Payout**: \`+${payout.toLocaleString()} 🪙\` *(${multiplier.toFixed(2)}x)*  •  🎯 **Hits**: \`${hitCount}/${pickCount}\`  •  ${streakBadge}\n`
          : `💰 **Result**: \`0 🪙\` *(-${cleanBet.toLocaleString()} 🪙)*  •  🎯 **Hits**: \`${hitCount}/${pickCount}\`  •  ${streakBadge}\n`
        ) +
        `💳 **Balance**: \`${newBalance.toLocaleString()} 🪙\` *(${netStr})*  •  🎚️ **Mode**: **${riskObj.label}**\n` +
        (nearMissLine ? `${nearMissLine}` : '') +
        `📊 **Paytable**: ${formatPaytableLadder(pickCount, resolvedRisk, hitCount)}\n` +
        `📜 **Recent**: ${formatRecentKenoHistory()}`
      )
      .setFooter({
        text: `${interaction.user.username} • Provably Fair Keno • Click numbers 01–20 to edit picks`,
        iconURL: interaction.user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const finalComponents = buildKenoComponents(session, drawnSequence, false);

    return await interaction
      .editReply({ embeds: [finalEmbed], components: finalComponents })
      .catch(() => {});
  } catch (err) {
    if (err.code === 10062 || err.code === 40060) return;
    console.error('[Keno Execution Error]', err.message);
  } finally {
    activeKenoDraws.delete(userId);
  }
}
