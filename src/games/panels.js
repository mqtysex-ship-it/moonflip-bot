import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
} from 'discord.js';
import { fetchGuild } from '../discord.js';
import { continuousCrash } from './continuousCrash.js';
import {
  getMinesPreviewGif,
  getPlinkoPreviewGif,
  getCoinflipAnimationGif,
  getBlackjackPreviewGif,
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
      .setColor(0x00f0ff)
      .setTitle('💣 Mines')
      .setDescription(
        `> Uncover safe gems on the 5×5 grid. Each gem boosts your multiplier — cash out before hitting a mine.\n\n` +
        `**Grid Settings**\n` +
        `• **Tiles:** \`5×5\` (25 tiles)\n` +
        `• **Mines:** \`1\` to \`24\` configurable\n` +
        `• **Cashout:** Anytime\n\n` +
        `-# 🌐 Web Arena • Synced Discord Wallet • Provably Fair`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('launch_web_mines')
        .setLabel('Play Mines')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('eco_balance')
        .setLabel('Balance')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_daily')
        .setLabel('Daily (+500)')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Secondary)
    );

    await minesChan.send({ files: [minesGif], embeds: [embed], components: [row] });
    console.log(`Deployed 5x5 Mines Web Arena panel in #${minesChan.name}`);
  }

  // 1b. Plinko Panel (8–16 Rows Multi-Risk Pyramid — Web Arena)
  await deployPlinkoPanel(guild);


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
      .setTitle('🪙 Coinflip')
      .setDescription(
        `> Call Heads or Tails for an instant 50/50 flip in our interactive Web Arena.\n\n` +
        `**Game Info**\n` +
        `• **Multiplier:** \`1.92x\` (96% RTP)\n` +
        `• **Sides:** Heads 🟡 or Tails ⚪\n` +
        `• **Features:** Animated 3D Coin & Auto-Bet\n\n` +
        `-# 🌐 Web Arena • Synced Discord Wallet • Provably Fair`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('launch_web_coinflip')
        .setLabel('Play Coinflip')
        .setEmoji('🎮')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId('eco_balance')
        .setLabel('Balance')
        .setEmoji('💰')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('eco_daily')
        .setLabel('Daily (+500)')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Secondary)
    );

    await coinChan.send({ files: [coinGif], embeds: [embed], components: [row] });
    console.log(`Deployed Coinflip Web Arena panel in #${coinChan.name}`);
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
      .setTitle('🃏 Blackjack')
      .setDescription(
        `> Play 21 against the house dealer.\n\n` +
        `**Rules & Payouts**\n` +
        `• **Blackjack:** \`2.5x\` (3:2)\n` +
        `• **Standard Win:** \`2.0x\` · **Push:** \`1.0x\`\n` +
        `• **Dealer:** Stands on 17\n\n` +
        `-# ⚡ Instant Discord Game • Provably Fair`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_bj_100').setLabel('Deal (100)').setEmoji('🟢').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('start_bj_500').setLabel('Deal (500)').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('launch_web_app').setLabel('Open WebApp').setEmoji('🌐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('eco_balance').setLabel('Balance').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('eco_daily').setLabel('Daily (+500)').setEmoji('🎁').setStyle(ButtonStyle.Secondary)
    );

    await bjChan.send({ files: [bjGif], embeds: [embed], components: [row] });
    console.log(`Deployed Blackjack panel in #${bjChan.name}`);
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
      .setColor(0x5865f2)
      .setTitle('⚡ Account Verification')
      .setDescription(
        `> Welcome to **${guild.name}**! Complete verification to access games and community channels.\n\n` +
        `**Requirements**\n` +
        `• Must be **18 years or older**\n` +
        `• Agree to the community rules in <#${rulesCh?.id || ''}>\n\n` +
        `-# Click the button below to verify instantly.`
      )
      .setFooter({
        text: 'Moonflip',
        iconURL: guild.iconURL() || undefined,
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verify_button')
        .setLabel('Verify Account')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
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
      .setColor(0x5865f2)
      .setTitle('📢 Announcements')
      .setDescription(
        `> Platform updates, new game releases, and server events.\n\n` +
        `**Quick Links**\n` +
        `• 📜 **Rules:** <#${rulesCh?.id || ''}>\n` +
        `• 💬 **Lounge:** <#${loungeCh?.id || ''}>\n` +
        `• 🎫 **Support:** <#${ticketCh?.id || ''}>\n\n` +
        `-# Enable channel notifications so you never miss an announcement!`
      )
      .setFooter({
        text: 'Moonflip',
        iconURL: guild.iconURL() || undefined,
      });

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

export async function deployPlinkoPanel(guildOrId = '1566215806956601466') {
  const guild = typeof guildOrId === 'string' ? await fetchGuild(guildOrId) : guildOrId;

  let plinkoChan = guild.channels.cache.find((c) => c.name.toLowerCase().includes('plinko'));
  if (!plinkoChan) {
    const gamesCat = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        (c.id === '1566223500161585292' || c.name.toLowerCase().includes('ɢᴀᴍᴇs') || c.name.toLowerCase().includes('games'))
    );
    const parentOverwrites = gamesCat
      ? [...gamesCat.permissionOverwrites.cache.values()].map((ov) => ({
          id: ov.id,
          type: ov.type,
          allow: ov.allow.bitfield,
          deny: ov.deny.bitfield,
        }))
      : undefined;

    plinkoChan = await guild.channels.create({
      name: '🎯┃plinko',
      type: ChannelType.GuildText,
      parent: gamesCat?.id,
      topic: 'Plinko (8–16 rows, Low / Medium / High risk).',
      permissionOverwrites: parentOverwrites,
    });
    console.log(`Created channel #${plinkoChan.name}`);
  }

  await clearRecentChannelMessages(plinkoChan);

  const plinkoGif = new AttachmentBuilder(getPlinkoPreviewGif(), {
    name: 'moonflip_plinko_preview.gif',
  });

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('🎯 Plinko')
    .setDescription(
      `> Drop balls through the peg pyramid and aim for the high edge multipliers.\n\n` +
      `**Pyramid Settings**\n` +
      `• **Rows:** \`8\` to \`16\` rows\n` +
      `• **Risk:** \`Low\` • \`Medium\` • \`High\`\n` +
      `• **Max Multiplier:** up to \`1,000x\`\n\n` +
      `-# 🌐 Web Arena • Synced Discord Wallet • Provably Fair`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('launch_web_plinko')
      .setLabel('Play Plinko')
      .setEmoji('🎮')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('eco_balance')
      .setLabel('Balance')
      .setEmoji('💰')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('eco_daily')
      .setLabel('Daily (+500)')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Secondary)
  );

  await plinkoChan.send({ files: [plinkoGif], embeds: [embed], components: [row] });
  console.log(`Deployed Plinko Web Arena panel in #${plinkoChan.name}`);
  return plinkoChan;
}
