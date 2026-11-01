import { fetchGuild, destroyDiscordClient } from '../src/discord.js';
import { EmbedBuilder } from 'discord.js';

async function updateRolesDirectory() {
  const guild = await fetchGuild('1566215806956601466');
  const rolesCh = guild.channels.cache.find(
    (c) => c.name.includes('roles') && !c.name.includes('rules')
  );

  if (!rolesCh) {
    console.error('Roles channel not found!');
    return;
  }

  // Clear previous messages
  const msgs = await rolesCh.messages.fetch({ limit: 10 });
  for (const [, m] of msgs) {
    await m.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🎭  OFFICIAL SERVER ROLE & HIERARCHY DIRECTORY')
    .setDescription(
      `> Welcome to the official role structure of **${guild.name}**!\n` +
      `> All roles are organized hierarchically to maintain server security, ensure fair play, and protect the community from unauthorized modifications.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 👑 LEADERSHIP & MANAGEMENT\n` +
      `✦ **\`👑┃Owner\`** — Server creator and ultimate executive authority.\n` +
      `✦ **\`💼┃Server Manager\`** — Manages community infrastructure, bot systems & operations.\n` +
      `✦ **\`♾️┃Head Administrator\`** — Senior administration, server settings & staff oversight.\n` +
      `✦ **\`🛡️┃Administrator\`** — Platform moderation, channel operations & economy management.\n\n` +
      `### 🔨 MODERATION TEAM\n` +
      `✦ **\`🔨┃Head Moderator\`** — Chat safety director, thread oversight & ban escalations.\n` +
      `✦ **\`♾️┃External Moderator\`** — Active chat moderation, member management & timeouts.\n` +
      `✦ **\`♾️┃Trial Moderator\`** — Moderation staff in training under direct supervision.\n\n` +
      `### ✨ CREATORS & VIPs\n` +
      `✦ **\`♾️┃Influencer\`** — Content creators, streamers, and verified ambassadors.\n\n` +
      `### 🏆 PRESTIGE TIERS (EARNED VIA XP)\n` +
      `✦ **\`👑┃High Roller Elite\`** — **Level 50** prestige champion (+15k tokens).\n` +
      `✦ **\`💎┃Diamond VIP\`** — **Level 35** elite tier (+5k tokens).\n` +
      `✦ **\`🥇┃Gold Tier\`** — **Level 20** unlocked **VIP Suite** access (+2k tokens).\n` +
      `✦ **\`🥈┃Silver Tier\`** — **Level 10** active player (+750 tokens).\n` +
      `✦ **\`🥉┃Bronze Tier\`** — **Level 05** community regular (+250 tokens).\n\n` +
      `### 👥 GENERAL COMMUNITY\n` +
      `✦ **\`✅┃Verified\`** — Full access to community lounges, token games, and voice lounges.\n` +
      `✦ **\`@everyone\`** — Base visitor role with restricted permissions until verified.\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🔒 *Server security is strictly enforced. Regular member roles cannot edit channels, manage roles, or mention everyone.*`
    )
    .setFooter({
      text: 'Hierarchy Directory • Secured Role Architecture • Moonflip',
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  await rolesCh.send({ embeds: [embed] });
  console.log('Roles directory embed updated successfully in #🎭┃roles!');

  await destroyDiscordClient();
  process.exit(0);
}

updateRolesDirectory().catch((err) => {
  console.error(err);
  process.exit(1);
});
