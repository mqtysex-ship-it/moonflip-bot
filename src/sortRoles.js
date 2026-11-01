import { fetchGuild, destroyDiscordClient } from './discord.js';

async function sortRoles() {
  const guild = await fetchGuild('1566215806956601466');

  // Hierarchy in descending order (highest first)
  const targetOrder = [
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

  // In Discord, role position 1 is above @everyone (0), and higher position is higher in sidebar.
  // So we reverse the order so lowest has lowest position and highest has highest position!
  const reversed = [...targetOrder].reverse();
  const rolePositions = [];

  for (let i = 0; i < reversed.length; i++) {
    const name = reversed[i];
    const role = guild.roles.cache.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (role) {
      rolePositions.push({ role, position: i + 1 });
    }
  }

  try {
    await guild.roles.setPositions(rolePositions);
    console.log('Role positions sorted successfully!');
  } catch (err) {
    console.error('Failed to sort role positions:', err.message);
  }

  await destroyDiscordClient();
}

sortRoles().catch(console.error);
