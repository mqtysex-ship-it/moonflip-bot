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
import { generateMinesBombs, calculateMinesMultiplier, secureRandomFloat, secureRandomInt } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

export const activeMinesGames = new Map();

// Per-user concurrency lock so rapid clicks never race or overlap
const processingMinesUsers = new Set();

// Remember last bet & bomb settings per user for 1-click replay
const userMinesPrefs = new Map();

const TOTAL_TILES = 25; // 5x5 Grid
const DEFAULT_BOMBS = 3;
const BOMB_CYCLE = [1, 3, 5, 10, 15];

/**
 * Shows the Mines Setup Modal for custom bet & bomb count.
 */
export async function showMinesSetupModal(interaction) {
  const prefs = userMinesPrefs.get(interaction.user.id) || { bet: 100, bombs: 3 };

  const modal = new ModalBuilder()
    .setCustomId('mines_custom_modal')
    .setTitle('💣 5x5 Mines — Setup Game');

  const betInput = new TextInputBuilder()
    .setCustomId('mines_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500, 2500')
    .setValue(String(prefs.bet || 100))
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const bombsInput = new TextInputBuilder()
    .setCustomId('mines_bombs_input')
    .setLabel('Bomb Count (1 to 24 Mines)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('3')
    .setValue(String(prefs.bombs || 3))
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(betInput),
    new ActionRowBuilder().addComponents(bombsInput)
  );

  return interaction.showModal(modal);
}

/**
 * Builds the 5x5 visual ASCII/Emoji board shown in the Embed when a round finishes
 * so the player sees every gem and bomb while having the Replay ActionRow below.
 * Calibrated to Discord's exact font metrics (5 emojis = 11.47 cols + 22 ASCII = 33.47 cols -> 33 '═' border).
 */
function buildRevealedGridAscii(state, explodedIdx = null) {
  let out = `╔═════════════════════════════════╗\n`;
  out += `║   5x5 MINES - REVEALED BOARD    ║\n`;
  out += `╠═════════════════════════════════╣\n`;

  for (let r = 0; r < 5; r++) {
    const cells = [];
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      if (idx === explodedIdx) {
        cells.push('[💥]');
      } else if (state.revealedIndices.has(idx)) {
        cells.push('[💎]');
      } else if (state.bombIndices.has(idx)) {
        cells.push('[💣]');
      } else {
        cells.push('[🔹]');
      }
    }
    out += `║  ${cells.join('  ')}  ║\n`;
  }

  out += `╚═════════════════════════════════╝`;
  return out;
}

/**
 * Renders the 5x5 Mines Embed and Components.
 * - During active play: returns 5 ActionRows × 5 Buttons (25 tiles).
 *   Uncovered gems turn into active Green [💎 1.29x] Cash Out buttons!
 * - On Game Over: displays the full 5x5 revealed board inside the Embed and returns
 *   1 ActionRow of instant Replay / 2x / Bomb Cycle / Custom buttons (100% single-message!).
 */
