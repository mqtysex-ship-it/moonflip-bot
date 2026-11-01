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
import { spinSlots, SLOT_SYMBOLS, secureRandomInt } from './rng.js';
import { getBalance, deductTokens, addTokens } from './economy.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Per-user lock so rapid clicks never overlap or get stuck
const activeSlotSpins = new Set();

// Track last spin timestamp per user for automatic rate-limit-free Turbo scaling
const lastUserSpinAt = new Map();

// Track recent slot spin outcomes for live casino history
const recentSpins = ['3.0x', '0.0x', '15.0x', '1.5x', '0.0x'];

function formatRecentSpins() {
  return recentSpins
    .slice(0, 5)
    .map((s) => {
      const v = parseFloat(s);
      if (v >= 10) return `👑\`${s}\``;
      if (v > 0) return `🟩\`${s}\``;
      return `⬛\`${s}\``;
    })
    .join(' • ');
}

function getRandomSymbol() {
  return SLOT_SYMBOLS[secureRandomInt(0, SLOT_SYMBOLS.length - 1)].symbol;
}

/**
 * Shows a Modal allowing the player to enter any custom wager amount for Slots.
 */
export async function showSlotsModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('slots_custom_modal')
    .setTitle('🎰 Las Vegas Slots — Custom Spin');

  const betInput = new TextInputBuilder()
    .setCustomId('slots_bet_input')
    .setLabel('Wager Amount (Tokens)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g. 100, 500, 2500')
    .setValue('250')
    .setMinLength(1)
    .setMaxLength(9)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(betInput));
  return interaction.showModal(modal);
}

/**
 * Renders a perfectly aligned 3-Drum Las Vegas Casino Slot Cabinet.
 */
function formatSlotCabinet(
  r1,
  r2,
  r3,
  reelBadges = ['  SPIN..  ', '  SPIN..  ', '  SPIN..  '],
  ledStatus = 'ALL 3 REELS WHIRRING AT FULL VELOCITY...',
  marqueeTitle = '★ VEGAS GRAND CASINO SLOTS ★'
) {
  const padCenter = (str, width) => {
    const clean = String(str);
    if (clean.length >= width) return clean.slice(0, width);
    const left = Math.floor((width - clean.length) / 2);
    const right = width - clean.length - left;
    return ' '.repeat(left) + clean + ' '.repeat(right);
  };

  return (
    `╔═══════════════╦═══════════════╦═══════════════╗\n` +
    `║${padCenter(marqueeTitle, 47)}║\n` +
    `╠═══════════════╦═══════════════╦═══════════════╣\n` +
    `║    REEL 01    ║    REEL 02    ║    REEL 03    ║\n` +
    `╠═══════════════╬═══════════════╬═══════════════╣\n` +
    `║     ┆ ${r1[0]} ┆    ║     ┆ ${r2[0]} ┆    ║     ┆ ${r3[0]} ┆    ║\n` +
    `║  ═══╪════╪═══ ╬ ═══╪════╪═══ ╬ ═══╪════╪═══  ║\n` +
    `║ ►►  │ ${r1[1]} │    ║     │ ${r2[1]} │    ║     │ ${r3[1]} │ ◄◄ ║\n` +
    `║  ═══╪════╪═══ ╬ ═══╪════╪═══ ╬ ═══╪════╪═══  ║\n` +
    `║     ┆ ${r1[2]} ┆    ║     ┆ ${r2[2]} ┆    ║     ┆ ${r3[2]} ┆    ║\n` +
    `╠═══════════════╬═══════════════╬═══════════════╣\n` +
    `║  [${reelBadges[0]}] ║  [${reelBadges[1]}] ║  [${reelBadges[2]}] ║\n` +
    `╠═══════════════╩═══════════════╩═══════════════╣\n` +
    `║${padCenter(ledStatus, 47)}║\n` +
    `╚═══════════════════════════════════════════════╝`
  );
}

