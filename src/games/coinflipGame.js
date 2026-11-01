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
import { flipCoin } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-user lock so rapid double-clicks never overlap or glitch the animation
const activeCoinflips = new Set();

// Track per-user win streaks and recent flip history
const userStreaks = new Map();
const recentFlips = ['heads', 'tails', 'heads', 'heads', 'tails'];

function formatFlipHistory() {
  return recentFlips
    .slice(0, 6)
    .map((f) => (f === 'heads' ? '🪙`H`' : '🦅`T`'))
    .join(' • ');
}

/**
 * Shows a Modal allowing the player to enter a custom wager and side (Heads/Tails).
 */
export async function showCoinflipModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('coinflip_custom_modal')
    .setTitle('🪙 Coinflip — Custom High-Stakes Toss');

  const sideInput = new TextInputBuilder()
    .setCustomId('coinflip_side_input')
    .setLabel('Your Call (heads or tails)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('heads or tails')
    .setValue('heads')
    .setMinLength(1)
    .setMaxLength(10)
    .setRequired(true);

  const betInput = new TextInputBuilder()
    .setCustomId('coinflip_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 500, 2500')
    .setValue('250')
    .setMinLength(1)
    .setMaxLength(9)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(sideInput),
    new ActionRowBuilder().addComponents(betInput)
  );

  return interaction.showModal(modal);
}