export function render5x5Board(
  state,
  user,
  gameOver = false,
  won = false,
  cashedOut = false,
  explodedIdx = null,
  autoNotice = null
) {
  let color = 0x3498db; // Blue active
  if (gameOver) {
    color = won || cashedOut ? 0x2ecc71 : 0xe74c3c;
  } else if (state.revealedIndices.size > 0) {
    color = 0x2ecc71; // Emerald active profit
  }

  const currentWin = Math.floor(state.betAmount * state.multiplier);
  const netProfit = currentWin - state.betAmount;
  const safeGemsTotal = TOTAL_TILES - state.bombs;
  const safeGemsLeft = safeGemsTotal - state.revealedIndices.size;
  const nextMult =
    safeGemsLeft > 0
      ? calculateMinesMultiplier(TOTAL_TILES, state.bombs, state.revealedIndices.size + 1)
      : state.multiplier;
  const balance = getBalance(user.id);

  const prefixNotice = autoNotice ? `> ${autoNotice}\n\n` : '';

  if (gameOver) {
    let statusText = '';
    if (cashedOut) {
      statusText = `🎉 **CASHED OUT!** You locked in **+${currentWin.toLocaleString()} 🪙** *(Net Profit: **+${netProfit.toLocaleString()} 🪙**)* at **${state.multiplier.toFixed(2)}x**!`;
    } else if (won) {
      statusText = `👑 **PERFECT CLEAR!** All **${safeGemsTotal}** safe gems uncovered! Payout: **+${currentWin.toLocaleString()} 🪙** *(Net: **+${netProfit.toLocaleString()} 🪙**)*!`;
    } else {
      statusText = `💥 **BOOM!** Stepped on a bomb on tile **#${(explodedIdx ?? 0) + 1}**! Lost **-${state.betAmount.toLocaleString()} 🪙**.`;
    }

    const revealedGrid = buildRevealedGridAscii(state, explodedIdx);
    const netDisplay =
      won || cashedOut
        ? `+${netProfit.toLocaleString()} 🪙`
        : `-${state.betAmount.toLocaleString()} 🪙`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        cashedOut
          ? `💰  MINES — CASHED OUT +${currentWin.toLocaleString()} 🪙 (${state.multiplier.toFixed(2)}x)!`
          : won
          ? `👑  MINES — PERFECT CLEAR +${currentWin.toLocaleString()} 🪙!`
          : `💥  MINES — DETONATED (-${state.betAmount.toLocaleString()} 🪙)`
      )
      .setDescription(
        `${prefixNotice}${statusText}\n` +
        `\`\`\`asciidoc\n${revealedGrid}\n\`\`\`\n` +
        `🏷️ **Legend**: \`[💎 Found Gem]\`  \`[💥 Triggered]\`  \`[💣 Bomb]\`  \`[🔹 Safe]\`\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🪙 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`   •   💣 **Bombs**: \`${state.bombs} / 25\`\n` +
        `💎 **Gems Found**: \`${state.revealedIndices.size} / ${safeGemsTotal}\`   •   📈 **Final Mult**: \`${(won || cashedOut ? state.multiplier : 0).toFixed(2)}x\`\n` +
        `💰 **Payout**: \`${(won || cashedOut ? currentWin : 0).toLocaleString()} 🪙\` (\`${netDisplay}\`)\n` +
        `💳 **Wallet Balance**: **\`${balance.toLocaleString()} 🪙\`**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({
        text: `${user.username} • Click Play Again below for instant board reset`,
        iconURL: user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const doubleBet = Math.min(50000, state.betAmount * 2);
    const curBombIdx = BOMB_CYCLE.indexOf(state.bombs);
    const nextBombs =
      curBombIdx !== -1 ? BOMB_CYCLE[(curBombIdx + 1) % BOMB_CYCLE.length] : 5;

    const replayButtons = [
      new ButtonBuilder()
        .setCustomId(`start_m5_${state.betAmount}_${state.bombs}`)
        .setLabel(`🔄 Play Again (${state.betAmount.toLocaleString()} 🪙 • ${state.bombs}💣)`)
        .setStyle(ButtonStyle.Success),
    ];

    if (doubleBet !== state.betAmount) {
      replayButtons.push(
        new ButtonBuilder()
          .setCustomId(`start_m5_${doubleBet}_${state.bombs}`)
          .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    if (nextBombs !== state.bombs) {
      replayButtons.push(
        new ButtonBuilder()
          .setCustomId(`start_m5_${state.betAmount}_${nextBombs}`)
          .setLabel(`💣 ${nextBombs} Bombs`)
          .setStyle(ButtonStyle.Danger)
      );
    }

    replayButtons.push(
      new ButtonBuilder()
        .setCustomId('mines_setup_modal')
        .setLabel('⚙️ Custom')
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

    const replayRow = new ActionRowBuilder().addComponents(safeButtons);

    return { embed, components: [replayRow] };
  }

  // Active Game Embed & 25-Button 5x5 Grid
  const canCashout = state.revealedIndices.size > 0;
  const instructionLine = canCashout
    ? `> 🟢 **CASH OUT READY**: Click **any green \`[💰 ${state.multiplier.toFixed(2)}x]\` tile** on the grid to Cash Out **+${currentWin.toLocaleString()} 🪙** *(+${netProfit.toLocaleString()} 🪙 profit)*, or click \`❓\` for **${nextMult.toFixed(2)}x**!`
    : `> Click any \`❓\` tile on the **5x5 grid (25 tiles)** to uncover a gem (**${nextMult.toFixed(2)}x**). Once uncovered, click any green gem tile anytime to **Cash Out**!`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      canCashout
        ? `💎  5x5 MINES — ${state.multiplier.toFixed(2)}x ACTIVE (+${currentWin.toLocaleString()} 🪙)`
        : '💣  5x5 MINES — HIGH-STAKES GRID'
    )
    .setDescription(
      `${prefixNotice}${instructionLine}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🪙 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`   •   💣 **Bombs**: \`${state.bombs} / 25\`\n` +
      `💎 **Safe Gems Left**: \`${safeGemsLeft} / ${safeGemsTotal}\`   •   ⏭️ **Next Tile**: \`${nextMult.toFixed(2)}x\`\n` +
      `📈 **Multiplier**: \`${state.multiplier.toFixed(2)}x\`   •   💰 **Cashout Value**: **\`${currentWin.toLocaleString()} 🪙\`**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: canCashout
        ? `${user.username} • Click any green [💰 ${state.multiplier.toFixed(2)}x] tile to Cash Out!`
        : `${user.username} • 5x5 Grid (25 Tiles) • Uncover 1 gem to unlock Cash Out`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();

  // 5 Rows of 5 Buttons = 25 Buttons (Single-Message Zero-Latency Grid)
  const rows = [];
  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const btn = new ButtonBuilder().setCustomId(`m5_tile_${idx}`);

      if (state.revealedIndices.has(idx)) {
        // Revealed gem becomes an active 1-click Cash Out button!
        btn
          .setLabel(`💰 ${state.multiplier.toFixed(2)}x`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(false);
      } else {
        btn.setLabel('❓').setStyle(ButtonStyle.Secondary);
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }

  return { embed, components: rows };
}

/**
 * Starts a 5x5 Mines game in a single ephemeral message (or updates in-place on replay).
 */
export async function start5x5Mines(interaction, betAmount = 100, bombs = DEFAULT_BOMBS) {
  const userId = interaction.user.id;

  if (processingMinesUsers.has(userId)) {
    return interaction.deferUpdate().catch(() => {});
  }
  processingMinesUsers.add(userId);

  try {
    let autoNotice = null;

    // Auto-recover if player had a previous unfinished Mines game (never let a player get stuck!)
    if (activeMinesGames.has(userId)) {
      const oldState = activeMinesGames.get(userId);
      activeMinesGames.delete(userId);

      if (oldState.revealedIndices && oldState.revealedIndices.size > 0) {
        const autoWin = Math.floor(oldState.betAmount * oldState.multiplier);
        addTokens(userId, autoWin, true);
        autoNotice = `✅ **Auto-Cashout**: Settled your previous active Mines board at **${oldState.multiplier.toFixed(2)}x** for **+${autoWin.toLocaleString()} 🪙**!`;
      } else {
        addTokens(userId, oldState.betAmount, false);
        autoNotice = `🔄 **Reset**: Refunded your untouched **${oldState.betAmount.toLocaleString()} 🪙** Mines board and started a fresh game.`;
      }
    }

    const cleanBet = Math.max(10, Math.floor(betAmount) || 100);
    const cleanBombs = Math.max(1, Math.min(24, Math.floor(bombs) || DEFAULT_BOMBS));

    const userBalance = getBalance(userId);
    if (userBalance < cleanBet) {
      const msg = `❌ **Insufficient balance!** You have **\`${userBalance.toLocaleString()} 🪙\`**, but this game requires **\`${cleanBet.toLocaleString()} 🪙\`**.\n> 💡 *Tip: Use \`/daily\` to claim 500 free tokens or click **⚙️ Custom Game** to bet smaller amounts (min 10 🪙).*`;
      if (interaction.replied || interaction.deferred) {
        return await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    deductTokens(userId, cleanBet);
    userMinesPrefs.set(userId, { bet: cleanBet, bombs: cleanBombs });

    const bombIndices = generateMinesBombs(TOTAL_TILES, cleanBombs);

    const gameState = {
      userId,
      betAmount: cleanBet,
      bombs: cleanBombs,
      bombIndices,
      revealedIndices: new Set(),
      multiplier: 1.0,
      active: true,
      lastRevealAt: 0,
      lastRevealedTile: -1,
      createdAt: Date.now(),
    };

    activeMinesGames.set(userId, gameState);

    const { embed, components } = render5x5Board(
      gameState,
      interaction.user,
      false,
      false,
      false,
      null,
      autoNotice
    );

    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    if (isEphemeralCard && !interaction.replied && !interaction.deferred) {
      return await interaction.update({ embeds: [embed], components, content: null });
    }
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply({ embeds: [embed], components, content: null });
    }
    return await interaction.reply({
      embeds: [embed],
      components,
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    processingMinesUsers.delete(userId);
  }
}

export async function handle5x5MinesInteraction(interaction) {
  const userId = interaction.user.id;

  // 1. Modal Submit
  if (interaction.isModalSubmit() && interaction.customId === 'mines_custom_modal') {
    const betStr = interaction.fields.getTextInputValue('mines_bet_input') || '100';
    const bombsStr = interaction.fields.getTextInputValue('mines_bombs_input') || '3';

    const bet = Math.max(10, parseInt(betStr.replace(/[^0-9]/g, ''), 10) || 100);
    const bombs = Math.min(24, Math.max(1, parseInt(bombsStr.replace(/[^0-9]/g, ''), 10) || 3));

    return start5x5Mines(interaction, bet, bombs);
  }

  if (!interaction.isButton()) return;
  const id = interaction.customId;

  // 2. Open Custom Setup Modal
  if (id === 'mines_setup_modal') {
    return showMinesSetupModal(interaction);
  }

  // 3. Dynamic Start / Replay Buttons: start_m5_<bet>_<bombs>
  if (id.startsWith('start_m5_')) {
    const parts = id.split('_');
    const bet = parseInt(parts[2], 10) || 100;
    const bombs = parseInt(parts[3], 10) || 3;
    return start5x5Mines(interaction, bet, bombs);
  }

  // 4. Active Board Interactions (Tile Click or Cash Out)
  if (processingMinesUsers.has(userId)) {
    return interaction.deferUpdate().catch(() => {});
  }

  const state = activeMinesGames.get(userId);
  if (!state) {
    // If user clicked a tile on an expired/finished board, start a fresh game with their last settings!
    const prefs = userMinesPrefs.get(userId) || { bet: 100, bombs: 3 };
    return start5x5Mines(interaction, prefs.bet, prefs.bombs);
  }

  processingMinesUsers.add(userId);

  try {
    // Helper to execute Cash Out cleanly in 1 single interaction.update()
    const executeCashout = async () => {
      if (state.revealedIndices.size === 0) {
        return interaction.deferUpdate().catch(() => {});
      }

      const winAmount = Math.floor(state.betAmount * state.multiplier);
      addTokens(userId, winAmount, true);
      activeMinesGames.delete(userId);

      const { embed, components } = render5x5Board(state, interaction.user, true, true, true);
      return interaction.update({ embeds: [embed], components, content: null });
    };

    // Legacy Cashout Button support
    if (id === 'm5_cashout') {
      return await executeCashout();
    }

    // Tile Click
    if (id.startsWith('m5_tile_')) {
      const tileIdx = parseInt(id.replace('m5_tile_', ''), 10);

      // If clicking an already-revealed green gem tile:
      if (state.revealedIndices.has(tileIdx)) {
        // Guard against accidental double-click within 450ms on the exact same tile just uncovered
        if (tileIdx === state.lastRevealedTile && Date.now() - state.lastRevealAt < 450) {
          return await interaction.deferUpdate().catch(() => {});
        }
        // Clicking any green [💰 X.XXx] tile cashes out immediately!
        return await executeCashout();
      }

      // Subtle Pro-House Board Gravity:
      // As the player chains consecutive gems or climbs to high multipliers, an unrevealed bomb
      // has a small chance to shift onto the clicked tile so deep runs & 1-click farming remain strongly pro-house,
      // while still showing the exact bomb count on the final revealed board.
      if (!state.bombIndices.has(tileIdx)) {
        const gemsFound = state.revealedIndices.size;
        const unrevealedLeft = TOTAL_TILES - gemsFound;
        const baseFairRisk = state.bombs / unrevealedLeft;

        // Subtle additive house hazard that scales gently with consecutive gems and wager size
        let houseHazard = 0;
        if (gemsFound === 0) {
          houseHazard = state.bombs <= 2 ? 0.055 : 0.04;
        } else if (gemsFound === 1) {
          houseHazard = 0.055;
        } else if (gemsFound === 2) {
          houseHazard = 0.075;
        } else {
          houseHazard = Math.min(0.22, 0.08 + (gemsFound - 2) * 0.03);
        }

        if (state.betAmount >= 1000) houseHazard += 0.025;
        else if (state.betAmount >= 500) houseHazard += 0.015;

        // Probability to shift an unrevealed bomb onto this safe tile to achieve the pro-house hazard rate
        const swapProb = houseHazard / Math.max(0.1, 1 - baseFairRisk);
        if (secureRandomFloat() < swapProb) {
          const bombArr = Array.from(state.bombIndices);
          const victimBomb = bombArr[secureRandomInt(0, bombArr.length - 1)];
          state.bombIndices.delete(victimBomb);
          state.bombIndices.add(tileIdx);
        }
      }

      // Hit a Bomb?
      if (state.bombIndices.has(tileIdx)) {
        activeMinesGames.delete(userId);
        const { embed, components } = render5x5Board(
          state,
          interaction.user,
          true,
          false,
          false,
          tileIdx
        );
        return await interaction.update({ embeds: [embed], components, content: null });
      }

      // Safe Gem Uncovered!
      state.revealedIndices.add(tileIdx);
      state.lastRevealedTile = tileIdx;
      state.lastRevealAt = Date.now();
      state.multiplier = calculateMinesMultiplier(
        TOTAL_TILES,
        state.bombs,
        state.revealedIndices.size
      );

      const maxGems = TOTAL_TILES - state.bombs;
      if (state.revealedIndices.size >= maxGems) {
        // Perfect Clear!
        const winAmount = Math.floor(state.betAmount * state.multiplier);
        addTokens(userId, winAmount, true);
        activeMinesGames.delete(userId);

        const { embed, components } = render5x5Board(state, interaction.user, true, true, false);
        return await interaction.update({ embeds: [embed], components, content: null });
      }

      // Continue Safe Play (1 single interaction.update!)
      const { embed, components } = render5x5Board(state, interaction.user, false, false, false);
      return await interaction.update({ embeds: [embed], components, content: null });
    }
  } finally {
    processingMinesUsers.delete(userId);
  }
}
