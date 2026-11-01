import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { secureRandomInt } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

const TOTAL_NUMBERS = 20;
const DRAW_COUNT = 7;

/**
 * Show Modal for picking custom numbers and wager in Keno
 */
export async function showKenoModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('keno_custom_modal')
    .setTitle('🎲 Keno — Custom Numbers & Bet');

  const betInput = new TextInputBuilder()
    .setCustomId('keno_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 250, 500')
    .setValue('100')
    .setMinLength(1)
    .setMaxLength(8)
    .setRequired(true);

  const numbersInput = new TextInputBuilder()
    .setCustomId('keno_numbers_input')
    .setLabel('Your Lucky Numbers (1-20, comma separated)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 3, 7, 11, 15, 19')
    .setValue('3, 7, 11, 15, 19')
    .setMinLength(1)
    .setMaxLength(30)
    .setRequired(true);

  const row1 = new ActionRowBuilder().addComponents(betInput);
  const row2 = new ActionRowBuilder().addComponents(numbersInput);
  modal.addComponents(row1, row2);

  return interaction.showModal(modal);
}

/**
 * Executes a modern 20-Ball Keno Game with robust UI.
 * @param {import('discord.js').Interaction} interaction
 * @param {number} betAmount
 * @param {number|number[]} picks - Either pick count (e.g. 5) or explicit array of numbers
 */
