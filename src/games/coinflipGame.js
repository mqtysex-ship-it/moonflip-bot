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
import { buildCoinflipAttachment } from '../canvas/gameCardRenderer.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-user lock so rapid double-clicks never overlap
const activeCoinflips = new Set();

// Track last flip time per user for rate-limit-free Turbo scaling
const lastUserFlipAt = new Map();

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
  const cleanBet = Math.max(10, Math.floor(betAmount) || 100);

  if (activeCoinflips.has(userId)) {
    if (interaction.isButton()) {
      return interaction.deferUpdate().catch(() => {});
    }
    return interaction
      .reply({
        content: '⏳ Your coin is already in the air!',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  const normalizedChoice = choice.toLowerCase().startsWith('t') ? 'tails' : 'heads';
  const prevBalance = getBalance(userId);

  if (prevBalance < cleanBet) {
    const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this flip requires **\`${cleanBet.toLocaleString()} 🪙\`**.\n> 💡 *Tip: Use \`/daily\` to claim 500 free tokens or click **⚙️ Custom Flip** to bet smaller amounts (min 10 🪙).*`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  activeCoinflips.add(userId);

  try {
    // 1. Atomic upfront settlement (0ms in-memory)
    deductTokens(userId, cleanBet);

    const prevStreak = userStreaks.get(userId) || 0;
    const outcome = flipCoin(normalizedChoice, cleanBet, prevStreak); // 'heads' or 'tails'
    const won = normalizedChoice === outcome;
    const winMultiplier = 1.92; // 4% nominal edge + subtle air-flip gravity
    const payout = won ? Math.floor(cleanBet * winMultiplier) : 0;
    const profit = payout - cleanBet;

    if (won) {
      addTokens(userId, payout, true);
      userStreaks.set(userId, (userStreaks.get(userId) || 0) + 1);
    } else {
      userStreaks.set(userId, 0);
    }

    const newBalance = getBalance(userId);
    const currentStreak = userStreaks.get(userId) || 0;
    recentFlips.unshift(outcome);
    if (recentFlips.length > 8) recentFlips.pop();

    const now = Date.now();
    const isRapidTurbo = now - (lastUserFlipAt.get(userId) || 0) < 3800;
    lastUserFlipAt.set(userId, now);

    const inFlightRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('coin_in_flight_btn')
        .setLabel('🪙 Coin Spinning in Mid-Air...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    const callBadge = normalizedChoice === 'heads' ? '🪙 HEADS' : '🦅 TAILS';

    // ========================================================================
    // FRAME 1 (0ms — Sent via interaction.update / reply -> 0 PATCH rate limit cost!)
    // ========================================================================
    const stage1Embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🌪️  COINFLIP — FLIPPING IN MID-AIR!')
      .setDescription(
        `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`\n` +
        `\`\`\`asciidoc\n` +
        `╔═══════════════ COINFLIP ARENA ════════════════╗\n` +
        `║  AIR                     ^ ^                  ║\n` +
        `║  100% ┤               ╭═══════╮               ║\n` +
        `║   70% ┤             <<  COIN   >>             ║\n` +
        `║   40% ┤               ╰═══════╯               ║\n` +
        `║   15% ┤                  | |                  ║\n` +
        `║  FELT ┼──────────────── (░░░) ────────────────║\n` +
        `║           * [ CLIMBING AT 1,200 RPM ] *       ║\n` +
        `╚═══════════════════════════════════════════════╝\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Coin spinning end-over-end in mid-air...' });

    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    if (!interaction.deferred && !interaction.replied) {
      if (isEphemeralCard) {
        await interaction.update({
          embeds: [stage1Embed],
          components: [inFlightRow],
          files: [],
          attachments: [],
        });
      } else {
        await interaction.reply({
          embeds: [stage1Embed],
          components: [inFlightRow],
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      await interaction
        .editReply({ embeds: [stage1Embed], components: [inFlightRow], files: [], attachments: [] })
        .catch(() => {});
    }

    // ========================================================================
    // FRAME 2 (Mid-Air Apex & Rim Wobble when not in Rapid-Turbo mode)
    // ========================================================================
    if (!isRapidTurbo) {
      await sleep(300);
      const stage2Embed = new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle('⚡  COINFLIP — APEX GLINT & RIM WOBBLE!')
        .setDescription(
          `🎯 **Your Call**: \`${callBadge}\`   •   💵 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`\n` +
          `\`\`\`asciidoc\n` +
          `╔═══════════════ COINFLIP ARENA ════════════════╗\n` +
          `║  AIR            *        ___        *         ║\n` +
          `║  100% ┤          ───( HEAD|TAIL )───  APEX!   ║\n` +
          `║   40% ┤                  v v                  ║\n` +
          `║   15% ┤            * CLINK-CLATTER *          ║\n` +
          `║       ┤               ───(|)───               ║\n` +
          `║  FELT ┼─────────── (( ═════════ )) ───────────║\n` +
          `║           * [ WOBBLING ON MILLED RIM ] *      ║\n` +
          `╚═══════════════════════════════════════════════╝\n` +
          `\`\`\``
        )
        .setFooter({ text: 'Settling onto final face...' });

      await interaction
        .editReply({ embeds: [stage2Embed], components: [inFlightRow] })
        .catch(() => {});
      await sleep(300);
    } else {
      await sleep(280);
    }

    // ========================================================================
    // FINAL FRAME: Final Settlement & Crystal-Clear Outcome
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
      : `❌ **YOU LOST -${cleanBet.toLocaleString()} 🪙!** *(Landed on **${outcome.toUpperCase()}**)*`;

    const boxStatusLine = won
      ? `* VICTORY! +${payout.toLocaleString()} TOKENS CREDITED *`
      : `X DEFEAT! LOST -${cleanBet.toLocaleString()} TOKENS X`;

    const padCenter = (str, w) => {
      const clean = String(str)
        .replace(/[\u00A0\u202F]/g, ' ')
        .replace(/—/g, '-')
        .replace(/★/g, '*')
        .replace(/✖/g, 'X');
      const len = clean.length;
      if (len >= w) return clean.slice(0, w);
      const l = Math.floor((w - len) / 2);
      return ' '.repeat(l) + clean + ' '.repeat(w - len - l);
    };

    const faceLabel = outcome === 'heads' ? '  HEADS   ' : '  TAILS   ';

    const coinflipAttachment = buildCoinflipAttachment(normalizedChoice, outcome, won, cleanBet, payout);

    const finalEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        won
          ? `🎉  YOU WON +${payout.toLocaleString()} 🪙! — LANDED ${outcome.toUpperCase()} ${coinEmoji}`
          : `💀  YOU LOST -${cleanBet.toLocaleString()} 🪙 — LANDED ${outcome.toUpperCase()} ${coinEmoji}`
      )
      .setImage('attachment://coinflip_result.png')
      .setDescription(
        `${statusBanner}\n\n` +
        `🎯 **Your Call**: \`${normalizedChoice.toUpperCase()}\`  •  🪙 **Landed**: \`${outcome.toUpperCase()}\`  •  🔥 **Streak**: \`${streakBadge}\`\n` +
        `💵 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`  •  💰 **Payout**: \`${won ? `+${payout.toLocaleString()} 🪙 (1.92x)` : '0 🪙'}\`\n` +
        `💳 **Wallet Balance**: \`${prevBalance.toLocaleString()} 🪙\` ➔ **\`${newBalance.toLocaleString()} 🪙\`** *(${profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} 🪙)*\n` +
        `📜 **Recent Flips**: ${formatFlipHistory()}`
      )
      .setFooter({
        text: `${interaction.user.username} • Instant Settlement • Provably Fair`,
        iconURL: interaction.user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const doubleBet = Math.min(50000, cleanBet * 2);

    const controlButtons = [
      new ButtonBuilder()
        .setCustomId(`flip_heads_${cleanBet}`)
        .setLabel(`🪙 Heads (${cleanBet.toLocaleString()} 🪙)`)
        .setStyle(normalizedChoice === 'heads' ? ButtonStyle.Success : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`flip_tails_${cleanBet}`)
        .setLabel(`🦅 Tails (${cleanBet.toLocaleString()} 🪙)`)
        .setStyle(normalizedChoice === 'tails' ? ButtonStyle.Success : ButtonStyle.Primary),
    ];

    if (doubleBet !== cleanBet) {
      controlButtons.push(
        new ButtonBuilder()
          .setCustomId(`flip_${normalizedChoice}_${doubleBet}`)
          .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
          .setStyle(ButtonStyle.Danger)
      );
    }

    controlButtons.push(
      new ButtonBuilder()
        .setCustomId('coinflip_modal_btn')
        .setLabel('⚙️ Custom Bet')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_balance')
        .setLabel('💰 Balance')
        .setStyle(ButtonStyle.Secondary)
    );

    const seenIds = new Set();
    const safeButtons = controlButtons.filter((btn) => {
      const id = btn.data.custom_id;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    }).slice(0, 5);

    const controlRow = new ActionRowBuilder().addComponents(safeButtons);

    return await interaction
      .editReply({ embeds: [finalEmbed], components: [controlRow], files: [coinflipAttachment], attachments: [] })
      .catch(() => {});
  } catch (err) {
    if (err.code === 10062 || err.code === 40060) return;
    console.error('[Coinflip Execution Error]', err.message);
  } finally {
    activeCoinflips.delete(userId);
  }
}
