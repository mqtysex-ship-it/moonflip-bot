import { fetchGuild, destroyDiscordClient } from '../src/discord.js';
import { setupTicketPanel } from '../src/tickets/ticketSystem.js';

async function deployTickets() {
  const guild = await fetchGuild('1566215806956601466');
  console.log(`Connected to guild: ${guild.name} (${guild.id})`);

  const res = await setupTicketPanel(guild);
  console.log('Ticket System successfully initialized!');
  console.log(`Category: ${res.supportCat.name}`);
  console.log(`Panel Channel: #${res.panelCh.name}`);

  await destroyDiscordClient();
  process.exit(0);
}

deployTickets().catch((err) => {
  console.error('Ticket deployment failed:', err);
  process.exit(1);
});
