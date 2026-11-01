import { fetchGuild, destroyDiscordClient } from './discord.js';
import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getVerifyBannerGif } from './games/animator.js';

async function updateVerify() {
  const guild = await fetchGuild('1566215806956601466');
  const verifyCh = guild.channels.cache.find((c) => c.name.includes('verify'));
  const rulesCh = guild.channels.cache.find((c) => c.name.includes('rules'));

  if (!verifyCh) return;

  const msgs = await verifyCh.messages.fetch({ limit: 10 });
  for (const [, m] of msgs) {
    await m.delete().catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('⚡  VERIFICATION GATEWAY')
    .setDescription(
      `> Welcome to **${guild.name}**!\n` +
      `> To protect our community, prevent multi-accounting/bot fraud, and ensure a fair prize redemption environment, all members must verify their account.\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `### 📜 BEFORE VERIFYING:\n` +
      `1️⃣ Read and agree to our rules in <#${rulesCh?.id || ''}>\n` +
      `2️⃣ You must be **18+** to participate in crypto or gift card prize redemptions\n` +
      `3️⃣ Redemptions are subject to standard playthrough requirements and KYC verification\n` +
      `4️⃣ Click the **Verify Now & Accept Rules** button below to unlock all community channels!\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Need assistance? Open a ticket with staff.*`
    )
    .setFooter({
      text: 'Promotional Prize Program • 18+ Verification • Server Protection',
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  const verifyGif = new AttachmentBuilder(getVerifyBannerGif(), {
    name: 'moonflip_verify_banner.gif',
  });

  const btn = new ButtonBuilder()
    .setCustomId('verify_button')
    .setLabel('Verify Now & Unlock Moonflip')
    .setStyle(ButtonStyle.Success)
    .setEmoji('✅');

  const row = new ActionRowBuilder().addComponents(btn);

  await verifyCh.send({ files: [verifyGif], embeds: [embed], components: [row] });
  console.log('Verification embed updated successfully!');

  await destroyDiscordClient();
}

updateVerify().catch(console.error);
