import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { fetchGuild } from '../discord.js';
import { continuousCrash } from './continuousCrash.js';
import {
  getMinesPreviewGif,
  getKenoPreviewGif,
  getCoinflipAnimationGif,
  getBlackjackPreviewGif,
  generateSlotsAnimationGif,
  getRulesBannerGif,
  getVerifyBannerGif,
  getTicketBannerGif,
  getAnnouncementsBannerGif,
} from './animator.js';
import { setupTicketPanel } from '../tickets/ticketSystem.js';
import { buildRulesChannelPayload } from '../rulesSystem.js';

async function clearRecentChannelMessages(chan) {
  try {
    const msgs = await chan.messages.fetch({ limit: 10 }).catch(() => null);
    if (!msgs || msgs.size === 0) return;
    await chan.bulkDelete(msgs, true).catch(async () => {
      for (const [, m] of msgs) await m.delete().catch(() => {});
    });
  } catch {}
}

export async function deployGamePanels(guildId = '1566215806956601466') {
  const guild = await fetchGuild(guildId);

  // 1. Mines Panel (5x5 Grid)
  const minesChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('mines'));
  if (minesChan) {
    await clearRecentChannelMessages(minesChan);

    const minesGif = new AttachmentBuilder(getMinesPreviewGif(), {
      name: 'moonflip_mines_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('💣  MOONFLIP 5x5 MINES — HIGH-STAKES GRID')
      .setDescription(
        `> Step onto the **Moonflip 5x5 Grid (25 tiles)** and uncover sparkling cyan diamonds while dodging hidden explosives! Every gem multiplies your payout.\n\n` +
        `### 🎮 How to Play:\n` +
        `1️⃣ Choose a quick-play preset below or click **⚙️ Custom Game** to set any wager & bomb count (1–24 mines).\n` +
        `2️⃣ Click any tile on the 5x5 grid to reveal either a 💎 **Gem** or 💣 **Bomb**.\n` +
        `3️⃣ Hit **💰 Cash Out** anytime to lock in your multiplied profits!\n\n` +
        `*Provably Fair Seed • Full 5x5 Grid (25 Tiles)*`
      )
      .setFooter({ text: 'Moonflip Casino • Virtual Tokens Only' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_m5_100_3').setLabel('💣 100 🪙 (3 Bombs)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_m5_250_5').setLabel('💣 250 🪙 (5 Bombs)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start_m5_500_3').setLabel('🔥 500 🪙 (3 Bombs)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mines_setup_modal').setLabel('⚙️ Custom Game').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    const webRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('launch_web_arena')
        .setLabel('🎮 Launch Web Arena (Real-time 3D Board)')
        .setStyle(ButtonStyle.Success)
    );

    await minesChan.send({ files: [minesGif], embeds: [embed], components: [row, webRow] });
    console.log(`Deployed 5x5 Mines panel in #${minesChan.name}`);
  }

  // 2. Keno Panel (20-Ball Multi-Risk Lottery)
  const kenoChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('keno'));
  if (kenoChan) {
    await clearRecentChannelMessages(kenoChan);

    const kenoGif = new AttachmentBuilder(getKenoPreviewGif(), {
      name: 'moonflip_keno_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🎲  MOONFLIP 20-BALL KENO — MULTI-RISK CHAMBER')
      .setDescription(
        `> Step up to the **Moonflip Pneumatic Keno Chamber**! Customize **2 to 10 lucky numbers** on our **Interactive 4x5 Board**, choose your **Risk Mode (🟢 Low / 🔥 Medium / 💀 High)**, and watch 7 balls launch into the draw tube!\n\n` +
        `### 🎯 5-Pick Payout Multipliers (By Risk Mode):\n` +
        `✦ **5/5 Hits**: \`🟢 15.0x\` • \`🔥 25.0x\` • **\`💀 45.0x Jackpot\`** 👑\n` +
        `✦ **4/5 Hits**: \`🟢 4.0x\` • \`🔥 6.0x\` • \`💀 9.0x\` 💎\n` +
        `✦ **3/5 Hits**: \`🟢 1.6x\` • \`🔥 2.0x\` • \`💀 2.5x\` 🥇\n` +
        `✦ **2/5 Hits**: \`🟢 0.75x\` • \`🔥 0.40x Salvage\` • \`💀 0.0x\` ⚡\n\n` +
        `*Interactive 20-Button Board • 4-Stage Pneumatic Draw • Up to 120x (7/7 High Risk)*`
      )
      .setFooter({ text: 'Moonflip Casino • Interactive Multi-Risk Keno' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('keno_board_open').setLabel('🎛️ Interactive Board').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('keno_quick_5_100_medium').setLabel('🔥 5 Picks (100 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('keno_quick_5_250_high').setLabel('💀 High Risk (250 🪙)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('keno_modal_btn').setLabel('⚙️ Custom Setup').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await kenoChan.send({ files: [kenoGif], embeds: [embed], components: [row] });
    console.log(`Deployed 20-Ball Keno panel in #${kenoChan.name}`);
  }

  // 3. Continuous Multiplayer Crash
  try {
    await continuousCrash.start(guild);
    console.log('Started Continuous Multiplayer Crash engine');
  } catch (err) {
    console.error('Error starting Continuous Crash:', err.message);
  }

  // 4. Coinflip Panel
  const coinChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('coinflip'));
  if (coinChan) {
    await clearRecentChannelMessages(coinChan);

    const coinGif = new AttachmentBuilder(getCoinflipAnimationGif('heads'), {
      name: 'moonflip_coinflip_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🪙  MOONFLIP 3D COINFLIP — HIGH-VELOCITY ARENA')
      .setDescription(
        `> Pure 50/50 high-stakes duel! Watch the **gold coin snap off the thumb, climb to 100% apex altitude, spin end-over-end at 1,200 RPM**, wobble on its rim, and settle on the felt!\n\n` +
        `### 🪙 Game Highlights & Payouts:\n` +
        `✦ **Winning Call**: **1.92x Instant Payout** *(Provably Fair)*\n` +
        `✦ **5-Phase Flight Animation**: Launch ➔ Climb ➔ Apex Edge Glint ➔ Rim Wobble ➔ Settle\n` +
        `✦ **Hot Streak & 2x Double**: Track win streaks and double down in one click!`
      )
      .setFooter({ text: 'Moonflip Casino • Provably Fair 3D Coinflip' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('flip_heads_100').setLabel('🪙 Heads (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('flip_tails_100').setLabel('🦅 Tails (100 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('flip_heads_250').setLabel('🪙 Heads (250 🪙)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinflip_modal_btn').setLabel('⚙️ Custom Flip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await coinChan.send({ files: [coinGif], embeds: [embed], components: [row] });
    console.log(`Deployed Coinflip panel in #${coinChan.name}`);
  }

  // 5. Blackjack Panel
  const bjChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('blackjack'));
  if (bjChan) {
    await clearRecentChannelMessages(bjChan);

    const bjGif = new AttachmentBuilder(getBlackjackPreviewGif(), {
      name: 'moonflip_blackjack_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🃏  MOONFLIP BLACKJACK — TABLE 21')
      .setDescription(
        `> Classic casino 21 card action against the Moonflip house dealer! Hit a **Natural Blackjack (21)** for an instant **3:2 (2.50x)** payout!\n\n` +
        `### 🃏 Table Rules:\n` +
        `✦ **Natural Blackjack (A + 10/J/Q/K)**: Pays **2.50x** immediately\n` +
        `✦ **Standard Win**: Pays **2.00x** • **Push (Tie)**: **1.00x** refund\n` +
        `✦ **Dealer Rule**: Dealer stands on 17 and hits on 16 or below.`
      )
      .setFooter({ text: 'Moonflip Casino • Virtual Tokens Only' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_bj_100').setLabel('🃏 Deal Hand (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_bj_500').setLabel('🃏 High Stakes (500 🪙)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('bj_modal_btn').setLabel('⚙️ Custom Bet').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_daily').setLabel('🎁 Daily (+500)').setStyle(ButtonStyle.Primary)
    );

    await bjChan.send({ files: [bjGif], embeds: [embed], components: [row] });
    console.log(`Deployed Blackjack panel in #${bjChan.name}`);
  }

  // 6. Slots Panel
  const slotsChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('slots'));
  if (slotsChan) {
    await clearRecentChannelMessages(slotsChan);

    const slotsGif = new AttachmentBuilder(
      generateSlotsAnimationGif(
        ['🍒', '💎', '🍋'],
        ['🔔', '💎', '🍇'],
        ['7️⃣', '💎', '🍒'],
        { reels: ['💎', '💎', '💎'], multiplier: 30, matches: 3, symbolName: 'Diamond' }
      ),
      { name: 'moonflip_slots_preview.gif' }
    );

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎰  MOONFLIP GRAND SLOTS — 3-DRUM CASINO CABINET')
      .setDescription(
        `> Step up to the **Moonflip Vegas Slot Machine**! Pull the chrome lever and watch all 3 vertical drums spin, lock in one-by-one with suspense detection, and trigger massive payline jackpots!\n\n` +
        `### 💎 Official Paytable Multipliers:\n` +
        `✦ 💎 💎 💎 : **30.0x Mega Diamond Jackpot** 👑 *(Pair: 3.0x)*\n` +
        `✦ 7️⃣ 7️⃣ 7️⃣ : **15.0x Lucky Seven Jackpot** 🔥 *(Pair: 2.5x)*\n` +
        `✦ 🔔 🔔 🔔 : **10.0x Golden Liberty Bell** ⭐ *(Pair: 2.0x)*\n` +
        `✦ 🍇 🍇 🍇 : **5.0x Royal Grapes** 🍇 *(Pair: 1.5x)*\n` +
        `✦ 🍒 🍒 🍒 : **3.0x Ruby Cherries** 🍒 *(Pair: 1.2x)*\n` +
        `✦ 🍋 🍋 🍋 : **2.0x Golden Lemon** 🍋 *(Pair: 1.1x)*\n\n` +
        `*Provably Fair Seed • 5-Stage Sequential Reel Lock*`
      )
      .setFooter({ text: 'Moonflip Casino • Provably Fair Las Vegas Slots' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin_100').setLabel('🎰 Spin (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('slots_spin_250').setLabel('🎰 Spin (250 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('slots_spin_500').setLabel('🔥 High Roller (500 🪙)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('slots_modal_btn').setLabel('⚙️ Custom Spin').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await slotsChan.send({ files: [slotsGif], embeds: [embed], components: [row] });
    console.log(`Deployed Slots panel in #${slotsChan.name}`);
  }

  // 7. Rules Channel Banner + Interactive Dropdown & Embed (#rules)
  const rulesCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('rules'));
  if (rulesCh) {
    await clearRecentChannelMessages(rulesCh);
    const rulesPayload = buildRulesChannelPayload(guild);
    await rulesCh.send(rulesPayload);
    console.log(`Deployed Moonflip Rules banner, embed & dropdown in #${rulesCh.name}`);
  }

  // 8. Verification Gateway Banner + Embed (#verify)
  const verifyCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('verify'));
  if (verifyCh) {
    await clearRecentChannelMessages(verifyCh);

    const verifyGif = new AttachmentBuilder(getVerifyBannerGif(), {
      name: 'moonflip_verify_banner.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('⚡  MOONFLIP — ACCOUNT VERIFICATION GATEWAY')
      .setDescription(
        `> Welcome to **Moonflip**! 🌙✨\n` +
        `> To protect our community, prevent bot/alt abuse, and maintain a fair gaming & prize redemption environment, please verify your account below.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 📜 BEFORE VERIFYING:\n` +
        `1️⃣ Read and accept the official rules in <#${rulesCh?.id || ''}>\n` +
        `2️⃣ Confirm you are **18+** to participate in promotional prize redemptions\n` +
        `3️⃣ Understand that redemptions require standard playthrough & KYC verification\n` +
        `4️⃣ Click **✅ Verify Now & Unlock Moonflip** below to access all games and lounges!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .setFooter({
        text: 'Moonflip Security Gateway • Instant Role Assignment',
        iconURL: guild.iconURL() || undefined,
      })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Verify Now & Unlock Moonflip')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );

    await verifyCh.send({ files: [verifyGif], embeds: [embed], components: [row] });
    console.log(`Deployed Moonflip Verify banner & embed in #${verifyCh.name}`);
  }

  // 9. Announcements Channel Banner + Embed (#announcements)
  const announceCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('announcements'));
  const ticketCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('create-ticket') || c.name.toLowerCase().includes('tickets'));
  const loungeCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('lounge') && !c.name.toLowerCase().includes('vip') && !c.name.toLowerCase().includes('staff'));
  if (announceCh) {
    await clearRecentChannelMessages(announceCh);

    const announceGif = new AttachmentBuilder(getAnnouncementsBannerGif(), {
      name: 'moonflip_announcements_banner.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('📢  WELCOME TO MOONFLIP — OFFICIAL ANNOUNCEMENTS')
      .setDescription(
        `> Welcome to the official **Moonflip** community! 🌙🪙\n` +
        `> This channel is your primary broadcast hub for **platform updates, new game launches, token giveaways, leaderboard tournaments, and promotional reward events**.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 🚀 GETTING STARTED ON MOONFLIP:\n` +
        `✦ **Verify Your Account**: Unlock all channels in <#${verifyCh?.id || ''}>\n` +
        `✦ **Official Regulations**: Review fair play & prize rules in <#${rulesCh?.id || ''}>\n` +
        `✦ **Community Lounge**: Chat & earn XP in <#${loungeCh?.id || ''}>\n` +
        `✦ **24/7 Support & Redemptions**: Open a ticket anytime in <#${ticketCh?.id || ''}>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🔔 *Keep notifications enabled for this channel so you never miss a free token drop or event!*`
      )
      .setFooter({
        text: 'Moonflip Official Broadcast • Stay Tuned for Events & Giveaways',
        iconURL: guild.iconURL() || undefined,
      })
      .setTimestamp();

    await announceCh.send({ files: [announceGif], embeds: [embed] });
    console.log(`Deployed Moonflip Announcements banner & embed in #${announceCh.name}`);
  }

  // 10. Support Ticket Panel (#create-ticket)
  try {
    await setupTicketPanel(guild);
    console.log('Deployed Moonflip Support Ticket banner & panel');
  } catch (err) {
    console.error('Error deploying ticket panel:', err.message);
  }
}