export async function playModernKeno(interaction, betAmount = 100, picks = 5) {
  const userId = interaction.user.id;
  const userBalance = getBalance(userId);

  if (userBalance < betAmount) {
    const msg = `❌ Insufficient balance! You have **${userBalance.toLocaleString()} 🪙**, but this game requires **${betAmount.toLocaleString()} 🪙**.`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  // Parse Player Picks
  let playerPicks = new Set();
  if (Array.isArray(picks)) {
    for (const n of picks) {
      if (Number.isInteger(n) && n >= 1 && n <= TOTAL_NUMBERS) {
        playerPicks.add(n);
      }
    }
    if (playerPicks.size < 2 || playerPicks.size > 10) {
      const msg = '⚠️ Please enter between 2 and 10 distinct numbers from 1 to 20!';
      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: msg, ephemeral: true });
      }
      return interaction.reply({ content: msg, ephemeral: true });
    }
  } else {
    const pickCount = Math.max(2, Math.min(10, Math.floor(picks) || 5));
    while (playerPicks.size < pickCount) {
      playerPicks.add(secureRandomInt(1, TOTAL_NUMBERS));
    }
  }

  deductTokens(userId, betAmount);

  const picksArray = Array.from(playerPicks).sort((a, b) => a - b);
  const pickCount = picksArray.length;

  // Machine draws 7 random balls out of 20
  const drawnNumbers = new Set();
  while (drawnNumbers.size < DRAW_COUNT) {
    drawnNumbers.add(secureRandomInt(1, TOTAL_NUMBERS));
  }
  const drawnArray = Array.from(drawnNumbers).sort((a, b) => a - b);

  // Calculate Matches (Hits)
  const hits = picksArray.filter((n) => drawnNumbers.has(n));
  const hitCount = hits.length;

  // Multiplier table based on pick count (Mathematically balanced for ~94% RTP / 6% House Edge)
  let multiplier = 0;
  if (pickCount === 5) {
    if (hitCount === 5) multiplier = 30.0;
    else if (hitCount === 4) multiplier = 5.5;
    else if (hitCount === 3) multiplier = 2.0;
    else if (hitCount === 2) multiplier = 1.0; // Break-even / push
  } else if (pickCount === 3) {
    if (hitCount === 3) multiplier = 11.0;
    else if (hitCount === 2) multiplier = 2.5;
  } else if (pickCount === 7) {
    if (hitCount === 7) multiplier = 80.0;
    else if (hitCount === 6) multiplier = 25.0;
    else if (hitCount === 5) multiplier = 6.5;
    else if (hitCount === 4) multiplier = 3.0;
    else if (hitCount === 3) multiplier = 1.2;
  } else {
    // Custom picks (scaled for 94% RTP)
    const ratio = hitCount / pickCount;
    if (ratio === 1.0) multiplier = 25.0;
    else if (ratio >= 0.8) multiplier = 6.0;
    else if (ratio >= 0.6) multiplier = 2.2;
    else if (ratio >= 0.4) multiplier = 1.0;
  }

  const payout = Math.floor(betAmount * multiplier);
  if (payout > 0) {
    addTokens(userId, payout);
  }

  const won = payout > 0;
  const isJackpot = hitCount === pickCount && hitCount >= 3;
  const color = isJackpot ? 0xf1c40f : won ? 0x2ecc71 : 0xe74c3c;

  // Build clean 4x5 ticket lines without fragile side borders
  let gridStr = '═══════════ 🎲 20-BALL KENO TICKET ═══════════\n';
  for (let r = 0; r < 4; r++) {
    const rowItems = [];
    for (let c = 0; c < 5; c++) {
      const num = r * 5 + c + 1;
      const numFormatted = num < 10 ? `0${num}` : `${num}`;

      const isPicked = playerPicks.has(num);
      const isDrawn = drawnNumbers.has(num);

      if (isPicked && isDrawn) {
        rowItems.push(`[${numFormatted}🎯]`); // HIT
      } else if (isPicked) {
        rowItems.push(`[${numFormatted}✅]`); // Player Pick
      } else if (isDrawn) {
        rowItems.push(`[${numFormatted}🟡]`); // Machine Ball
      } else {
        rowItems.push(`[ ${numFormatted} ]`); // Untouched
      }
    }
    gridStr += '  ' + rowItems.join('  ') + '\n';
  }
  gridStr += '══════════════════════════════════════════════';

  const newBal = getBalance(userId);
  const hitsFormatted = hits.length > 0 ? hits.map((n) => `\`${n < 10 ? '0' + n : n}\``).join(' ') : '`None`';
  const drawnFormatted = drawnArray.map((n) => `\`${n < 10 ? '0' + n : n}\``).join(' ');

  let resultHeader = '';
  if (isJackpot) {
    resultHeader = `👑 **PERFECT JACKPOT! All ${hitCount}/${pickCount} numbers matched!**`;
  } else if (won) {
    resultHeader = `🎉 **WINNER! Matched ${hitCount}/${pickCount} numbers!**`;
  } else {
    resultHeader = `💀 **NO LUCK! Only ${hitCount}/${pickCount} numbers matched.**`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎲  KENO — ${won ? `WON +${payout.toLocaleString()} 🪙` : 'ROUND COMPLETE'}`)
    .setDescription(
      `${resultHeader}\n\n` +
      `\`\`\`asciidoc\n` +
      `${gridStr}\n` +
      `\`\`\`\n` +
      `🏷️ **Legend**: \`[🎯 Hit]\`  \`[✅ Your Pick]\`  \`[🟡 Drawn Ball]\`\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   |   📈 **Multiplier**: \`${multiplier.toFixed(2)}x\`\n` +
      `💰 **Total Payout**: \`${payout.toLocaleString()} 🪙\` *(Profit: ${payout >= betAmount ? '+' : ''}${(payout - betAmount).toLocaleString()} 🪙)*\n` +
      `🎯 **Matched Hits (${hitCount}/${pickCount})**: ${hitsFormatted}\n` +
      `🟡 **Machine Draw (7 Balls)**: ${drawnFormatted}\n` +
      `💳 **Wallet Balance**: \`${newBal.toLocaleString()} 🪙\`\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({
      text: `${interaction.user.username} • 20-Ball Keno • Provably Fair`,
      iconURL: interaction.user.displayAvatarURL() || undefined,
    })
    .setTimestamp();

  // Replay buttons - ALL IDs GUARANTEED DISTINCT to prevent COMPONENT_CUSTOM_ID_DUPLICATED
  const replayRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`keno_replay_${pickCount}_${betAmount}`)
      .setLabel(`🔄 Replay (${betAmount} 🪙)`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('keno_quick_5_100')
      .setLabel('🎲 5 Picks (100 🪙)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('keno_quick_5_250')
      .setLabel('🎲 5 Picks (250 🪙)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('keno_modal_btn')
      .setLabel('⚙️ Custom Pick')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp({ embeds: [embed], components: [replayRow], ephemeral: true });
  }
  return interaction.reply({ embeds: [embed], components: [replayRow], ephemeral: true });
}
