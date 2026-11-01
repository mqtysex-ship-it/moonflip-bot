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
 * Uses fixed-width ASCII/box characters for borders & badges so columns never misalign.
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

  if (activeSlotSpins.has(userId)) {
    return interaction
      .reply({ content: '⏳ Your slot reels are already spinning! Wait a moment for them to stop.', ephemeral: true })
      .catch(() => {});
  }

  const prevBalance = getBalance(userId);

  if (prevBalance < betAmount) {
    const msg = `❌ **Insufficient balance!** You have **\`${prevBalance.toLocaleString()} 🪙\`**, but this spin requires **\`${betAmount.toLocaleString()} 🪙\`**.`;
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    }
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }

  activeSlotSpins.add(userId);

  try {
    // 1. Deduct bet & compute final RNG outcome + credit winnings immediately (atomic balance!)
    deductTokens(userId, betAmount);

    const result = spinSlots();
    const [f1, f2, f3] = result.reels;
    const winAmount = result.multiplier > 0 ? Math.floor(betAmount * result.multiplier) : 0;
    const profit = winAmount - betAmount;

    if (winAmount > 0) {
      addTokens(userId, winAmount);
    }

    const newBalance = getBalance(userId);

    // Context symbols above and below the center payline
    const r1_locked = [getRandomSymbol(), f1, getRandomSymbol()];
    const r2_locked = [getRandomSymbol(), f2, getRandomSymbol()];
    const r3_locked = [getRandomSymbol(), f3, getRandomSymbol()];

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

    const spinningRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('slots_spinning_btn')
        .setLabel('🎰 Reels Spinning...')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    // ========================================================================
    // STAGE 1 (0ms): Lever Pulled & Turbo Spin Frame A
    // ========================================================================
    const s1_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const s2_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const s3_a = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    const stage1Embed = new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('🎰  VEGAS GRAND SLOTS — LEVER PULLED!')
      .setDescription(
        `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ? ] ➔ [ ? ] ➔ [ ? ]\`\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(
          s1_a,
          s2_a,
          s3_a,
          ['  SPIN..  ', '  SPIN..  ', '  SPIN..  '],
          '>> LEVER PULLED: ALL 3 DRUMS WHIRRING <<',
          '★ VEGAS GRAND CASINO SLOTS ★'
        )}\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 1/4 • All 3 reels accelerating...' });

    await interaction
      .editReply({ embeds: [stage1Embed], components: [spinningRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(420);

    // ========================================================================
    // STAGE 2 (420ms): High-Speed Vertical Reel Blur Frame B
    // ========================================================================
    const s1_b = [s1_a[2], s1_a[0], getRandomSymbol()];
    const s2_b = [s2_a[2], s2_a[0], getRandomSymbol()];
    const s3_b = [s3_a[2], s3_a[0], getRandomSymbol()];

    const stage2Embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('⚡  VEGAS GRAND SLOTS — MAXIMUM VELOCITY!')
      .setDescription(
        `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ? ] ➔ [ ? ] ➔ [ ? ]\`\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(
          s1_b,
          s2_b,
          s3_b,
          ['  TURBO!  ', '  TURBO!  ', '  TURBO!  '],
          '>> REELS SCROLLING AT MAXIMUM RPM <<',
          '★ VEGAS GRAND CASINO SLOTS ★'
        )}\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 2/4 • Locking Reel 01...' });

    await interaction
      .editReply({ embeds: [stage2Embed], components: [spinningRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(450);

    // ========================================================================
    // STAGE 3 (870ms): Reel 01 Clanks & Locks
    // ========================================================================
    const s2_c = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const s3_c = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];

    const stage3Embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔒  VEGAS GRAND SLOTS — REEL 01 LOCKED!')
      .setDescription(
        `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ${f1} ] ➔ [ ? ] ➔ [ ? ]\`\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(
          r1_locked,
          s2_c,
          s3_c,
          ['  LOCKED  ', '  SPIN..  ', '  SPIN..  '],
          '>> CLANK! REEL 01 LOCKED IN PLACE <<',
          '★ REEL 01 LOCKED — 2 REELS SPINNING ★'
        )}\n` +
        `\`\`\``
      )
      .setFooter({ text: 'Phase 3/4 • Locking Reel 02...' });

    await interaction
      .editReply({ embeds: [stage3Embed], components: [spinningRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(450);

    // ========================================================================
    // STAGE 4 (1320ms): Reel 02 Locks (with Suspense Detection!)
    // ========================================================================
    const s3_d = [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()];
    const isSuspense = f1 === f2;

    const stage4Embed = new EmbedBuilder()
      .setColor(isSuspense ? 0xf39c12 : 0xe67e22)
      .setTitle(
        isSuspense
          ? '🚨  VEGAS GRAND SLOTS — JACKPOT SUSPENSE!'
          : '🔒  VEGAS GRAND SLOTS — REEL 02 LOCKED!'
      )
      .setDescription(
        `🪙 **Wager**: \`${betAmount.toLocaleString()} 🪙\`   •   🎯 **Payline**: \`[ ${f1} ] ➔ [ ${f2} ] ➔ [ ? ]\`\n` +
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
      .setFooter({ text: 'Phase 4/4 • Stopping final reel...' });

    await interaction
      .editReply({ embeds: [stage4Embed], components: [spinningRow], files: [], attachments: [] })
      .catch(() => {});
    await sleep(isSuspense ? 650 : 480);

    // ========================================================================
    // STAGE 5: Final Stop & Crystal-Clear Jackpot / Payout Reveal
    // ========================================================================
    let color = 0xe74c3c;
    let statusBanner = `❌ **NO PAYLINE MATCH — LOST -${betAmount.toLocaleString()} 🪙!**`;
    let bannerHeader = '★ ROUND COMPLETE — NO MATCH ★';
    let ledStatus = 'NO PAYLINE COMBINATION — SPIN AGAIN!';
    let finalBadges = ['  LOCKED  ', '  LOCKED  ', '  LOCKED  '];

    if (result.multiplier > 0) {
      if (result.matches === 3) {
        color = 0xf1c40f; // Pure Gold Jackpot
        statusBanner =
          `👑✨ **MEGA JACKPOT! TRIPLE ${result.symbolName.toUpperCase()}S! YOU WON +${winAmount.toLocaleString()} 🪙!** *(Net: **+${profit.toLocaleString()} 🪙** @ **${result.multiplier}x**)*`;
        bannerHeader = `★ MEGA JACKPOT! ${result.multiplier}X PAYOUT ★`;
        ledStatus = `★ JACKPOT! WON +${winAmount.toLocaleString()} TOKENS (${result.multiplier}X) ★`;
        finalBadges = [' ★ JACK ★ ', ' ★ JACK ★ ', ' ★ POT! ★ '];
      } else {
        color = 0x2ecc71; // Emerald Green Win
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
          : `🎰  SLOTS — NO MATCH (-${betAmount.toLocaleString()} 🪙)`
      )
      .setDescription(
        `${statusBanner}\n` +
        `\`\`\`asciidoc\n` +
        `${formatSlotCabinet(r1_locked, r2_locked, r3_locked, finalBadges, ledStatus, bannerHeader)}\n` +
        `\`\`\`\n` +
        `🎯 **Payline**: \`[ ${f1} ]  •  [ ${f2} ]  •  [ ${f3} ]\`  •  📈 **Multiplier**: \`${result.multiplier}x\`\n` +
        `💵 **Wager**: \`${betAmount.toLocaleString()} 🪙\`  •  💰 **Payout**: \`${winAmount > 0 ? `+${winAmount.toLocaleString()} 🪙` : '0 🪙'}\`\n` +
        `💳 **Wallet Balance**: \`${prevBalance.toLocaleString()} 🪙\` ➔ **\`${newBalance.toLocaleString()} 🪙\`** *(${profit >= 0 ? `+${profit.toLocaleString()}` : profit.toLocaleString()} 🪙)*\n` +
        `📜 **Recent Spins**: ${formatRecentSpins()}\n` +
        `💎\`30x\` • 7️⃣\`15x\` • 🔔\`10x\` • 🍇\`5x\` • 🍒\`3x\` • 🍋\`2x\` • *Pairs: \`1.1x–3.0x\`*`
      )
      .setFooter({
        text: `${interaction.user.username} • Balance Updated Instantly • 96% RTP`,
        iconURL: interaction.user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const doubleBet = Math.min(50000, betAmount * 2);

    const controlRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`slots_spin_${betAmount}`)
        .setLabel(`🎰 Spin (${betAmount.toLocaleString()} 🪙)`)
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
      .editReply({ embeds: [finalEmbed], components: [controlRow], files: [], attachments: [] })
      .catch(() => {});
  } catch (err) {
    if (err.code === 10062) return; // Unknown interaction, expired safely
    console.error('[Slots Execution Error]', err.message);
  } finally {
    activeSlotSpins.delete(userId);
  }
}
