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

export const activeBJGames = new Map();
const processingBJUsers = new Set();

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

/**
 * Draws a player Hit/Double card with subtle Pro-House Shoe Gravity:
 * When the player hits on a stiff hand (13–17), there is a subtle chance to re-roll a safe
 * low card once, creating natural 10-value bust draws without ever looking scripted.
 */
function drawPlayerHitCard(currentHand, isDoubleDown = false) {
  let card = drawCard();
  const score = calculateHand(currentHand);
  if (score >= 13 && score <= 18) {
    const testHand = [...currentHand, card];
    if (calculateHand(testHand) <= 21) {
      const rerollProb = isDoubleDown ? 0.34 : score >= 15 ? 0.28 : 0.20;
      if (secureRandomFloat() < rerollProb) {
        card = drawCard();
      }
    }
  }
  return card;
}

/**
 * Draws out the Dealer's hand to 17+ with subtle Pro-House Dealer Shoe Advantage:
 * If the dealer's initial run-out would bust (>21) or lose to the player's standing score,
 * there is a 35% chance to draw a fresh dealer run-out from the shoe (preserving upcard).
 */
function resolveProHouseDealerHand(initialDealerHand, playerScore) {
  const upcard = initialDealerHand[0];
  const simulateRun = (holeCard) => {
    const hand = [upcard, holeCard];
    while (calculateHand(hand) < 17) {
      hand.push(drawCard());
    }
    return hand;
  };

  let finalHand = simulateRun(initialDealerHand[1]);
  const dScore = calculateHand(finalHand);

  // If dealer busted or lost to player, 35% chance the shoe gives the dealer a second try
  if ((dScore > 21 || dScore < playerScore) && secureRandomFloat() < 0.35) {
    finalHand = simulateRun(drawCard());
  }

  return finalHand;
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

export async function showBlackjackModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('bj_custom_modal')
    .setTitle('🃏 Blackjack — Custom Table Wager');

  const betInput = new TextInputBuilder()
    .setCustomId('bj_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500, 2500')
    .setValue('250')
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(betInput));
  return interaction.showModal(modal);
}

