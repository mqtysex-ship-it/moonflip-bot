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
import { buildMinesAttachment } from '../canvas/gameCardRenderer.js';
import { createWebPlaySession, getPublicBaseUrl } from '../web/playApi.js';
import { getMinesLeaderboard } from './minesLeaderboard.js';

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
export async function render5x5Board(
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
  const balance = (await getBalance(user.id));

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

    const netDisplay =
      won || cashedOut
        ? `+${netProfit.toLocaleString()} 🪙`
        : `-${state.betAmount.toLocaleString()} 🪙`;

    const cardAttachment = buildMinesAttachment(state, explodedIdx, won, cashedOut);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(
        cashedOut
          ? `💰  MINES — CASHED OUT +${currentWin.toLocaleString()} 🪙 (${state.multiplier.toFixed(2)}x)!`
          : won
          ? `👑  MINES — PERFECT CLEAR +${currentWin.toLocaleString()} 🪙!`
          : `💥  MINES — DETONATED (-${state.betAmount.toLocaleString()} 🪙)`
      )
      .setImage('attachment://mines_result.png')
      .setDescription(
        `${prefixNotice}${statusText}\n\n` +
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

    const webArenaRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('launch_web_arena')
        .setLabel('🎮 Launch Web Arena (Real-time 3D Board)')
        .setStyle(ButtonStyle.Success)
    );

    return { embed, components: [replayRow, webArenaRow], files: [cardAttachment] };
  }

  // Curiosity Peek / Exploration Mode (Post-Cashout Interactive Board)
  if (state.peekMode) {
    const cardAttachment = buildMinesAttachment(state, null, false, true, false, true);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle(`💰  MINES — CASHED OUT +${currentWin.toLocaleString()} 🪙 (${state.multiplier.toFixed(2)}x)!`)
      .setImage('attachment://mines_result.png')
      .setDescription(
        `${prefixNotice}🎉 **CASHED OUT!** You locked in **+${currentWin.toLocaleString()} 🪙** *(Net Profit: **+${netProfit.toLocaleString()} 🪙**)* at **${state.multiplier.toFixed(2)}x**!\n` +
        `> 🔍 **Exploration Mode Active**: Click any \`❓\` to see what was hidden, or click any green **\`[ 🔄 Replay ]\`** tile to start a fresh game!\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🪙 **Wager**: \`${state.betAmount.toLocaleString()} 🪙\`   •   💣 **Bombs**: \`${state.bombs} / 25\`\n` +
        `💎 **Gems Found**: \`${state.revealedIndices.size} / ${safeGemsTotal}\`   •   📈 **Final Mult**: \`${state.multiplier.toFixed(2)}x\`\n` +
        `💰 **Payout Saved**: **\`+${currentWin.toLocaleString()} 🪙\`** (\`+${netProfit.toLocaleString()} 🪙\` profit)\n` +
        `💳 **Wallet Balance**: **\`${balance.toLocaleString()} 🪙\`**\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({
        text: `${user.username} • Click [🔄 Replay] to play again or [❓] to explore hidden tiles`,
        iconURL: user.displayAvatarURL() || undefined,
      })
      .setTimestamp();

    const rows = [];
    for (let r = 0; r < 5; r++) {
      const row = new ActionRowBuilder();
      for (let c = 0; c < 5; c++) {
        const idx = r * 5 + c;
        const btn = new ButtonBuilder().setCustomId(`m5_tile_${idx}`);

        if (state.revealedIndices.has(idx)) {
          btn
            .setLabel('🔄 Replay')
            .setStyle(ButtonStyle.Success)
            .setDisabled(false);
        } else if (state.peekRevealed?.has(idx)) {
          if (state.bombIndices.has(idx)) {
            btn.setLabel('💣 Bomb').setStyle(ButtonStyle.Danger).setDisabled(true);
          } else {
            btn.setLabel('💎 Gem').setStyle(ButtonStyle.Primary).setDisabled(true);
          }
        } else {
          btn.setLabel('❓').setStyle(ButtonStyle.Secondary);
        }
        row.addComponents(btn);
      }
      rows.push(row);
    }

    return { embed, components: rows, files: [cardAttachment] };
  }

  // Active Game Embed & 25-Button 5x5 Grid (Live Graphic Card on Every Turn!)
  const canCashout = state.revealedIndices.size > 0;
  const instructionLine = canCashout
    ? `> 🟢 **CASH OUT READY**: Click **any green \`[💰 ${state.multiplier.toFixed(2)}x]\` tile** on the grid to Cash Out **+${currentWin.toLocaleString()} 🪙** *(+${netProfit.toLocaleString()} 🪙 profit)*, or click \`❓\` for **${nextMult.toFixed(2)}x**!`
    : `> Click any \`❓\` tile on the **5x5 grid (25 tiles)** to uncover a gem (**${nextMult.toFixed(2)}x**). Once uncovered, click any green gem tile anytime to **Cash Out**!`;

  const activeCardAttachment = buildMinesAttachment(state, null, false, false, false, false);

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(
      canCashout
        ? `💎  5x5 MINES — ${state.multiplier.toFixed(2)}x ACTIVE (+${currentWin.toLocaleString()} 🪙)`
        : '💣  5x5 MINES — HIGH-STAKES GRID'
    )
    .setImage('attachment://mines_result.png')
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

  return { embed, components: rows, files: [activeCardAttachment] };
}

/**
 * Launches the 5x5 Mines Web Arena.
 * Mines is now played exclusively in the Web Arena for optimal 3D real-time performance.
 */
export async function start5x5Mines(interaction) {
  const token = (await createWebPlaySession(interaction.user));
  const baseUrl = getPublicBaseUrl(interaction);
  const playUrl = `${baseUrl}/play?game=mines&token=${token}`;
  const balance = (await getBalance(interaction.user.id));

  const embed = new EmbedBuilder()
    .setColor(0x00f0ff)
    .setTitle('🎮  MOONFLIP 5x5 MINES — WEB ARENA')
    .setDescription(
      `> **5x5 Mines is played exclusively in our high-precision Web Arena!** 💎💣\n\n` +
      `Zero chat latency and no spamming dozens of Discord buttons — experience full 3D real-time interactive Stake.com / Rainbet style gameplay with authentic sounds and instant Cashout.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 **Player**: <@${interaction.user.id}>\n` +
      `🪙 **Your Balance**: \`${balance.toLocaleString()} 🪙\`\n` +
      `⚡ **Features**: 3D Animations • Real Gems & Explosions • Precision Physics • Instant Cash Out\n` +
      `🔒 **Authentication**: 1-Click Discord Auto-Login (No passwords needed)\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `👉 **Click the green button below to launch the Web Arena in your browser!**`
    )
    .setThumbnail('https://cdn-icons-png.flaticon.com/512/1055/1055687.png')
    .setFooter({ text: 'Moonflip Web Arena • Synchronized with Discord Wallet' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🚀 Launch 5x5 Mines in Web Arena')
      .setStyle(ButtonStyle.Link)
      .setURL(playUrl),
    new ButtonBuilder()
      .setCustomId('mines_leaderboard_btn')
      .setLabel('🏆 Mines Leaderboard')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  const isEphemeralCard =
    interaction.isButton() && interaction.message?.flags?.has(MessageFlags.Ephemeral);

  if (isEphemeralCard && !interaction.replied && !interaction.deferred) {
    return await interaction.update({ embeds: [embed], components: [row], files: [], attachments: [], content: null });
  }
  if (interaction.replied || interaction.deferred) {
    return await interaction.editReply({ embeds: [embed], components: [row], files: [], attachments: [], content: null });
  }
  return await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function showMinesLeaderboard(interaction) {
  const lb = (await getMinesLeaderboard());
  const topMults = (lb.topMultipliers || []).slice(0, 5);
  const topProfits = (lb.topPayouts || []).slice(0, 5);

  let multList = '';
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
  for (let i = 0; i < topMults.length; i++) {
    const entry = topMults[i];
    const medal = medals[i] || `#${i + 1}`;
    multList += `${medal} **${entry.username}** — **\`${entry.multiplier.toFixed(2)}×\`** *(+${entry.profit.toLocaleString()} 🪙 • ${entry.bombs}💣)*\n`;
  }
  if (!multList) multList = '*No multipliers recorded yet.*';

  let profitList = '';
  for (let i = 0; i < topProfits.length; i++) {
    const entry = topProfits[i];
    const medal = medals[i] || `#${i + 1}`;
    profitList += `${medal} **${entry.username}** — **\`+${entry.profit.toLocaleString()} 🪙\`** *(at ${entry.multiplier.toFixed(2)}× • wager ${entry.wager.toLocaleString()} 🪙)*\n`;
  }
  if (!profitList) profitList = '*No wins recorded yet.*';

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🏆  5x5 MINES — HALL OF FAME & LEADERBOARD')
    .setDescription(
      `> **Official Hall of Fame: Highest Multipliers & Biggest Wins in 5x5 Mines!** 💎💣\n\n` +
      `🔥 **TOP MULTIPLIERS**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${multList}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `💰 **BIGGEST PAYOUTS**\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${profitList}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    )
    .setFooter({ text: 'Moonflip Mines • Real-Time Synchronized' })
    .setTimestamp();

  const token = (await createWebPlaySession(interaction.user));
  const baseUrl = getPublicBaseUrl(interaction);
  const playUrl = `${baseUrl}/play?game=mines&token=${token}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('🚀 Play 5x5 Mines')
      .setStyle(ButtonStyle.Link)
      .setURL(playUrl),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('💰 My Balance')
      .setStyle(ButtonStyle.Secondary)
  );

  return interaction.reply({
    embeds: [embed],
    components: [row],
    flags: MessageFlags.Ephemeral,
  });
}

export async function handle5x5MinesInteraction(interaction) {
  return start5x5Mines(interaction);
}
