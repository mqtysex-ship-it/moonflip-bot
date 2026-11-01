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
} from './animator.js';

export async function deployGamePanels(guildId = '1566215806956601466') {
  const guild = await fetchGuild(guildId);

  // 1. Mines Panel (5x5 Grid)
  const minesChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('mines'));
  if (minesChan) {
    const msgs = await minesChan.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

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
        `*94% RTP • Provably Fair Seed • Full 5x5 Grid (25 Tiles)*`
      )
      .setImage('attachment://moonflip_mines_preview.gif')
      .setFooter({ text: 'Moonflip Casino • Virtual Tokens Only' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_m5_100_3').setLabel('💣 100 🪙 (3 Bombs)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_m5_250_5').setLabel('💣 250 🪙 (5 Bombs)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('start_m5_500_3').setLabel('🔥 500 🪙 (3 Bombs)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mines_setup_modal').setLabel('⚙️ Custom Game').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await minesChan.send({ embeds: [embed], files: [minesGif], components: [row] });
    console.log(`Deployed 5x5 Mines panel in #${minesChan.name}`);
  }

  // 2. Keno Panel (20-Ball Lottery)
  const kenoChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('keno'));
  if (kenoChan) {
    const msgs = await kenoChan.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const kenoGif = new AttachmentBuilder(getKenoPreviewGif(), {
      name: 'moonflip_keno_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0x9b59b6)
      .setTitle('🎲  MOONFLIP 20-BALL KENO LOTTERY')
      .setDescription(
        `> Select your lucky numbers across the **Moonflip 20-Ball Lottery Board**! 7 winning balls are drawn each round for up to a **30.0x Mega Jackpot**.\n\n` +
        `### 🎯 Payout Multipliers (5-Pick Ticket):\n` +
        `✦ **5/5 Hits**: **30.0x Mega Jackpot** 👑\n` +
        `✦ **4/5 Hits**: **5.5x Payout** 💎\n` +
        `✦ **3/5 Hits**: **2.0x Payout** 🥇\n` +
        `✦ **2/5 Hits**: **1.0x Push (Money Back)** 🥈\n\n` +
        `*94% RTP • Provably Fair Machine Draw • Virtual Tokens Only*`
      )
      .setImage('attachment://moonflip_keno_preview.gif')
      .setFooter({ text: 'Moonflip Casino • Virtual Tokens Only' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('keno_quick_5_100').setLabel('🎲 5 Picks (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('keno_quick_5_250').setLabel('🎲 5 Picks (250 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('keno_quick_3_100').setLabel('🎲 3 Picks (100 🪙)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('keno_modal_btn').setLabel('⚙️ Custom Pick').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await kenoChan.send({ embeds: [embed], files: [kenoGif], components: [row] });
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
    const msgs = await coinChan.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const coinGif = new AttachmentBuilder(getCoinflipAnimationGif('heads'), {
      name: 'moonflip_coinflip_preview.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🪙  MOONFLIP 3D COINFLIP — HIGH-VELOCITY ARENA')
      .setDescription(
        `> Pure 50/50 high-stakes duel! Watch the **gold coin snap off the thumb, climb to 100% apex altitude, spin end-over-end at 1,200 RPM**, wobble on its rim, and settle on the felt!\n\n` +
        `### 🪙 Game Highlights & Payouts:\n` +
        `✦ **Winning Call**: **1.92x Instant Payout** *(4% House Edge)*\n` +
        `✦ **5-Phase Flight Animation**: Launch ➔ Climb ➔ Apex Edge Glint ➔ Rim Wobble ➔ Settle\n` +
        `✦ **Hot Streak & 2x Double**: Track win streaks and double down in one click!`
      )
      .setImage('attachment://moonflip_coinflip_preview.gif')
      .setFooter({ text: 'Moonflip Casino • Provably Fair 3D Coinflip' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('flip_heads_100').setLabel('🪙 Heads (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('flip_tails_100').setLabel('🦅 Tails (100 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('flip_heads_250').setLabel('🪙 Heads (250 🪙)').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('coinflip_modal_btn').setLabel('⚙️ Custom Flip').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await coinChan.send({ embeds: [embed], files: [coinGif], components: [row] });
    console.log(`Deployed Coinflip panel in #${coinChan.name}`);
  }

  // 5. Blackjack Panel
  const bjChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('blackjack'));
  if (bjChan) {
    const msgs = await bjChan.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

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
      .setImage('attachment://moonflip_blackjack_preview.gif')
      .setFooter({ text: 'Moonflip Casino • Virtual Tokens Only' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_bj_100').setLabel('🃏 Deal Hand (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_bj_500').setLabel('🃏 High Stakes (500 🪙)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_daily').setLabel('🎁 Daily (+500)').setStyle(ButtonStyle.Primary)
    );

    await bjChan.send({ embeds: [embed], files: [bjGif], components: [row] });
    console.log(`Deployed Blackjack panel in #${bjChan.name}`);
  }

  // 6. Slots Panel
  const slotsChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('slots'));
  if (slotsChan) {
    const msgs = await slotsChan.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

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
        `*96% RTP • 5-Stage Sequential Reel Lock • Provably Fair Seed*`
      )
      .setImage('attachment://moonflip_slots_preview.gif')
      .setFooter({ text: 'Moonflip Casino • Provably Fair Las Vegas Slots' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('slots_spin_100').setLabel('🎰 Spin (100 🪙)').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('slots_spin_250').setLabel('🎰 Spin (250 🪙)').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('slots_spin_500').setLabel('🔥 High Roller (500 🪙)').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('slots_modal_btn').setLabel('⚙️ Custom Spin').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('💰 Balance').setStyle(ButtonStyle.Secondary)
    );

    await slotsChan.send({ embeds: [embed], files: [slotsGif], components: [row] });
    console.log(`Deployed Slots panel in #${slotsChan.name}`);
  }

  // 7. Rules Channel Banner + Embeds (#rules)
  const rulesCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('rules'));
  if (rulesCh) {
    const msgs = await rulesCh.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

    const rulesGif = new AttachmentBuilder(getRulesBannerGif(), {
      name: 'moonflip_rules_banner.gif',
    });

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏆  MOONFLIP OFFICIAL RULES & PRIZE REDEMPTION')
      .setDescription(
        `> Welcome to **Moonflip**! 🌙🪙\n` +
        `> Our community features provably fair virtual token games, leaderboards, and **promotional prize redemptions** (Crypto & Digital Gift Cards). All members must adhere to the official regulations below.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        {
          name: '`[ 01 ]` 🪙 Virtual Tokens & Fair Acquisition',
          value:
            'Tokens are earned freely through daily claims, level-up rewards, community events, or official server channels. Tokens represent digital entertainment points and promotional entries.',
        },
        {
          name: '`[ 02 ]` 🎁 Prize Redemptions (Crypto & Gift Cards)',
          value:
            'Eligible token balances can be redeemed for promotional rewards, including **cryptocurrency (USDT, LTC, BTC)** and **digital gift cards**, subject to security review and stock availability.',
        },
        {
          name: '`[ 03 ]` 🔞 Strict 18+ Policy & Mandatory KYC',
          value:
            'All prize redemptions are strictly limited to members **18 years of age or older**. Staff reserves the right to request identity verification (KYC) prior to approving any payout.',
        },
        {
          name: '`[ 04 ]` ⚖️ Anti-Money Laundering (AML) & Playthrough',
          value:
            'Acquired tokens cannot be immediately redeemed without gameplay. A mandatory **playthrough / turnover requirement** must be met in compliance with standard AML protections.',
        },
        {
          name: '`[ 05 ]` 🚫 Multi-Accounting & Exploit Forfeiture',
          value:
            'Operating alt accounts, macros, auto-clickers, or exploiting system bugs is strictly prohibited and results in **immediate forfeiture of all balances and a permanent ban**.',
        },
        {
          name: '`[ 06 ]` 🛡️ Anti-Scam & Official Support',
          value:
            'Moonflip Staff will **NEVER** DM you first offering prizes or asking for seed phrases/private keys. Always verify staff roles and use official server channels.',
        }
      )
      .setImage('attachment://moonflip_rules_banner.gif')
      .setFooter({
        text: 'Moonflip Official Rules • 18+ Strictly Enforced • KYC & AML Protected',
        iconURL: guild.iconURL() || undefined,
      })
      .setTimestamp();

    await rulesCh.send({ embeds: [embed], files: [rulesGif] });
    console.log(`Deployed Moonflip Rules banner & embed in #${rulesCh.name}`);
  }

  // 8. Verification Gateway Banner + Embed (#verify)
  const verifyCh = guild.channels.cache.find((c) => c.name.toLowerCase().includes('verify'));
  if (verifyCh) {
    const msgs = await verifyCh.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) await m.delete().catch(() => {});

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
      .setImage('attachment://moonflip_verify_banner.gif')
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

    await verifyCh.send({ embeds: [embed], files: [verifyGif], components: [row] });
    console.log(`Deployed Moonflip Verify banner & embed in #${verifyCh.name}`);
  }
}
