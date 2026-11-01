import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function syncRoles() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(process.env.DISCORD_BOT_TOKEN);

  const guild = await client.guilds.fetch('1566215806956601466');
  console.log(`Connected to guild: ${guild.name}`);

  const roles = await guild.roles.fetch();

  // Definition of the aesthetic role hierarchy inspired by the screenshot:
  // From bottom (pos 1) to top (pos 14)
  const roleSpecs = [
    { key: 'verified', name: '✅ Verified', color: '#2ecc71', hoist: true },
    { key: 'bronze', name: '🥉 Bronze Tier', color: '#cd7f32', hoist: true },
    { key: 'silver', name: '🥈 Silver Tier', color: '#c0c0c0', hoist: true },
    { key: 'gold', name: '🥇 Gold Tier', color: '#ffd700', hoist: true },
    { key: 'diamond', name: '💎 Diamond VIP', color: '#00ffff', hoist: true },
    { key: 'highroller', name: '👑 High Roller Elite', color: '#8a2be2', hoist: true },
    { key: 'trial_mod', name: '♾️ Trial Moderator', color: '#5865F2', hoist: true },
    { key: 'ext_mod', name: '♾️ External Moderator', color: '#e67e22', hoist: true },
    { key: 'head_mod', name: '♾️ Head Moderator', color: '#3498db', hoist: true },
    { key: 'influencer', name: '♾️ Influencer', color: '#9b59b6', hoist: true },
    { key: 'admin', name: '🛡️ Administrator', color: '#f1c40f', hoist: true },
    { key: 'head_admin', name: '♾️ Head Administrator', color: '#95a5a6', hoist: true },
    { key: 'manager', name: '👑 Server Manager', color: '#f5f6fa', hoist: true },
    { key: 'owner', name: '👑 Owner', color: '#e74c3c', hoist: true },
  ];

  // Map existing roles or create if missing
  const matchedRoles = [];

  for (const spec of roleSpecs) {
    let role = roles.find((r) => {
      const n = r.name.toLowerCase();
      if (spec.key === 'verified') return n.includes('verified');
      if (spec.key === 'bronze') return n.includes('bronze');
      if (spec.key === 'silver') return n.includes('silver');
      if (spec.key === 'gold') return n.includes('gold');
      if (spec.key === 'diamond') return n.includes('diamond');
      if (spec.key === 'highroller') return n.includes('high roller');
      if (spec.key === 'trial_mod') return n.includes('trial');
      if (spec.key === 'ext_mod') return n.includes('external');
      if (spec.key === 'head_mod') return n.includes('head mod');
      if (spec.key === 'influencer') return n.includes('influencer');
      if (spec.key === 'admin') return n.includes('administrator') && !n.includes('head');
      if (spec.key === 'head_admin') return n.includes('head admin');
      if (spec.key === 'manager') return n.includes('manager');
      if (spec.key === 'owner') return n.includes('owner');
      return false;
    });

    if (!role) {
      console.log(`Creating missing role: ${spec.name}`);
      role = await guild.roles.create({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist,
        reason: 'Aesthetic role sync from hierarchy inspiration',
      });
    } else {
      console.log(`Updating role: ${role.name} -> ${spec.name}`);
      await role.edit({
        name: spec.name,
        color: spec.color,
        hoist: spec.hoist,
      });
    }

    matchedRoles.push({ role, spec });
  }

  // Also remove redundant old roles like plain "🔨┃Moderator" if it still exists
  const oldMod = roles.find((r) => r.name.includes('🔨') && r.name.toLowerCase().includes('moderator') && !r.name.includes('Head') && !r.name.includes('Trial'));
  if (oldMod) {
    console.log(`Deleting redundant role: ${oldMod.name}`);
    await oldMod.delete().catch(() => {});
  }

  // Position roles from bottom (1) to top (14)
  console.log('Reordering role positions...');
  for (let pos = 0; pos < matchedRoles.length; pos++) {
    const targetPos = pos + 1; // 1 to 14
    const r = matchedRoles[pos].role;
    try {
      await r.setPosition(targetPos);
      console.log(`Set ${r.name} to position ${targetPos}`);
    } catch (err) {
      console.error(`Failed to set pos for ${r.name}:`, err.message);
    }
  }

  // Ensure server owner has 👑 Owner and 👑 Server Manager
  const owner = await guild.members.fetch(guild.ownerId);
  const ownerRole = matchedRoles.find(m => m.spec.key === 'owner')?.role;
  const managerRole = matchedRoles.find(m => m.spec.key === 'manager')?.role;
  if (ownerRole) await owner.roles.add(ownerRole);
  if (managerRole) await owner.roles.add(managerRole);
  console.log(`Verified owner ${owner.user.tag} has owner and manager roles.`);

  console.log('Role sync completed successfully!');
  client.destroy();
}

syncRoles().catch(err => {
  console.error('Fatal role sync error:', err);
  process.exit(1);
});
