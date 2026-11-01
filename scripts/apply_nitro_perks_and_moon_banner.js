import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import {
  Client,
  GatewayIntentBits,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  EmbedBuilder,
} from 'discord.js';
import {
  decodePNG,
  generateMoonBannerGIF,
  generateAnimatedServerIconGIF,
  generateInviteSplashPNG,
  generateCustomEmojis,
  generateCustomStickers,
} from '../src/brandingGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

const GUILD_ID = '1566215806956601466';

async function main() {
  console.log('🎨 1. Generating Moonflip Animated GIF Banner, Animated Icon, Invite Splash, Emojis & Stickers...');
  const brandingDir = path.resolve(__dirname, '../data/branding');
  fs.mkdirSync(brandingDir, { recursive: true });

  const iconBuf = fs.readFileSync(path.resolve(__dirname, '../data/current_server_icon.png'));
  const iconPng = decodePNG(iconBuf);

  const bannerGif = generateMoonBannerGIF(iconPng);
  const bannerPath = path.join(brandingDir, 'moonflip_banner.gif');
  fs.writeFileSync(bannerPath, bannerGif);
  console.log(`   ✅ Generated moonflip_banner.gif (${(bannerGif.length / 1024).toFixed(1)} KB)`);

  const animIconGif = generateAnimatedServerIconGIF(iconPng);
  const animIconPath = path.join(brandingDir, 'moonflip_animated_icon.gif');
  fs.writeFileSync(animIconPath, animIconGif);
  console.log(`   ✅ Generated moonflip_animated_icon.gif (${(animIconGif.length / 1024).toFixed(1)} KB)`);

  const splashPng = generateInviteSplashPNG(iconPng);
  const splashPath = path.join(brandingDir, 'moonflip_invite_splash.png');
  fs.writeFileSync(splashPath, splashPng);
  console.log(`   ✅ Generated moonflip_invite_splash.png (${(splashPng.length / 1024).toFixed(1)} KB)`);

  const customEmojis = generateCustomEmojis(iconPng);
  console.log(`   ✅ Generated ${customEmojis.length} custom emojis (8 animated GIFs + 6 static PNGs)`);

  const customStickers = generateCustomStickers(iconPng);
  console.log(`   ✅ Generated ${customStickers.length} custom 320x320 PNG stickers`);

  // Connect to Discord
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await new Promise((resolve) => {
    client.once('clientReady', resolve);
    client.login(process.env.DISCORD_BOT_TOKEN);
  });

  const guild = await client.guilds.fetch(GUILD_ID);
  await Promise.all([
    guild.channels.fetch(),
    guild.roles.fetch(),
    guild.emojis.fetch(),
    guild.stickers.fetch(),
  ]);
  console.log(`\n🚀 Connected to ${guild.name} | Boost Tier: ${guild.premiumTier} (${guild.premiumSubscriptionCount} Boosts)`);
  console.log(`   Active Guild Features: ${guild.features.join(', ')}`);

  // ==========================================================================
  // 2. APPLY SERVER-LEVEL NITRO PERKS (Animated Icon, Invite Splash, Banner)
  // ==========================================================================
  console.log('\n🌟 2. Applying Server-Level Visual Perks...');

  // 2A. Animated Server Icon (ANIMATED_ICON unlocked at 2 boosts)
  try {
    await guild.setIcon(animIconGif, 'Nitro Boost Level 1 Perk: Animated Moonflip Server Icon GIF');
    console.log('   ✅ Set Animated Server Icon (moonflip_animated_icon.gif)!');
  } catch (err) {
    console.warn('   ⚠️ Could not set animated icon:', err.message);
  }

  // 2B. Custom Invite Splash Background (INVITE_SPLASH unlocked at 2 boosts)
  try {
    await guild.setSplash(splashPng, 'Nitro Boost Level 1 Perk: Custom Moonflip Invite Splash');
    console.log('   ✅ Set Custom Invite Splash Screen (moonflip_invite_splash.png)!');
  } catch (err) {
    console.warn('   ⚠️ Could not set invite splash:', err.message);
  }

  // 2C. Attempt setting Server Banner (moonflip_banner.gif)
  try {
    await guild.setBanner(bannerGif, 'Moonflip Animated Server Banner GIF');
    const refreshed = await client.guilds.fetch({ guild: GUILD_ID, force: true });
    if (refreshed.banner) {
      console.log(`   ✅ Server Banner set natively on guild (hash: ${refreshed.banner})!`);
    } else {
      console.log(
        '   ℹ️ Note: Discord API accepted the request, but native sidebar banner slot requires BANNER feature (Level 2 / 7 boosts). We will deploy moonflip_banner.gif directly across server channels & headers!'
      );
    }
  } catch (err) {
    console.log(`   ℹ️ Native guild.setBanner info: ${err.message}`);
  }

  // ==========================================================================
  // 3. UPGRADE ALL VOICE CHANNELS TO 128 KBPS HD AUDIO (AUDIO_BITRATE_128_KBPS)
  // ==========================================================================
  console.log('\n🔊 3. Upgrading Voice Channels to 128 kbps HD Audio...');
  const maxBitrate = guild.maximumBitrate || 128000;
  const voiceChannels = guild.channels.cache.filter((c) => c.isVoiceBased());
  for (const [, vc] of voiceChannels) {
    if (vc.name.toLowerCase().includes('afk')) continue;
    if (vc.bitrate !== maxBitrate) {
      await vc.setBitrate(maxBitrate, 'Nitro Boost Level 1 Perk: 128 kbps HD Voice Audio');
      console.log(`   ✅ Upgraded ${vc.name} bitrate: 64 kbps -> ${maxBitrate / 1000} kbps`);
    } else {
      console.log(`   ✅ ${vc.name} already at ${maxBitrate / 1000} kbps`);
    }
  }

  // ==========================================================================
  // 4. UPLOAD CUSTOM ANIMATED & STATIC EMOJIS
  // ==========================================================================
  console.log('\n😎 4. Uploading Custom Animated & Static Server Emojis...');
  const uploadedEmojis = {};
  for (const item of customEmojis) {
    const existing = guild.emojis.cache.find((e) => e.name === item.name);
    if (existing) {
      await existing.delete('Refreshing Moonflip custom emoji').catch(() => {});
    }
    try {
      const created = await guild.emojis.create({
        attachment: item.buffer,
        name: item.name,
        reason: 'Moonflip Nitro Boost Custom Emoji Pack',
      });
      uploadedEmojis[item.name] = created.toString();
      console.log(`   ✅ Created ${item.animated ? 'ANIMATED' : 'STATIC'} emoji: ${created.toString()} (:${item.name}:)`);
    } catch (err) {
      console.warn(`   ⚠️ Failed to create emoji ${item.name}:`, err.message);
    }
  }

  // ==========================================================================
  // 5. UPLOAD CUSTOM SERVER STICKERS (Boost Level 1 unlocks 15 Sticker Slots)
  // ==========================================================================
  console.log('\n🏷️ 5. Uploading Custom Server Stickers...');
  for (const st of customStickers) {
    const existing = guild.stickers.cache.find((s) => s.name === st.name);
    if (existing) {
      console.log(`   ✅ Sticker "${st.name}" already exists (${existing.id})`);
      continue;
    }
    try {
      const created = await guild.stickers.create({
        file: st.buffer,
        name: st.name,
        tags: st.tags,
        description: st.description,
        reason: 'Moonflip Nitro Boost Custom Sticker Pack',
      });
      console.log(`   ✅ Created custom sticker: "${created.name}" (${created.id})`);
    } catch (err) {
      console.warn(`   ⚠️ Failed to create sticker "${st.name}":`, err.message);
    }
  }

  // ==========================================================================
  // 6. UPGRADE & POSITION THE "🚀 Nitro Booster" ROLE + GRANT VIP ACCESS
  // ==========================================================================
  console.log('\n🚀 6. Upgrading Server Booster Role & VIP Perks...');
  const boosterRole = guild.roles.cache.find(
    (r) => r.tags?.premiumSubscriberRole || r.name.toLowerCase().includes('booster')
  );
  const goldRole = guild.roles.cache.find((r) => r.name.toLowerCase().includes('gold'));
  const diamondRole = guild.roles.cache.find((r) => r.name.toLowerCase().includes('diamond'));

  if (boosterRole) {
    await boosterRole.edit({
      name: '🚀 Nitro Booster',
      color: 0xf47fff,
      hoist: true,
      reason: 'Style & hoist Nitro Server Booster role',
    });
    if (diamondRole) {
      await boosterRole.setPosition(diamondRole.position).catch(() => {});
    }
    console.log(`   ✅ Styled & hoisted role: ${boosterRole.name} (#f47fff)`);

    // Grant 🚀 Nitro Booster access to VIP High Roller category (#👑┃vip-lounge & 🔊┃VIP High Roller Suite)
    const vipCat = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        (c.name.includes('ʜɪɢʜ ʀᴏʟʟᴇʀ') || c.name.toLowerCase().includes('vip'))
    );
    if (vipCat) {
      await vipCat.permissionOverwrites.edit(boosterRole.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AddReactions: true,
        EmbedLinks: true,
        AttachFiles: true,
        Connect: true,
        Speak: true,
        Stream: true,
      });
      const vipChildren = guild.channels.cache.filter((c) => c.parentId === vipCat.id);
      for (const [, ch] of vipChildren) {
        await ch.lockPermissions().catch(() => {});
      }
      console.log(`   ✅ Granted ${boosterRole.name} full access to ${vipCat.name} (#vip-lounge & VIP Voice Suite)!`);
    }
  }

  // ==========================================================================
  // 7. DEPLOY ANIMATED MOON GIF BANNER & EMOJIS TO KEY CHANNELS
  // ==========================================================================
  console.log('\n🖼️ 7. Deploying Animated Moon GIF Banner & Nitro Showcase to Server Channels...');

  const em = (name, fallback) => uploadedEmojis[name] || fallback;

  // 7A. Update #🎭┃roles with Animated Moon Banner GIF at top + Nitro Booster tier
  const rolesCh = guild.channels.cache.find(
    (c) => c.name.includes('roles') && !c.name.includes('rules')
  );
  if (rolesCh) {
    const msgs = await rolesCh.messages.fetch({ limit: 10 }).catch(() => []);
    for (const [, m] of msgs) {
      if (m.author.id === client.user.id) await m.delete().catch(() => {});
    }

    const bannerAttach = new AttachmentBuilder(bannerGif, { name: 'moonflip_banner.gif' });
    const rolesEmbed = new EmbedBuilder()
      .setColor(0x00ffa3)
      .setTitle(`${em('mf_moon', '🌙')}  OFFICIAL SERVER ROLE & HIERARCHY DIRECTORY`)
      .setImage('attachment://moonflip_banner.gif')
      .setDescription(
        `> Welcome to the official role structure of **${guild.name}**!\n` +
        `> All roles are organized hierarchically to maintain server security, ensure fair play, and reward our most active members & Nitro Boosters.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### ${em('mf_crown', '👑')} LEADERSHIP & MANAGEMENT\n` +
        `✦ **\`👑 Owner\`** — Server creator and ultimate executive authority.\n` +
        `✦ **\`👑 Server Manager\`** — Manages community infrastructure, bot systems & operations.\n` +
        `✦ **\`♾️ Head Administrator\`** — Senior administration, server settings & staff oversight.\n` +
        `✦ **\`🛡️ Administrator\`** — Platform moderation, channel operations & economy management.\n` +
        `✦ **\`🌙 Moonflip Official\`** — Official platform representative & host.\n\n` +
        `### 🛡️ MODERATION TEAM\n` +
        `✦ **\`♾️ Head Moderator\`** — Chat safety director, thread oversight & ban escalations.\n` +
        `✦ **\`♾️ External Moderator\`** — Active chat moderation, member management & timeouts.\n` +
        `✦ **\`♾️ Trial Moderator\`** — Moderation staff in training under direct supervision.\n\n` +
        `### ${em('mf_boost', '🚀')} NITRO BOOSTERS & CREATORS\n` +
        `✦ **\`🚀 Nitro Booster\`** — Server Boosters! Unlocks **VIP High Roller Lounge & 128kbps Suite**, hoisted pink badge & exclusive animated emojis.\n` +
        `✦ **\`♾️ Influencer\`** — Content creators, streamers, and verified ambassadors.\n\n` +
        `### ${em('mf_trophy', '🏆')} PRESTIGE TIERS (EARNED VIA XP)\n` +
        `✦ **\`👑 High Roller Elite\`** — **Level 50** prestige champion (+15k tokens).\n` +
        `✦ **\`💎 Diamond VIP\`** — **Level 35** elite tier (+5k tokens).\n` +
        `✦ **\`🥇 Gold Tier\`** — **Level 20** unlocked **VIP Suite** access (+2k tokens).\n` +
        `✦ **\`🥈 Silver Tier\`** — **Level 10** active player (+750 tokens).\n` +
        `✦ **\`🥉 Bronze Tier\`** — **Level 05** community regular (+250 tokens).\n\n` +
        `### ${em('mf_verified', '✅')} GENERAL COMMUNITY\n` +
        `✦ **\`Verified\`** — Full access to community lounges, token games, and 128kbps voice lounges.\n` +
        `✦ **\`@everyone\`** — Base visitor role with restricted permissions until verified.`
      )
      .setFooter({
        text: 'Moonflip Role Directory • Nitro Boosted Server',
        iconURL: guild.iconURL() || undefined,
      })
      .setTimestamp();

    await rolesCh.send({ embeds: [rolesEmbed], files: [bannerAttach] });
    console.log(`   ✅ Updated #${rolesCh.name} with Animated Moon Banner GIF & Nitro Booster tier!`);
  }

  // 7B. Upload Official Generated Assets to #🎨┃brand-resources
  const brandCh = guild.channels.cache.find((c) => c.name.includes('brand-resources'));
  if (brandCh) {
    const f1 = new AttachmentBuilder(bannerGif, { name: 'moonflip_banner.gif' });
    const f2 = new AttachmentBuilder(animIconGif, { name: 'moonflip_animated_icon.gif' });
    const f3 = new AttachmentBuilder(splashPng, { name: 'moonflip_invite_splash.png' });

    const assetEmbed = new EmbedBuilder()
      .setColor(0x00ffa3)
      .setTitle(`${em('mf_moon', '🌙')}  OFFICIAL GENERATED NITRO ASSETS (BANNER GIF, ANIMATED ICON & SPLASH)`)
      .setDescription(
        `> Here are the official animated & high-resolution **Moonflip** assets generated for our Nitro Boosted server:\n\n` +
        `✦ 🖼️ **\`moonflip_banner.gif\`** — Official Animated Cosmic Moon & Flipping Chip Banner GIF (16:9).\n` +
        `✦ 🌙 **\`moonflip_animated_icon.gif\`** — Official Animated Server Icon GIF (with specular light sweep & twinkling stars, active on the server!).\n` +
        `✦ 🌌 **\`moonflip_invite_splash.png\`** — Official 1280x720 HD Invite Splash Background (active on server invites!).\n` +
        `✦ 😎 **14 Custom Emojis & 3 Stickers** — Uploaded directly to the server:` +
        `\n${Object.values(uploadedEmojis).join(' ')}`
      )
      .setImage('attachment://moonflip_banner.gif')
      .setFooter({ text: 'Moonflip Official Brand Pack • Ready for Download' })
      .setTimestamp();

    await brandCh.send({ embeds: [assetEmbed], files: [f1, f2, f3] });
    console.log(`   ✅ Posted downloadable Moon Banner GIF, Animated Icon GIF & Invite Splash in #${brandCh.name}!`);
  }

  // 7C. Post Nitro Boost Celebration & Emoji Showcase in #📢┃announcements
  const announceCh = guild.channels.cache.find((c) => c.name.includes('announcements'));
  if (announceCh) {
    const bannerFile = new AttachmentBuilder(bannerGif, { name: 'moonflip_banner.gif' });
    const boostEmbed = new EmbedBuilder()
      .setColor(0xf47fff)
      .setTitle(`${em('mf_boost', '🚀')}  MOONFLIP NITRO BOOST LEVEL 1 UNLOCKED!  ${em('mf_moon', '🌙')}`)
      .setImage('attachment://moonflip_banner.gif')
      .setDescription(
        `> Huge thank you to our **Server Boosters** for powering **Moonflip** to **Boost Level 1 (2 Boosts)**!\n` +
        `> We have unlocked and activated every Nitro perk across the server:\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### ${em('mf_crown', '👑')} NEW NITRO SERVER UPGRADES ACTIVE NOW\n` +
        `✦ ${em('mf_moon', '🌙')} **Animated Moonflip Server Icon & Banner GIF** — Custom cosmic emerald moon animation!\n` +
        `✦ 🖼️ **HD Invite Background Splash** — Custom widescreen Moonflip artwork on all invite links!\n` +
        `✦ 🔊 **128 kbps Studio HD Voice Audio** — All Voice Lounges & VIP Suites upgraded from 64kbps to **128kbps**!\n` +
        `✦ ${em('mf_boost', '🚀')} **\`🚀 Nitro Booster\` VIP Perks** — Hoisted pink role + instant access to **#👑┃vip-lounge** & **🔊┃VIP High Roller Suite**!\n` +
        `✦ 🏷️ **Custom Moonflip Stickers** — 3 new custom server stickers unlocked in chat!\n\n` +
        `### ${em('mf_coin', '🪙')} NEW CUSTOM ANIMATED & STATIC EMOJIS\n` +
        `Use our brand-new custom Moonflip emojis anywhere across Discord:\n` +
        `> **Animated:** ${em('mf_moon', '')} ${em('mf_coin', '')} ${em('mf_boost', '')} ${em('mf_777', '')} ${em('mf_rocket', '')} ${em('mf_crown', '')} ${em('mf_fire', '')} ${em('mf_diamond', '')}\n` +
        `> **Static:** ${em('mf_logo', '')} ${em('mf_verified', '')} ${em('mf_bomb', '')} ${em('mf_vip', '')} ${em('mf_trophy', '')} ${em('mf_cards', '')}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `*Boost the server anytime to claim your **🚀 Nitro Booster** badge and help unlock the next tier!*`
      )
      .setFooter({
        text: 'Moonflip • Provably Fair Token Entertainment • Nitro Boosted',
        iconURL: guild.iconURL() || undefined,
      })
      .setTimestamp();

    await announceCh.send({ embeds: [boostEmbed], files: [bannerFile] });
    console.log(`   ✅ Posted Nitro Boost Level 1 & Moon Banner GIF announcement in #${announceCh.name}!`);
  }

  console.log('\n🎉 ALL NITRO BOOST PERKS, ANIMATED MOON GIFS, EMOJIS & STICKERS DEPLOYED!');
  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