export async function playSlots(interaction, betAmount = 100) {
  const userId = interaction.user.id;
  const cleanBet = Math.max(10, Math.floor(betAmount) || 100);

  if (activeSlotSpins.has(userId)) {
    if (interaction.isButton()) {
      return interaction.deferUpdate().catch(() => {});
    }
    return interaction
      .reply({
        content: '⏳ Your slot reels are already spinning!',
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => {});
  }

  const prevBalance = getBalance(userId);

  if (prevBalance < cleanBet) {
    const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this spin requires **\`${cleanBet.toLocaleString()} 🪙\`**.`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return interaction.reply({ content: msg, flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  activeSlotSpins.add(userId);

  try {
    // 1. Atomic upfront settlement (0ms in-memory)
    deductTokens(userId, cleanBet);

    const result = spinSlots();
    const [f1, f2, f3] = result.reels;
    const winAmount = result.multiplier > 0 ? Math.floor(cleanBet * result.multiplier) : 0;
    const profit = winAmount - cleanBet;

    if (winAmount > 0) {
      addTokens(userId, winAmount, true);
    }

    const newBalance = getBalance(userId);

    const r1_locked = [getRandomSymbol(), f1, getRandomSymbol()];
    const r2_locked = [getRandomSymbol(), f2, getRandomSymbol()];
    const r3_locked = [getRandomSymbol(), f3, getRandomSymbol()];

    const now = Date.now();
    const isRapidTurbo = now - (lastUserSpinAt.get(userId) || 0) < 3800;
    lastUserSpinAt.set(userId, now);

    const spinningRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('slots_spinning_btn')
        .setLabel('🎰 Reels Spinning...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // ========================================================================
    // FRAME 1 (0ms — Sent via interaction.update / reply -> 0 PATCH rate limit cost!)
    // ========================================================================
    const s1_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const s2_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const s3_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    const stage1Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎰  VEGAS GRAND SLOTS — REELS WHIRRING!')
      .setDescription(
        `🪙 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ${f1} ] ➔ [ ? ] ➔ [ ? ]\`\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(
          r1_locked,
          s2_a,
          s3_a,
          ['  LOCKED  ', '  TURBO!  ', '  TURBO!  '],
          '>> LEVER PULLED: REEL 01 LOCKED IN PLACE <<',
          '★ VEGAS GRAND CASINO SLOTS ★'
        )}\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Spinning drums • Locking payline...' });

    const isEphemeralCard =
      interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

    if (!interaction.deferred && !interaction.replied) {
      if (isEphemeralCard) {
        await interaction.update({
          embeds: [stage1Embed],
          components: [spinningRow],
          files: [],
          attachments: [],
        });
      } else {
        await interaction.reply({
          embeds: [stage1Embed],
          components: [spinningRow],
          flags: MessageFlags.Ephemeral,
        });
      }
    } else {
      await interaction
        .editReply({ embeds: [stage1Embed], components: [spinningRow], files: [], attachments: [] })
        .catch(() => {});
    }

    // ========================================================================
    // FRAME 2 (Optional Mid-Spin Suspense Frame when not in Rapid-Turbo mode)
    // ========================================================================
    const isSuspense = f1 === f2;
    if (!isRapidTurbo || isSuspense) {
      await sleep(310);
      const s3_d = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
      const stage2Embed = new EmbedBuilder()
        .setColor(isSuspense ? 0xf39c12 : 0x9b59b6)
        .setTitle(
          isSuspense
            ? '🚨  VEGAS GRAND SLOTS — JACKPOT SUSPENSE!'
            : '🔒  VEGAS GRAND SLOTS — REEL 02 LOCKED!'
        )
        .setDescription(
          `🪙 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ${f1} ] ➔ [ ${f2} ] ➔ [ ? ]\`\n` +
          `\`\`\`asciidoc\n` +
          `${formatSlotCabinet(
            r1_locked,
            r2_locked,
            s3_d,
            isSuspense
              ? [' ★ PAIR ★ ', ' ★ PAIR ★ ', '  SLOW..  ']
              : ['  LOCKED  ', '  LOCKED  ', '  SPIN..  '],
            isSuspense
              ? '!! 2X MATCH ON PAYLINE - JACKPOT DRAW !!'
              : '>> CLANK! REEL 02 LOCKED - FINAL REEL <<',
            isSuspense ? '★ HIGH-STAKES JACKPOT SUSPENSE ★' : '★ REEL 02 LOCKED — FINAL SPIN ★'
          )}\n` +
          `\`\`\``
        )
        .setFooter({ text: 'Stopping final reel...' });

      await interaction
        .editReply({ embeds: [stage2Embed], components: [spinningRow] })
        .catch(() => {});
      await sleep(isSuspense ? 380 : 300);
    } else {
      await sleep(290);
    }

    // ========================================================================
    // FINAL FRAME: Crystal-Clear Jackpot / Payout Reveal
    // ========================================================================
    let color = 0xe74c3c;
    let statusBanner = `❌ **NO PAYLINE MATCH — LOST -${cleanBet.toLocaleString()} 🪙!**`;
    let bannerHeader = '★ ROUND COMPLETE — NO MATCH ★';
    let ledStatus = 'NO PAYLINE COMBINATION — SPIN AGAIN!';
    let finalBadges = ['  LOCKED  ', '  LOCKED  ', '  LOCKED  '];

    if (result.multiplier > 0) {
      if (result.matches === 3) {
        color = 0xf1c40f;
        statusBanner =
          `👑✨ **MEGA JACKPOT! TRIPLE ${result.symbolName.toUpperCase()}S! YOU WON +${winAmount.toLocaleString()} 🪙!** *(Net: **+${profit.toLocaleString()} 🪙** @ **${result.multiplier}x**)*`;
        bannerHeader = `★ MEGA JACKPOT! ${result.multiplier}X PAYOUT ★`;
        ledStatus = `★ JACKPOT! WON +${winAmount.toLocaleString()} TOKENS (${result.multiplier}X) ★`;
        finalBadges = [' ★ JACK ★ ', ' ★ JACK ★ ', ' ★ POT! ★ '];
      } else {
        color = 0x2ecc71;
        statusBanner =
          `🎉 **WINNER! 2x ${result.symbolName.toUpperCase()}S MATCHED! YOU WON +${winAmount.toLocaleString()} 🪙!** *(Net: **+${profit.toLocaleString()} 🪙** @ **${result.multiplier}x**)*`;
        bannerHeader = `★ WINNING COMBINATION (${result.multiplier}X) ★`;
        ledStatus = `★ WINNER! WON +${winAmount.toLocaleString()} TOKENS (${result.multiplier}X) ★`;
        finalBadges = [
          f1 === f2 || f1 === f3 ? ' ★ WIN! ★ ' : '  LOCKED  ',
          f2 === f1 || f2 === f3 ? ' ★ WIN! ★ ' : '  LOCKED  ',
          f3 === f1 || f3 === f2 ? ' ★ WIN! ★ ' : '  LOCKED  ',
        ];
      }
    }

    recentSpins.unshift(`${result.multiplier.toFixed(1)}x`);
    if (recentSpins.length > 6) recentSpins.pop();

    const finalEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        result.matches === 3
          ? `👑  MEGA JACKPOT! YOU WON +${winAmount.toLocaleString()} 🪙 (${result.multiplier}x)!`
          : winAmount > 0
          ? `🎉  WINNER! YOU WON +${winAmount.toLocaleString()} 🪙 (${result.multiplier}x)!`
          : `🎰  SLOTS — NO MATCH (-${cleanBet.toLocaleString()} 🪙)`
      )
      .setDescription(
        `${statusBanner}\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(r1_locked, r2_locked, r3_locked, finalBadges, ledStatus, bannerHeader)}\n` +
        `\`\`\`\n` +
        `🎯 **Payline**: \`[ ${f1} ]  •  [ ${f2} ]  •  [ ${f3} ]\`  •  📈 **Multiplier**: \`${result.multiplier}x\`\n` +
        `💵 **Wager**: \`${cleanBet.toLocaleString()} 🪙\`  •  💰 **Payout**: \`${winAmount > 0 ? `+${winAmount.toLocaleString()} 🪙` : '0 🪙'}\`\n` +
        `💳 **Wallet Balance**: \`${prevBalance.toLocaleString()} 🪙\` ➔ **\`${newBalance.toLocaleString()} 🪙\`** *(${profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} 🪙)*\n` +
        `📜 **Recent Spins**: ${formatRecentSpins()}\n` +
        `💎\`30x\` • 7️⃣\`15x\` • 🔔\`10x\` • 🍇\`5x\` • 🍒\`3x\` • 🍋\`2x\` • *Pairs: \`1.1x–3.0x\`*`
      )
      .setFooter({
        text: `${interaction.user.username} • Instant Settlement • Provably Fair`,
        iconURL: interaction.user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const doubleBet = Math.min(50000, cleanBet * 2);

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`slots_spin_${cleanBet}`)
        .setLabel(`🎰 Spin (${cleanBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`slots_spin_${doubleBet}`)
        .setLabel(`⚡ 2x (${doubleBet.toLocaleString()} 🪙)`)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('slots_spin_500')
        .setLabel('🔥 High Roller (500 🪙)')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('slots_modal_btn')
        .setLabel('⚙️ Custom Bet')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_balance')
        .setLabel('💰 Balance')
        .setStyle(ButtonStyle.Secondary)
    );

    return await interaction
      .editReply({ embeds: [finalEmbed], components: [controlRow] })
      .catch(() => {});
  } catch (err) {
    if (err.code === 10062 || err.code === 40060) return;
    console.error('[Slots Execution Error]', err.message);
  } finally {
    activeSlotSpins.delete(userId);
  }
}
