import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { generateMinesBombs, calculateMinesMultiplier } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

export const activeMinesGames = new Map();

const TOTAL_TILES = 25; // 5x5 Grid
const DEFAULT_BOMBS = 3;

async function safeEditMessage(interaction, msg, data) {
  if (!msg) return;
  try {
    await msg.edit(data);
  } catch {
    try {
      if (interaction?.webhook) {
        await interaction.webhook.editMessage(msg.id, data);
      }
    } catch {}
  }
}

/**
 * Shows the Mines Setup Modal for custom bet & bomb count.
 */
export async function showMinesSetupModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('mines_custom_modal')
    .setTitle('💣 5x5 Mines — Setup Game');

  const betInput = new TextInputBuilder()
    .setCustomId('mines_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500')
    .setValue('100')
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const bombsInput = new TextInputBuilder()
    .setCustomId('mines_bombs_input')
    .setLabel('Bomb Count (1 to 24 Mines)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('3')
    .setValue('3')
    .setMinLength(1)
    .setMaxLength(2)
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(betInput);
  const row2 = new ActionRowBuilder().addComponents(bombsInput);
  modal.addComponents(row1, row2);

  return interaction.showModal(modal);
}

/**
 * Starts a 5x5 Mines game.
 */
export async function start5x5Mines(interaction, betAmount = 100, bombs = DEFAULT_BOMBS) {
  const userId = interaction.user.id;

  if (activeMinesGames.has(userId)) {
    const msg = '⚠️ You already have an active 5x5 Mines game in progress! Cash out or finish it first.';
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  const userBalance = getBalance(userId);
  if (userBalance < betAmount) {
    const msg = `❌ Insufficient balance! You have **${userBalance.toLocaleString()} 🪙**, but this game requires **${betAmount.toLocaleString()} 🪙**.`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  // Validate bombs
  bombs = Math.max(1, Math.min(24, Math.floor(bombs)));

  deductTokens(userId, betAmount);

  const bombIndices = generateMinesBombs(TOTAL_TILES, bombs);

  const gameState = {
    userId,
    betAmount,
    bombs,
    bombIndices,
    revealedIndices: new Set(),
    multiplier: 1.0,
    active: true,
    boardMessage: null,
    controlMessage: null,
    createdAt: Date.now(),
  };

  activeMinesGames.set(userId, gameState);

  const { embed, components } = render5x5Board(gameState, interaction.user);
  const controlRow = renderControlRow(gameState);

  // Send Board (Message 1)
  let boardReply;
  if (interaction.replied || interaction.deferred) {
    boardReply = await interaction.followUp({
      embeds: [embed],
      components,
      ephemeral: true,
      fetchReply: true,
    });
  } else {
    boardReply = await interaction.reply({
      embeds: [embed],
      components,
      ephemeral: true,
      fetchReply: true,
    });
  }

  // Send Control Message (Message 2)
  const ctrlReply = await interaction.followUp({
    content: `💼 **Mines Controls** | **Wager**: \`${betAmount.toLocaleString()} 🪙\` | **Bombs**: \`${bombs} / 25\``,
    components: [controlRow],
    ephemeral: true,
    fetchReply: true,
  });

  gameState.boardMessage = boardReply;
  gameState.controlMessage = ctrlReply;
}

export function render5x5Board(state, user, gameOver = false, won = false, cashedOut = false) {
  let color = 0x3498db; // Blue active
  if (gameOver) {
    color = won || cashedOut ? 0x2ecc71 : 0xe74c3c;
  }

  const currentWin = Math.floor(state.betAmount * state.multiplier);
  const safeGemsTotal = TOTAL_TILES - state.bombs;
  const safeGemsLeft = safeGemsTotal - state.revealedIndices.size;

  let statusText = `> Click any tile on the **5x5 grid (25 tiles)** to uncover safe gems. Avoid the **${state.bombs} hidden bombs**!`;
  if (cashedOut) {
    statusText = `🎉 **CASHED OUT!** You secured **+${currentWin.toLocaleString()} 🪙** at **${state.multiplier.toFixed(2)}x**!`;
  } else if (gameOver && !won) {
    statusText = `💥 **BOOM!** Stepped on a bomb! Lost your **${state.betAmount.toLocaleString()} 🪙** wager.`;
  } else if (won) {
    statusText = `👑 **PERFECT CLEAR!** All ${safeGemsTotal} safe gems uncovered! Payout: **+${currentWin.toLocaleString()} 🪙**!`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle('💣  5x5 MINES — HIGH-STAKES GRID')
    .setDescription(
      `${statusText}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🪙 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`   |   💣 **Bombs**: \`${state.bombs} / 25\`\n` +
      `💎 **Safe Gems Left**: \`${safeGemsLeft} / ${safeGemsTotal}\`   |   📈 **Multiplier**: \`${state.multiplier.toFixed(2)}x\`\n` +
      `💰 **Current Cashout**: \`${currentWin.toLocaleString()} 🪙\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: `${user.username} • 5x5 Grid (25 Tiles) • Provably Fair`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();

  // 5 Rows of 5 Buttons = 25 Buttons
  const rows = [];
  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 5; c++) {
      const idx = r * 5 + c;
      const btn = new ButtonBuilder().setCustomId(`m5_tile_${idx}`);

      if (state.revealedIndices.has(idx)) {
        btn.setEmoji('💎').setStyle(ButtonStyle.Success).setDisabled(true);
      } else if (gameOver) {
        if (state.bombIndices.has(idx)) {
          btn.setEmoji('💣').setStyle(ButtonStyle.Danger).setDisabled(true);
        } else {
          btn.setEmoji('💎').setStyle(ButtonStyle.Secondary).setDisabled(true);
        }
      } else {
        btn.setLabel('❓').setStyle(ButtonStyle.Secondary);
      }
      row.addComponents(btn);
    }
    rows.push(row);
  }

  return { embed, components: rows };
}

export function renderControlRow(state, gameOver = false) {
  const currentWin = Math.floor(state.betAmount * state.multiplier);
  const canCashout = state.revealedIndices.size > 0 && !gameOver;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('m5_cashout')
      .setLabel(
        canCashout
          ? `💰 CASH OUT (${state.multiplier.toFixed(2)}x • +${currentWin.toLocaleString()} 🪙)`
          : '💰 Cash Out (Uncover 1 Gem First)'
      )
      .setStyle(canCashout ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!canCashout),
    new ButtonBuilder()
      .setCustomId('mines_setup_modal')
      .setLabel('⚙️ New Game / Change Bet')
      .setStyle(ButtonStyle.Primary)
  );

  return row;
}

export async function handle5x5MinesInteraction(interaction) {
  const userId = interaction.user.id;
  const state = activeMinesGames.get(userId);

  // Modal Submit
  if (interaction.isModalSubmit() && interaction.customId === 'mines_custom_modal') {
    const betStr = interaction.fields.getTextInputValue('mines_bet_input');
    const bombsStr = interaction.fields.getTextInputValue('mines_bombs_input');

    const bet = parseInt(betStr.replace(/[^0-9]/g, ''), 10) || 100;
    const bombs = Math.min(24, Math.max(1, parseInt(bombsStr.replace(/[^0-9]/g, ''), 10) || 3));

    return start5x5Mines(interaction, bet, bombs);
  }

  if (!interaction.isButton()) return;
  const id = interaction.customId;

  // Open modal button
  if (id === 'mines_setup_modal') {
    return showMinesSetupModal(interaction);
  }

  // Preset quick play buttons
  if (id === 'start_m5_100_3') return start5x5Mines(interaction, 100, 3);
  if (id === 'start_m5_250_5') return start5x5Mines(interaction, 250, 5);
  if (id === 'start_m5_500_3') return start5x5Mines(interaction, 500, 3);
  if (id === 'start_m5_1000_5') return start5x5Mines(interaction, 1000, 5);

  if (!state) {
    return interaction.reply({
      content: '⚠️ No active 5x5 Mines game found. Start one using the buttons or modal!',
      ephemeral: true,
    });
  }

  // Handle Cashout
  if (id === 'm5_cashout') {
    if (state.revealedIndices.size === 0) {
      return interaction.reply({
        content: '⚠️ Uncover at least one safe gem before cashing out!',
        ephemeral: true,
      });
    }

    const winAmount = Math.floor(state.betAmount * state.multiplier);
    addTokens(userId, winAmount);
    activeMinesGames.delete(userId);

    const { embed, components } = render5x5Board(state, interaction.user, true, true, true);
    const ctrlRow = renderControlRow(state, true);

    await interaction.update({
      content: `🎉 **Successfully cashed out +${winAmount.toLocaleString()} 🪙!** Your balance is now: \`${getBalance(userId).toLocaleString()} 🪙\``,
      components: [ctrlRow],
    });

    if (state.boardMessage) {
      await safeEditMessage(interaction, state.boardMessage, { embeds: [embed], components });
    }
    return;
  }

  // Handle Tile Click
  if (id.startsWith('m5_tile_')) {
    const tileIdx = parseInt(id.replace('m5_tile_', ''), 10);

    if (state.revealedIndices.has(tileIdx)) {
      return interaction.deferUpdate();
    }

    // Hit a Bomb?
    if (state.bombIndices.has(tileIdx)) {
      activeMinesGames.delete(userId);
      const { embed, components } = render5x5Board(state, interaction.user, true, false, false);
      const ctrlRow = renderControlRow(state, true);

      await interaction.update({ embeds: [embed], components });

      if (state.controlMessage) {
        await safeEditMessage(interaction, state.controlMessage, {
          content: `💥 **BOOM! Stepped on a bomb on tile ${tileIdx + 1}! Lost ${state.betAmount.toLocaleString()} 🪙.**`,
          components: [ctrlRow],
        });
      }
      return;
    }

    // Safe Gem
    state.revealedIndices.add(tileIdx);
    state.multiplier = calculateMinesMultiplier(TOTAL_TILES, state.bombs, state.revealedIndices.size);

    const maxGems = TOTAL_TILES - state.bombs;
    if (state.revealedIndices.size === maxGems) {
      // Board Cleared
      const winAmount = Math.floor(state.betAmount * state.multiplier);
      addTokens(userId, winAmount);
      activeMinesGames.delete(userId);

      const { embed, components } = render5x5Board(state, interaction.user, true, true, false);
      const ctrlRow = renderControlRow(state, true);

      await interaction.update({ embeds: [embed], components });
      if (state.controlMessage) {
        await safeEditMessage(interaction, state.controlMessage, {
          content: `👑 **PERFECT CLEAR! All ${maxGems} gems uncovered! Won +${winAmount.toLocaleString()} 🪙!**`,
          components: [ctrlRow],
        });
      }
      return;
    }

    // Continue Safe Play
    const { embed, components } = render5x5Board(state, interaction.user, false, false, false);
    const ctrlRow = renderControlRow(state, false);

    await interaction.update({ embeds: [embed], components });
    if (state.controlMessage) {
      const curWin = Math.floor(state.betAmount * state.multiplier);
      await safeEditMessage(interaction, state.controlMessage, {
        content: `💼 **Active Multiplier**: \`${state.multiplier.toFixed(2)}x\` | **Cashout**: \`+${curWin.toLocaleString()} 🪙\``,
        components: [ctrlRow],
      });
    }
  }
}
