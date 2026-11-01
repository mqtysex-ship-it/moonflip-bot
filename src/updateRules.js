import { fetchGuild, destroyDiscordClient } from './discord.js';
import { buildRulesChannelPayload } from './rulesSystem.js';

async function updateRules() {
  const guild = await fetchGuild('1566215806956601466');
  const rulesCh = guild.channels.cache.find((c) => c.name.includes('rules'));

  if (!rulesCh) {
    console.error('Rules channel not found!');
    return;
  }

  // Purge previous messages in rules channel
  const msgs = await rulesCh.messages.fetch({ limit: 10 });
  for (const [, m] of msgs) {
    await m.delete().catch(() => {});
  }

  const payload = buildRulesChannelPayload(guild);
  await rulesCh.send(payload);
  console.log('Interactive Rainbet/Clash.gg style rules & compliance embed deployed successfully!');

  await destroyDiscordClient();
  process.exit(0);
}

updateRules().catch(console.error);
