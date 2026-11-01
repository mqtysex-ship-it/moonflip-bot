import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { generateCrashMultiplier } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

export const activeCrashGames = new Map();

export async function startCrashGame(interaction, betAmount = 100) {
  const userId = interaction.user.id;

  if (activeCrashGames.has(userId)) {
    return interaction.reply({
      content: '⚠️ You already have an active Crash game running!',
      ephemeral: true,
    });
  }

  const userBalance = getBalance(userId);
  if (userBalance < betAmount) {
    return interaction.reply({
      content: `❌ Insufficient balance! You have **${userBalance.toLocaleString()} 🪙**, but this game requires **${betAmount.toLocaleString()} 🪙**.`,
      ephemeral: true,
    });
  }

  deductTokens(userId, betAmount);

  const crashPoint = generateCrashMultiplier();
  const gameState = {
    userId,
    betAmount,
    crashPoint,
    currentMultiplier: 1.0,
    cashedOut: false,
    crashed: false,
    intervalId: null,
  };

  activeCrashGames.set(userId, gameState);

  const embed = renderCrashEmbed(gameState, interaction.user);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('crash_cashout')
      .setLabel(`💰 Cash Out (1.00x • ${betAmount} 🪙)`)
      .setStyle(ButtonStyle.Success)
  );

  const response = await interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
    fetchReply: true,
  });

  // Simulated rocket flight loop
  let step = 0;
  const growthRate = 0.08;

  gameState.intervalId = setInterval(async () => {
    step++;
    const nextMult = Math.floor((1.0 + Math.pow(step * growthRate, 1.45)) * 100) / 100;

    // Check if crashed
    if (nextMult >= gameState.crashPoint) {
      clearInterval(gameState.intervalId);
      gameState.crashed = true;
      gameState.currentMultiplier = gameState.crashPoint;
      activeCrashGames.delete(userId);

      const crashEmbed = renderCrashEmbed(gameState, interaction.user, true);
      const disabledRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('crash_disabled')
          .setLabel(`💥 CRASHED @ ${gameState.crashPoint.toFixed(2)}x`)
          .setStyle(ButtonStyle.Danger)
          .setDisabled(true)
      );

      await response.edit({ embeds: [crashEmbed], components: [disabledRow] }).catch(() => {});
      return;
    }

    gameState.currentMultiplier = nextMult;
    const currentPayout = Math.floor(gameState.betAmount * gameState.currentMultiplier);

    const updatedEmbed = renderCrashEmbed(gameState, interaction.user);
    const updatedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('crash_cashout')
        .setLabel(`💰 Cash Out (${gameState.currentMultiplier.toFixed(2)}x • ${currentPayout} 🪙)`)
        .setStyle(ButtonStyle.Success)
    );

    await response.edit({ embeds: [updatedEmbed], components: [updatedRow] }).catch(() => {
      clearInterval(gameState.intervalId);
    });
  }, 1200);
}

function renderCrashEmbed(state, user, isFinal = false) {
  let color = 0x2ecc71; // Green
  let title = '🚀  CRASH — ROCKET ASCENT';
  let desc = `> **Rocket is ascending!** Click cash out before the crash.\n\n`;

  if (state.crashed) {
    color = 0xe74c3c; // Red
    title = '💥  CRASH — EXPLODED!';
    desc = `> The rocket crashed at **${state.crashPoint.toFixed(2)}x**! You lost your **${state.betAmount.toLocaleString()} 🪙** wager.\n\n`;
  } else if (state.cashedOut) {
    color = 0xf1c40f; // Gold
    title = '👑  CRASH — CASHED OUT!';
    const payout = Math.floor(state.betAmount * state.currentMultiplier);
    desc = `> Successfully cashed out at **${state.currentMultiplier.toFixed(2)}x**! You won **+${payout.toLocaleString()} 🪙**!\n\n`;
  }

  // Visual Ascii altitude meter
  const progressBlocks = Math.min(10, Math.floor(state.currentMultiplier * 2));
  const bar = '🟩'.repeat(progressBlocks) + '⬛'.repeat(10 - progressBlocks);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      `${desc}` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📈 **Multiplier**: \`${state.currentMultiplier.toFixed(2)}x\`\n` +
      `🪙 **Current Payout**: \`${Math.floor(state.betAmount * state.currentMultiplier).toLocaleString()} 🪙\`\n` +
      `📊 **Trajectory**: \`[${bar}]\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: `${user.username} • Provably Fair Crash Algorithm`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();

  return embed;
}

export async function handleCrashButton(interaction) {
  const userId = interaction.user.id;
  const state = activeCrashGames.get(userId);

  if (!state || state.crashed || state.cashedOut) {
    return interaction.reply({
      content: '⚠️ No active Crash game in progress.',
      ephemeral: true,
    });
  }

  if (interaction.customId === 'crash_cashout') {
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }
    state.cashedOut = true;
    activeCrashGames.delete(userId);

    const winAmount = Math.floor(state.betAmount * state.currentMultiplier);
    addTokens(userId, winAmount);

    const embed = renderCrashEmbed(state, interaction.user);
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('crash_cashed_btn')
        .setLabel(`✅ Cashed Out: ${state.currentMultiplier.toFixed(2)}x (+${winAmount} 🪙)`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );

    return interaction.update({ embeds: [embed], components: [disabledRow] });
  }
}
