import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { secureRandomInt } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

export const activeBJGames = new Map();

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = [
  { rank: '2', val: 2 },
  { rank: '3', val: 3 },
  { rank: '4', val: 4 },
  { rank: '5', val: 5 },
  { rank: '6', val: 6 },
  { rank: '7', val: 7 },
  { rank: '8', val: 8 },
  { rank: '9', val: 9 },
  { rank: '10', val: 10 },
  { rank: 'J', val: 10 },
  { rank: 'Q', val: 10 },
  { rank: 'K', val: 10 },
  { rank: 'A', val: 11 },
];

function drawCard() {
  const suit = SUITS[secureRandomInt(0, SUITS.length - 1)];
  const item = VALUES[secureRandomInt(0, VALUES.length - 1)];
  return { suit, rank: item.rank, val: item.val };
}

function calculateHand(hand) {
  let score = 0;
  let aces = 0;

  for (const card of hand) {
    score += card.val;
    if (card.rank === 'A') aces++;
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }

  return score;
}

function formatHand(hand, hideSecond = false) {
  if (hideSecond) {
    return `\`[ ${hand[0].suit} ${hand[0].rank} ]\` \`[ 🎴 ?? ]\``;
  }
  return hand.map((c) => `\`[ ${c.suit} ${c.rank} ]\``).join(' ');
}

export async function startBlackjack(interaction, betAmount = 100) {
  const userId = interaction.user.id;

  if (activeBJGames.has(userId)) {
    return interaction.reply({
      content: '⚠️ You already have an active Blackjack hand in progress!',
      ephemeral: true,
    });
  }

  const userBalance = getBalance(userId);
  if (userBalance < betAmount) {
    return interaction.reply({
      content: `❌ Insufficient balance! You have **${userBalance.toLocaleString()} 🪙**, but Blackjack requires **${betAmount.toLocaleString()} 🪙**.`,
      ephemeral: true,
    });
  }

  deductTokens(userId, betAmount);

  const playerHand = [drawCard(), drawCard()];
  const dealerHand = [drawCard(), drawCard()];

  const playerScore = calculateHand(playerHand);

  // Natural Blackjack check
  if (playerScore === 21) {
    const payout = Math.floor(betAmount * 2.5);
    addTokens(userId, payout);

    const embed = renderBJEmbed(playerHand, dealerHand, false, 'natural', betAmount, payout, interaction.user);
    return interaction.reply({ embeds: [embed], components: [], ephemeral: true });
  }

  const gameState = {
    userId,
    betAmount,
    playerHand,
    dealerHand,
    active: true,
  };

  activeBJGames.set(userId, gameState);

  const embed = renderBJEmbed(playerHand, dealerHand, true, 'playing', betAmount, 0, interaction.user);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_hit').setLabel('🃏 Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bj_stand').setLabel('✋ Stand').setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    ephemeral: true,
  });
}

function renderBJEmbed(playerHand, dealerHand, hideDealer, status, betAmount, payout, user) {
  const playerScore = calculateHand(playerHand);
  const dealerScore = hideDealer ? '??' : calculateHand(dealerHand);

  let color = 0x3498db; // Blue
  let title = '🃏  BLACKJACK — TABLE 21';
  let desc = '> Aim for 21 without busting. Beat the dealer!';

  if (status === 'natural') {
    color = 0xf1c40f; // Gold
    title = '👑  NATURAL BLACKJACK!';
    desc = `> **BLACKJACK (21)!** Immediate 3:2 payout of **+${payout.toLocaleString()} 🪙**!`;
  } else if (status === 'bust') {
    color = 0xe74c3c;
    title = '💥  BUSTED!';
    desc = `> You busted with **${playerScore}**! Lost **${betAmount.toLocaleString()} 🪙**.`;
  } else if (status === 'win') {
    color = 0x2ecc71;
    title = '🎉  YOU WIN!';
    desc = `> You beat the dealer! Won **+${payout.toLocaleString()} 🪙**!`;
  } else if (status === 'dealer_bust') {
    color = 0x2ecc71;
    title = '🎉  DEALER BUSTED!';
    desc = `> Dealer exceeded 21! Won **+${payout.toLocaleString()} 🪙**!`;
  } else if (status === 'push') {
    color = 0x95a5a6;
    title = '🤝  PUSH (TIE)';
    desc = `> Stand-off! Bet of **${betAmount.toLocaleString()} 🪙** returned.`;
  } else if (status === 'lose') {
    color = 0xe74c3c;
    title = '💀  DEALER WINS';
    desc = `> Dealer hand (**${dealerScore}**) beat your hand (**${playerScore}**).`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      `${desc}\n\n` +
      `🤵 **Dealer Hand** (Total: \`${dealerScore}\`)\n` +
      `> ${formatHand(dealerHand, hideDealer)}\n\n` +
      `👤 **Your Hand** (Total: \`${playerScore}\`)\n` +
      `> ${formatHand(playerHand, false)}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🪙 **Bet**: \`${betAmount.toLocaleString()} 🪙\`   |   💰 **Payout**: \`${payout.toLocaleString()} 🪙\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: `${user.username} • Provably Fair Blackjack`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();

  return embed;
}

export async function handleBlackjackButton(interaction) {
  const userId = interaction.user.id;
  const state = activeBJGames.get(userId);

  if (!state) {
    return interaction.reply({
      content: '⚠️ No active Blackjack hand found.',
      ephemeral: true,
    });
  }

  const customId = interaction.customId;

  // Hit
  if (customId === 'bj_hit') {
    state.playerHand.push(drawCard());
    const score = calculateHand(state.playerHand);

    if (score > 21) {
      // Player Busted
      activeBJGames.delete(userId);
      const embed = renderBJEmbed(state.playerHand, state.dealerHand, false, 'bust', state.betAmount, 0, interaction.user);
      return interaction.update({ embeds: [embed], components: [] });
    }

    if (score === 21) {
      // Auto stand on 21
      return resolveStand(interaction, state);
    }

    const embed = renderBJEmbed(state.playerHand, state.dealerHand, true, 'playing', state.betAmount, 0, interaction.user);
    return interaction.update({ embeds: [embed] });
  }

  // Stand
  if (customId === 'bj_stand') {
    return resolveStand(interaction, state);
  }
}

async function resolveStand(interaction, state) {
  const userId = state.userId;
  activeBJGames.delete(userId);

  // Dealer plays: hit on soft 17 or below 17
  while (calculateHand(state.dealerHand) < 17) {
    state.dealerHand.push(drawCard());
  }

  const playerScore = calculateHand(state.playerHand);
  const dealerScore = calculateHand(state.dealerHand);

  let status = 'lose';
  let payout = 0;

  if (dealerScore > 21) {
    status = 'dealer_bust';
    payout = state.betAmount * 2;
    addTokens(userId, payout);
  } else if (playerScore > dealerScore) {
    status = 'win';
    payout = state.betAmount * 2;
    addTokens(userId, payout);
  } else if (playerScore === dealerScore) {
    status = 'push';
    payout = state.betAmount;
    addTokens(userId, payout);
  } else {
    status = 'lose';
    payout = 0;
  }

  const embed = renderBJEmbed(state.playerHand, state.dealerHand, false, status, state.betAmount, payout, interaction.user);
  return interaction.update({ embeds: [embed], components: [] });
}