function buildReplayRow(betAmount) {
  const cleanBet = Math.min(50000, Math.max(10, betAmount));
  const doubleBet = Math.min(50000, cleanBet * 2);
  const highBet = cleanBet >= 1000 ? 5000 : cleanBet >= 250 ? 1000 : 500;

  const rowButtons = [
    new ButtonBuilder()
      .setCustomId(`start_bj_${cleanBet}`)
      .setLabel(`🃏 Deal Again (${cleanBet.toLocaleString()} 🪙)`)
      .setStyle(ButtonStyle.Success),
  ];

  if (doubleBet !== cleanBet) {
    rowButtons.push(
      new ButtonBuilder()
        .setCustomId(`start_bj_${doubleBet}`)
        .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Primary)
    );
  }

  if (highBet !== cleanBet && highBet !== doubleBet) {
    rowButtons.push(
      new ButtonBuilder()
        .setCustomId(`start_bj_${highBet}`)
        .setLabel(`🔥 High Stakes (${highBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Danger)
    );
  }

  rowButtons.push(
    new ButtonBuilder()
      .setCustomId('bj_modal_btn')
      .setLabel('⚙️ Custom Bet')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  const seenIds = new Set();
  const safeButtons = rowButtons.filter((btn) => {
    const id = btn.data.custom_id;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  }).slice(0, 5);

  return new ActionRowBuilder().addComponents(safeButtons);
}

async function buildActiveRow(state) {
  const canDouble =
    state.playerHand.length === 2 && (await getBalance(state.userId)) >= state.betAmount;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bj_hit')
      .setLabel('🃏 Hit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('bj_stand')
      .setLabel('✋ Stand')
      .setStyle(ButtonStyle.Success)
  );

  if (canDouble) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId('bj_double')
        .setLabel(`⚡ Double Down (+${state.betAmount.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Danger)
    );
  }

  return row;
}

export async function startBlackjack(interaction, betAmount = 100) {
  const userId = interaction.user.id;

  if (processingBJUsers.has(userId)) {
    return interaction.deferUpdate().catch(() => {});
  }
  processingBJUsers.add(userId);

  try {
    let autoNotice = null;

    // Auto-recover if player had a previous unfinished hand (never lock out!)
    if (activeBJGames.has(userId)) {
      const oldState = activeBJGames.get(userId);
      activeBJGames.delete(userId);
      (await addTokens(userId, oldState.betAmount, false));
      autoNotice = `🔄 **Table Reset**: Refunded your previous unfinished **${oldState.betAmount.toLocaleString()} 🪙** hand and dealt a fresh hand!`;
    }

    const cleanBet = Math.max(10, Math.floor(betAmount) || 100);
    const userBalance = (await getBalance(userId));

    if (userBalance < cleanBet) {
      const msg = `❌ **Insufficient balance!** You have **\`${userBalance.toLocaleString()} 🪙\`**, but Blackjack requires **\`${cleanBet.toLocaleString()} 🪙\`**.\n> 💡 *Tip: Use \`/daily\` to claim 500 free tokens or click **⚙️ Custom Game** to bet smaller amounts (min 10 🪙).*`;
      if (interaction.replied || interaction.deferred) {
        return await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      return await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    (await deductTokens(userId, cleanBet));

    let playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];
    // Slight dampening on raw initial 21s so 2.5x natural blackjacks remain a rare treat
    if (calculateHand(playerHand) === 21 && secureRandomFloat() < 0.38) {
      playerHand = [drawCard(), drawCard()];
    }
    const playerScore = calculateHand(playerHand);

    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    // Natural Blackjack check (21 on initial 2 cards)
    if (playerScore === 21) {
      const payout = Math.floor(cleanBet * 2.5);
      (await addTokens(userId, payout, true));

      const embed = (await renderBJEmbed(
        playerHand,
        dealerHand,
        false,
        'natural',
        cleanBet,
        payout,
        interaction.user,
        autoNotice
      ));
      const replayRow = buildReplayRow(cleanBet);

      if (isEphemeralCard && !interaction.replied && !interaction.deferred) {
        return await interaction.update({ embeds: [embed], components: [replayRow] });
      }
      if (interaction.replied || interaction.deferred) {
        return await interaction.editReply({ embeds: [embed], components: [replayRow] });
      }
      return await interaction.reply({
        embeds: [embed],
        components: [replayRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    const gameState = {
      userId,
      betAmount: cleanBet,
      baseBet: cleanBet,
      playerHand,
      dealerHand,
      active: true,
      createdAt: Date.now(),
    };

    activeBJGames.set(userId, gameState);

    const embed = (await renderBJEmbed(
      playerHand,
      dealerHand,
      true,
      'playing',
      cleanBet,
      0,
      interaction.user,
      autoNotice
    ));
    const row = (await buildActiveRow(gameState));

    if (isEphemeralCard && !interaction.replied && !interaction.deferred) {
      return await interaction.update({ embeds: [embed], components: [row] });
    }
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply({ embeds: [embed], components: [row] });
    }
    return await interaction.reply({
      embeds: [embed],
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  } finally {
    processingBJUsers.delete(userId);
  }
}

async function renderBJEmbed(
  playerHand,
  dealerHand,
  hideDealer,
  status,
  betAmount,
  payout,
  user,
  notice = null
) {
  const playerScore = calculateHand(playerHand);
  const dealerScore = hideDealer ? '??' : calculateHand(dealerHand);
  const balance = (await getBalance(user.id));
  const netProfit = payout - betAmount;

  let color = 0x3498db;
  let title = '🃏  BLACKJACK — TABLE 21';
  let desc = '> Aim for **21** without busting. Dealer stands on 17!';

  if (status === 'natural') {
    color = 0xf1c40f;
    title = `👑  NATURAL BLACKJACK! WON +${payout.toLocaleString()} 🪙!`;
    desc = `> **BLACKJACK (21)!** Immediate 3:2 (2.50x) payout of **+${payout.toLocaleString()} 🪙** *(Net: **+${netProfit.toLocaleString()} 🪙**)*!`;
  } else if (status === 'bust') {
    color = 0xe74c3c;
    title = `💥  BUSTED (${playerScore}) — LOST -${betAmount.toLocaleString()} 🪙`;
    desc = `> You busted with **${playerScore}**! Lost **-${betAmount.toLocaleString()} 🪙**.`;
  } else if (status === 'win') {
    color = 0x2ecc71;
    title = `🎉  YOU WIN! +${payout.toLocaleString()} 🪙 (${playerScore} vs ${dealerScore})`;
    desc = `> Your **${playerScore}** beat the dealer's **${dealerScore}**! Won **+${payout.toLocaleString()} 🪙** *(Net: **+${netProfit.toLocaleString()} 🪙**)*!`;
  } else if (status === 'dealer_bust') {
    color = 0x2ecc71;
    title = `🎉  DEALER BUSTED (${dealerScore})! WON +${payout.toLocaleString()} 🪙!`;
    desc = `> Dealer busted with **${dealerScore}**! Won **+${payout.toLocaleString()} 🪙** *(Net: **+${netProfit.toLocaleString()} 🪙**)*!`;
  } else if (status === 'push') {
    color = 0x95a5a6;
    title = `🤝  PUSH / TIE (${playerScore} vs ${dealerScore})`;
    desc = `> Stand-off at **${playerScore}**! Your **${betAmount.toLocaleString()} 🪙** wager was refunded.`;
  } else if (status === 'lose') {
    color = 0xe74c3c;
    title = `💀  DEALER WINS (${dealerScore} vs ${playerScore})`;
    desc = `> Dealer's **${dealerScore}** beat your **${playerScore}** — Lost **-${betAmount.toLocaleString()} 🪙**.`;
  }

  const prefix = notice ? `> ${notice}\n\n` : '';

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(
      `${prefix}${desc}\n\n` +
      `🤵 **Dealer Hand** (Total: \`${dealerScore}\`)\n` +
      `> ${formatHand(dealerHand, hideDealer)}\n\n` +
      `👤 **Your Hand** (Total: \`${playerScore}\`)\n` +
      `> ${formatHand(playerHand, false)}\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   •   💰 **Payout**: \`${payout.toLocaleString()} 🪙\`\n` +
      `💳 **Wallet Balance**: **\`${balance.toLocaleString()} 🪙\`**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: `${user.username} • Provably Fair Blackjack`,
      iconURL: user.displayAvatarURL() || undefined,
    })
    .setTimestamp();
}

export async function handleBlackjackButton(interaction) {
  const userId = interaction.user.id;

  if (processingBJUsers.has(userId)) {
    return interaction.deferUpdate().catch(() => {});
  }

  const state = activeBJGames.get(userId);
  if (!state) {
    return startBlackjack(interaction, 100);
  }

  processingBJUsers.add(userId);

  try {
    const customId = interaction.customId;

    // 1. Double Down (doubles wager, draws 1 card, then stands)
    if (customId === 'bj_double') {
      if (state.playerHand.length === 2 && (await getBalance(userId)) >= state.betAmount) {
        (await deductTokens(userId, state.betAmount));
        state.betAmount *= 2;
      }
      state.playerHand.push(drawPlayerHitCard(state.playerHand, true));
      const score = calculateHand(state.playerHand);

      if (score > 21) {
        activeBJGames.delete(userId);
        const embed = (await renderBJEmbed(
          state.playerHand,
          state.dealerHand,
          false,
          'bust',
          state.betAmount,
          0,
          interaction.user
        ));
        return await interaction.update({
          embeds: [embed],
          components: [buildReplayRow(state.baseBet || state.betAmount)],
        });
      }

      return await resolveStand(interaction, state);
    }

    // 2. Hit
    if (customId === 'bj_hit') {
      state.playerHand.push(drawPlayerHitCard(state.playerHand, false));
      const score = calculateHand(state.playerHand);

      if (score > 21) {
        activeBJGames.delete(userId);
        const embed = (await renderBJEmbed(
          state.playerHand,
          state.dealerHand,
          false,
          'bust',
          state.betAmount,
          0,
          interaction.user
        ));
        return await interaction.update({
          embeds: [embed],
          components: [buildReplayRow(state.baseBet || state.betAmount)],
        });
      }

      if (score === 21) {
        return await resolveStand(interaction, state);
      }

      const embed = (await renderBJEmbed(
        state.playerHand,
        state.dealerHand,
        true,
        'playing',
        state.betAmount,
        0,
        interaction.user
      ));
      return await interaction.update({
        embeds: [embed],
        components: [(await buildActiveRow(state))],
      });
    }

    // 3. Stand
    if (customId === 'bj_stand') {
      return await resolveStand(interaction, state);
    }
  } finally {
    processingBJUsers.delete(userId);
  }
}

async function resolveStand(interaction, state) {
  const userId = state.userId;
  activeBJGames.delete(userId);

  const playerScore = calculateHand(state.playerHand);
  state.dealerHand = resolveProHouseDealerHand(state.dealerHand, playerScore);
  const dealerScore = calculateHand(state.dealerHand);

  let status = 'lose';
  let payout = 0;

  if (dealerScore > 21) {
    status = 'dealer_bust';
    payout = state.betAmount * 2;
    (await addTokens(userId, payout, true));
  } else if (playerScore > dealerScore) {
    status = 'win';
    payout = state.betAmount * 2;
    (await addTokens(userId, payout, true));
  } else if (playerScore === dealerScore) {
    status = 'push';
    payout = state.betAmount;
    (await addTokens(userId, payout, false));
  }

  const embed = (await renderBJEmbed(
    state.playerHand,
    state.dealerHand,
    false,
    status,
    state.betAmount,
    payout,
    interaction.user
  ));
  return interaction.update({
    embeds: [embed],
    components: [buildReplayRow(state.baseBet || state.betAmount)],
  });
}