export async function playCoinflip(interaction, choice = 'heads', betAmount = 100) {
  const userId = interaction.user.id;

  if (activeCoinflips.has(userId)) {
    return interaction
      .reply({ content: '⏳ Your coin is already in the air! Wait a moment for it to land.', ephemeral: true })
      .catch(() => {});
  }

  const normalizedChoice = choice.toLowerCase().startsWith('t') ? 'tails' : 'heads';
  const prevBalance = getBalance(userId);

  if (prevBalance < betAmount) {
    const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this flip requires **\`${betAmount.toLocaleString()} 🪙\`**.`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }

  activeCoinflips.add(userId);

  try {
    // 1. Deduct bet & compute outcome + balance shift immediately so balance is 100% atomic
    deductTokens(userId, betAmount);

    const outcome = flipCoin(); // 'heads' or 'tails'
    const won = normalizedChoice === outcome;
    const winMultiplier = 1.92; // 4% house edge (96% RTP)
    const payout = won ? Math.floor(betAmount * winMultiplier) : 0;
    const profit = payout - betAmount;

    if (won) {
      addTokens(userId, payout);
      userStreaks.set(userId, (userStreaks.get(userId) || 0) + 1);
    } else {
      userStreaks.set(userId, 0);
    }

    const newBalance = getBalance(userId);
    const currentStreak = userStreaks.get(userId) || 0;
    recentFlips.unshift(outcome);
    if (recentFlips.length > 8) recentFlips.pop();

    // 2. If clicked from inside an ephemeral game card, update in-place; otherwise open ephemeral card
    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    if (!interaction.deferred && !interaction.replied) {
      if (isEphemeralCard) {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ ephemeral: true });
      }
    }

    const inFlightRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('coin_in_flight_btn')
        .setLabel('🪙 Coin Spinning in Mid-Air...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    const callBadge = normalizedChoice === 'heads' ? '🪙 HEADS' : '🦅 TAILS';

    // ========================================================================
    // STAGE 1 (0ms): Thumb Snap & Liftoff (Bottom of Arena -> Rising)
    // ========================================================================
    const stage1Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🪙  COINFLIP — THUMB SNAP & LIFTOFF!')
      .setDescription(
        `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`\n` +
        `\`\`\`asciidoc\n` +
        `╔══════════════ 🪙 COINFLIP ARENA ══════════════╗\n` +
        `║  AIR                                          ║\n` +
        `║  100% ┤                                       ║\n` +
        `║   70% ┤                   ▲                   ║\n` +
        `║   40% ┤                ╭─────╮                ║\n` +
        `║   15% ┤               (  🪙   )  ▲ LIFTOFF!   ║\n` +
        `║       ┤                ╰─────╯   │            ║\n` +
        `║  FELT ┼───────────────── ┆ ┆ ─────────────────║\n` +
        `║           🧤 [ SNAPPED OFF THE THUMB ]        ║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 1/4 • Launching into the air...' });

    await interaction
      .editReply({ embeds: [stage1Embed], components: [inFlightRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(450);

    // ========================================================================
    // STAGE 2 (450ms): Mid-Air Ascent & 3D Tilt Flip
    // ========================================================================
    const stage2Embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🌪️  COINFLIP — RISING & FLIPPING IN AIR!')
      .setDescription(
        `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`\n` +
        `\`\`\`asciidoc\n` +
        `╔══════════════ 🪙 COINFLIP ARENA ══════════════╗\n` +
        `║  AIR                     ▲ ▲                  ║\n` +
        `║  100% ┤               ╭═══════╮               ║\n` +
        `║   70% ┤            ⟳ 《  🪙 🦅  》 ⟲           ║\n` +
        `║   40% ┤               ╰═══════╯               ║\n` +
        `║   15% ┤                  ┆ ┆                  ║\n` +
        `║       ┤                  ┆ ┆                  ║\n` +
        `║  FELT ┼──────────────── (░░░) ────────────────║\n` +
        `║          🌪️ [ CLIMBING AT 1,200 RPM ]         ║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 2/4 • Flipping end-over-end in mid-air...' });

    await interaction
      .editReply({ embeds: [stage2Embed], components: [inFlightRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(450);

    // ========================================================================
    // STAGE 3 (900ms): Peak Apex Edge Glint
    // ========================================================================
    const stage3Embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('✨  COINFLIP — APEX EDGE GLINT!')
      .setDescription(
        `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`\n` +
        `\`\`\`asciidoc\n` +
        `╔══════════════ 🪙 COINFLIP ARENA ══════════════╗\n` +
        `║  AIR            ✦        ___        ✦         ║\n` +
        `║  100% ┤          ━━━◖ 🪙 ┃ 🦅 ◗━━━   APEX!    ║\n` +
        `║   70% ┤         ✧        ‾‾‾        ✧         ║\n` +
        `║   40% ┤                  ┆ ┆                  ║\n` +
        `║   15% ┤                  ▼ ▼                  ║\n` +
        `║       ┤                                       ║\n` +
        `║  FELT ┼──────────────── (░░░) ────────────────║\n` +
        `║         ✨ [ GOLDEN EDGE GLINT AT PEAK ]      ║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 3/4 • Dropping toward the casino felt...' });

    await interaction
      .editReply({ embeds: [stage3Embed], components: [inFlightRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(450);

    // ========================================================================
    // STAGE 4 (1350ms): Table Impact & Rim Wobble
    // ========================================================================
    const stage4Embed = new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle('⚡  COINFLIP — TABLE IMPACT & RIM WOBBLE!')
      .setDescription(
        `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`\n` +
        `\`\`\`asciidoc\n` +
        `╔══════════════ ⚡ COINFLIP ARENA ══════════════╗\n` +
        `║  AIR                                          ║\n` +
        `║  100% ┤                   ·                   ║\n` +
        `║   70% ┤                  ┆ ┆                  ║\n` +
        `║   40% ┤                  ▼ ▼                  ║\n` +
        `║   15% ┤           ⚡ *CLINK-CLATTER!* ⚡      ║\n` +
        `║       ┤               ─── ◖┃◗ ───             ║\n` +
        `║  FELT ┼─────────── (( ═════════ )) ───────────║\n` +
        `║           🔥 [ WOBBLING ON MILLED RIM ]       ║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 4/4 • Settling onto final face...' });

    await interaction
      .editReply({ embeds: [stage4Embed], components: [inFlightRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(500);

    // ========================================================================
    // STAGE 5 (1850ms): Final Settlement & Crystal-Clear Outcome
    // ========================================================================
    const coinEmoji = outcome === 'heads' ? '🪙' : '🦅';
    const emblemIcon = outcome === 'heads' ? '👑' : '🦅';
    const color = won ? 0x2ecc71 : 0xe74c3c;
    const streakBadge =
      currentStreak >= 2
        ? `🔥 ${currentStreak}x Win Streak!`
        : currentStreak === 1
        ? `✨ 1x Win`
        : `❄️ 0x`;

    const statusBanner = won
      ? `✅ **YOU WON +${payout.toLocaleString()} 🪙!** *(Net Profit: **+${profit.toLocaleString()} 🪙**)*`
      : `❌ **YOU LOST -${betAmount.toLocaleString()} 🪙!** *(Landed on **${outcome.toUpperCase()}**)*`;

    const boxStatusLine = won
      ? `★ VICTORY! +${payout.toLocaleString()} TOKENS CREDITED ★`
      : `✖ DEFEAT! LOST -${betAmount.toLocaleString()} TOKENS ✖`;

    const padCenter = (str, w) => {
      const len = str.length;
      if (len >= w) return str.slice(0, w);
      const l = Math.floor((w - len) / 2);
      return ' '.repeat(l) + str + ' '.repeat(w - len - l);
    };

    const finalEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        won
          ? `🎉  YOU WON +${payout.toLocaleString()} 🪙! — LANDED ${outcome.toUpperCase()} ${coinEmoji}`
          : `💀  YOU LOST -${betAmount.toLocaleString()} 🪙 — LANDED ${outcome.toUpperCase()} ${coinEmoji}`
      )
      .setDescription(
        `${statusBanner}\n` +
        `\`\`\`asciidoc\n` +
        `╔═══════════════════════════════════════════════╗\n` +
        `║${padCenter(`COIN LANDED ON: ${outcome.toUpperCase()}`, 47)}║\n` +
        `╠═══════════════════════════════════════════════╣\n` +
        `║                  ╭─────────╮                  ║\n` +
        `║               ✦ ╭┤  ${emblemIcon} ${coinEmoji}  ├╮ ✦               ║\n` +
        `║                 ╰┤  ${outcome.toUpperCase().padEnd(5, ' ')}  ├╯                 ║\n` +
        `║                  ╰─────────╯                  ║\n` +
        `╠═══════════════════════════════════════════════╣\n` +
        `║${padCenter(boxStatusLine, 47)}║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\`\n` +
        `🎯 **Your Call**: \`${normalizedChoice.toUpperCase()}\`  •  🪙 **Landed**: \`${outcome.toUpperCase()}\`  •  🔥 **Streak**: \`${streakBadge}\`\n` +
        `💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`  •  💰 **Payout**: \`${won ? `+${payout.toLocaleString()} 🪙 (1.92x)` : '0 🪙'}\`\n` +
        `💳 **Wallet Balance**: \`${prevBalance.toLocaleString()} 🪙\` ➔ **\`${newBalance.toLocaleString()} 🪙\`** *(${profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} 🪙)*\n` +
        `📜 **Recent Flips**: ${formatFlipHistory()}`
      )
      .setFooter({
        text: `${interaction.user.username} • Balance Updated Instantly • 1.92x Payout (4% House Edge)`,
        iconURL: interaction.user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const doubleBet = Math.min(50000, betAmount * 2);

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`flip_heads_${betAmount}`)
        .setLabel(`🪙 Heads (${betAmount.toLocaleString()} 🪙)`)
        .setStyle(normalizedChoice === 'heads' ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`flip_tails_${betAmount}`)
        .setLabel(`🦅 Tails (${betAmount.toLocaleString()} 🪙)`)
        .setStyle(normalizedChoice === 'tails' ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`flip_${normalizedChoice}_${doubleBet}`)
        .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('coinflip_modal_btn')
        .setLabel('⚙️ Custom Bet')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_balance')
        .setLabel('💰 Balance')
        .setStyle(ButtonStyle.Secondary)
    );

    return await interaction
      .editReply({ embeds: [finalEmbed], components: [controlRow], files: [], attachments: [] })
      .catch(() => {});
  } catch (err) {
    if (err.code === 10062) return; // Unknown interaction, expired safely
    console.error('[Coinflip Execution Error]', err.message);
  } finally {
    activeCoinflips.delete(userId);
  }
}
