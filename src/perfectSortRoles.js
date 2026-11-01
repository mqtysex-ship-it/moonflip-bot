import { fetchGuild, destroyDiscordClient } from './discord.js';

async function perfectSortRoles() {
  const guild = await fetchGuild('1566215806956601466');

  // Delete legacy un-prefixed "Admin" role if it exists to avoid redundancy
  const legacyAdmin = guild.roles.cache.find((r) => r.name === 'Admin');
  if (legacyAdmin) {
    await legacyAdmin.delete().catch(() => {});
    console.log('Removed legacy Admin role');
  }

  // Desired hierarchy from top to bottom (highest number is top)
  const hierarchyDesc = [
    '👑┃Owner',
    '💼┃Server Manager',
    '🛡️┃Head Admin',
    '🛡️┃Administrator',
    '🔨┃Head Moderator',
    '🔨┃Moderator',
    '🔰┃Trial Moderator',
    '✨┃Influencer',
    '👑┃High Roller Elite',
    '💎┃Diamond VIP',
    '🥇┃Gold Tier',
    '🥈┃Silver Tier',
    '🥉┃Bronze Tier',
    '✅┃Verified',
  ];

  // In Discord, role position 1 is above @everyone (0). Higher position = higher in sidebar.
  const reversed = [...hierarchyDesc].reverse();
  const updates = [];

  for (let i = 0; i < reversed.length; i++) {
    const name = reversed[i];
    const role = guild.roles.cache.find((r) => r.name === name);
    if (role) {
      updates.push({ role, position: i + 1 });
    }
  }

  try {
    await guild.roles.setPositions(updates);
    console.log('Roles sorted successfully in exact hierarchy!');
  } catch (err) {
    console.error('Sort error:', err.message);
  }

  // Print final order
  await guild.roles.fetch();
  for (const r of guild.roles.cache.sort((a, b) => b.position - a.position).values()) {
    console.log(`[Pos ${r.position}] @${r.name}`);
  }

  await destroyDiscordClient();
}

perfectSortRoles().catch(console.error);
