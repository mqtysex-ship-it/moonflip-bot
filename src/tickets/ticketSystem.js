import {
  ChannelType,
  PermissionFlagsBits,
  OverwriteType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  MessageFlags,
} from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getTicketBannerGif } from '../games/animator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');

// Ensure data folder and tickets.json exist
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TICKETS_FILE)) {
    fs.writeFileSync(
      TICKETS_FILE,
      JSON.stringify({ counter: 0, activeTickets: {} }, null, 2),
      'utf-8'
    );
  }
}

export function loadDepartments() {
  ensureStorage();
  try {
    if (fs.existsSync(DEPARTMENTS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DEPARTMENTS_FILE, 'utf-8'));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch {}
  return [
    {
      id: 'redemption',
      prefix: 'redemption',
      title: 'Prize Redemption & KYC',
      color: '#2ecc71',
      emoji: '🎁',
      buttonStyle: 'Success',
      instructions: 'Please state your requested prize (Crypto: USDT/LTC/BTC or Digital Gift Card), wallet address or email, and confirmation that you are 18+.',
    },
    {
      id: 'wallet',
      prefix: 'wallet',
      title: 'Tokens & Wallet Inquiries',
      color: '#3498db',
      emoji: '💳',
      buttonStyle: 'Primary',
      instructions: 'Please describe your token question, deposit issue, or wallet discrepancy. Include receipt IDs or screenshots if applicable.',
    },
    {
      id: 'bug',
      prefix: 'bug',
      title: 'Bug & Glitch Reports',
      color: '#e67e22',
      emoji: '🐛',
      buttonStyle: 'Secondary',
      instructions: 'Describe the bug encountered, affected game or command (Mines, Crash, etc.), steps to reproduce, and attach screenshots.',
    },
    {
      id: 'general',
      prefix: 'support',
      title: 'General Support & Staff Help',
      color: '#9b59b6',
      emoji: '🛡️',
      buttonStyle: 'Secondary',
      instructions: 'Please explain how our staff can assist you today. If reporting another user, provide their username and evidence.',
    },
  ];
}

export function saveDepartments(departments) {
  ensureStorage();
  fs.writeFileSync(DEPARTMENTS_FILE, JSON.stringify(departments, null, 2), 'utf-8');
}

function loadData() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(TICKETS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { counter: 0, activeTickets: {} };
  }
}

function saveData(data) {
  ensureStorage();
  fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Checks if member is staff based on permissions and role keywords.
 */
export function isStaffMember(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const staffKeywords = ['owner', 'manager', 'admin', 'moderator', 'mod'];
  return member.roles.cache.some((r) =>
    staffKeywords.some((kw) => r.name.toLowerCase().includes(kw))
  );
}

/**
 * Ticket category definitions with custom messaging and styling
 */
export const TICKET_TYPES = {
  redemption: {
    id: 'ticket_open_redemption',
    prefix: 'redemption',
    title: 'Prize Redemption & KYC',
    color: 0x2ecc71,
    emoji: '🎁',
    instructions:
      'Please state your **requested prize** (Crypto: USDT/LTC/BTC or Digital Gift Card), your **wallet address or email**, and confirm that you are **18 years of age or older**.',
  },
  wallet: {
    id: 'ticket_open_wallet',
    prefix: 'wallet',
    title: 'Tokens & Wallet Inquiries',
    color: 0x3498db,
    emoji: '💳',
    instructions:
      'Please explain your token inquiry, missing test credit deposit, or balance question. If referencing a transaction, include your receipt ID or screenshot.',
  },
  bug: {
    id: 'ticket_open_bug',
    prefix: 'bug',
    title: 'Bug & Glitch Reports',
    color: 0xe67e22,
    emoji: '🐛',
    instructions:
      'Please describe the bug encountered, which game or command was affected (Crash, Mines, Keno, etc.), steps to reproduce it, and attach any relevant screenshots.',
  },
  general: {
    id: 'ticket_open_general',
    prefix: 'support',
    title: 'General Support & Assistance',
    color: 0x9b59b6,
    emoji: '🛡️',
    instructions:
      'Please detail how the staff team can assist you today. If reporting another member, please provide their username and evidence.',
  },
};

/**
 * Creates or updates the official Support Category and Ticket Creation Panel
 */
export async function setupTicketPanel(guild) {
  await Promise.all([
    guild.channels.fetch().catch(() => {}),
    guild.roles.fetch().catch(() => {}),
  ]);

  console.log(`Setting up Ticket System on guild: ${guild.name}`);
  const everyoneId = guild.roles.everyone?.id || guild.id;

  // 1. Locate or create Category: ─── 🎫 sᴜᴘᴘᴏʀᴛ ───
  let supportCat = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildCategory &&
      (c.name.includes('🎫') ||
        c.name.toLowerCase().includes('support') ||
        c.name.includes('sᴜᴘᴘᴏʀᴛ'))
  );

  if (!supportCat) {
    supportCat = await guild.channels.create({
      name: '─── 🎫 sᴜᴘᴘᴏʀᴛ ───',
      type: ChannelType.GuildCategory,
      position: 1, // Directly below information
      permissionOverwrites: [
        {
          id: everyoneId,
          deny: [PermissionFlagsBits.ViewChannel],
        },
      ],
    });
    console.log(`Created category: ${supportCat.name}`);
  }

  // 2. Locate or create Panel Channel: 🎫┃create-ticket
  let panelCh = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && (c.name.includes('create-ticket') || c.name.includes('tickets'))
  );

  if (!panelCh) {
    panelCh = await guild.channels.create({
      name: '🎫┃create-ticket',
      type: ChannelType.GuildText,
      parent: supportCat.id,
      position: 0,
      topic: 'Official 24/7 Moonflip Support & Prize Redemption Gateway',
      permissionOverwrites: [
        {
          id: everyoneId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.ReadMessageHistory,
          ],
          deny: [
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.CreatePublicThreads,
            PermissionFlagsBits.CreatePrivateThreads,
            PermissionFlagsBits.AddReactions,
          ],
        },
      ],
    });
    console.log(`Created panel channel: ${panelCh.name}`);
  } else {
    // Ensure parent category & overwrites are correct
    if (panelCh.parentId !== supportCat.id) {
      await panelCh.setParent(supportCat.id).catch(() => {});
    }
    await panelCh.permissionOverwrites.set([
      {
        id: everyoneId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
        ],
        deny: [
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.AddReactions,
        ],
      },
    ]);
  }

  // 3. Clear existing messages in panel channel and post fresh aesthetic panel
  const oldMsgs = await panelCh.messages.fetch({ limit: 10 }).catch(() => []);
  for (const [, m] of oldMsgs) {
    await m.delete().catch(() => {});
  }

  const departments = loadDepartments();

  let desc = `> Welcome to the official **Moonflip Support Portal**!\n` +
    `> Need assistance with your token wallet, have questions regarding gameplay, encountered a glitch, or wish to claim a promotional reward? Select a department below to open a private ticket.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `### 📂 SELECT YOUR TICKET DEPARTMENT:\n\n`;

  for (const d of departments) {
    desc += `${d.emoji} **${d.title}**\n✦ ${d.instructions}\n\n`;
  }
  desc += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `⏱️ *Tickets are private between you and the Staff Team. Response times are usually within minutes.*`;

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f) // Gold theme
    .setTitle('🎫  MOONFLIP SUPPORT & PRIZE REDEMPTION GATEWAY')
    .setDescription(desc)
    .setFooter({
      text: 'Moonflip Support Desk • 24/7 Monitored • Provably Fair Operations',
      iconURL: guild.iconURL() || undefined,
    })
    .setTimestamp();

  // Dynamically pack buttons into ActionRows (max 5 per row)
  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = 0; i < departments.length; i++) {
    const dept = departments[i];
    let style = ButtonStyle.Secondary;
    if (dept.buttonStyle === 'Success') style = ButtonStyle.Success;
    else if (dept.buttonStyle === 'Primary') style = ButtonStyle.Primary;
    else if (dept.buttonStyle === 'Danger') style = ButtonStyle.Danger;

    const btn = new ButtonBuilder()
      .setCustomId(`ticket_open_${dept.id}`)
      .setLabel(dept.title.length > 80 ? dept.title.slice(0, 77) + '...' : dept.title)
      .setStyle(style);

    if (dept.emoji) {
      btn.setEmoji(dept.emoji);
    }

    currentRow.addComponents(btn);

    if (currentRow.components.length === 5 || i === departments.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }

  const ticketGif = new AttachmentBuilder(getTicketBannerGif(), {
    name: 'moonflip_ticket_banner.gif',
  });

  await panelCh.send({ files: [ticketGif], embeds: [embed], components: rows });
  console.log(`Ticket panel successfully posted in #${panelCh.name}!`);

  return { supportCat, panelCh };
}

/**
 * Handles all ticket button interactions
 */
export async function handleTicketInteraction(interaction) {
  const { customId, guild, user, member } = interaction;

  try {
    // 1. Create Ticket Button Handlers
    if (customId.startsWith('ticket_open_')) {
      const typeKey = customId.replace('ticket_open_', '');
      const depts = loadDepartments();
      const ticketConfig = depts.find((d) => d.id === typeKey) || {
        id: typeKey,
        prefix: typeKey,
        title: 'Support Request',
        color: '#2ecc71',
        instructions: 'Please describe your inquiry in detail.',
      };

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // Ensure roles & channels are in cache
      if (!guild.roles.cache || guild.roles.cache.size <= 1) {
        await guild.roles.fetch().catch(() => {});
      }

      // Check if user already has an active open ticket in the server
      const data = loadData();
      const existing = Object.entries(data.activeTickets).find(
        ([, t]) => t.userId === user.id && t.status === 'open'
      );

      if (existing) {
        const [exChanId] = existing;
        const exChan = guild.channels.cache.get(exChanId);
        if (exChan) {
          return interaction.editReply({
            content: `⚠️ **Active Ticket Open**: You already have an open ticket in <#${exChanId}>. Please use your existing ticket or close it before opening a new one.`,
          });
        } else {
          // Channel was deleted manually, clean up record
          delete data.activeTickets[exChanId];
          saveData(data);
        }
      }

      // Locate Support Category
      const supportCat = guild.channels.cache.find(
        (c) =>
          c.type === ChannelType.GuildCategory &&
          (c.name.includes('🎫') ||
            c.name.toLowerCase().includes('support') ||
            c.name.includes('sᴜᴘᴘᴏʀᴛ'))
      );

      // Format new ticket number & channel name
      data.counter = (data.counter || 0) + 1;
      const ticketNum = String(data.counter).padStart(4, '0');
      const sanitizedName = user.username.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
      const channelName = `🎫┃${ticketConfig.prefix}-${sanitizedName}`;

      // Collect staff roles to allow in ticket
      const staffRoles = guild.roles.cache.filter((r) => {
        const n = r.name.toLowerCase();
        return ['owner', 'manager', 'admin', 'moderator', 'mod'].some((kw) => n.includes(kw));
      });

      const everyoneId = guild.roles.everyone?.id || guild.id;

      // Build permission overwrites
      const overwrites = [
        {
          id: everyoneId,
          type: OverwriteType.Role,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: user.id,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AddReactions,
          ],
        },
        {
          id: guild.client.user.id,
          type: OverwriteType.Member,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ];

      for (const [, sRole] of staffRoles) {
        overwrites.push({
          id: sRole.id,
          type: OverwriteType.Role,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
          ],
        });
      }

    // Create channel
    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: supportCat ? supportCat.id : null,
      topic: `ticket_user_${user.id} | id:#${ticketNum} | dept:${ticketConfig.prefix} | opened:${new Date().toISOString()}`,
      permissionOverwrites: overwrites,
    });

    // Save ticket state
    data.activeTickets[ticketChannel.id] = {
      id: ticketNum,
      userId: user.id,
      userName: user.tag || user.username,
      type: ticketConfig.prefix,
      title: ticketConfig.title,
      channelId: ticketChannel.id,
      openedAt: Date.now(),
      claimedBy: null,
      status: 'open',
    };
    saveData(data);

    // Build Ticket Welcome Embed
    const welcomeEmbed = new EmbedBuilder()
      .setColor(ticketConfig.color)
      .setTitle(`🎫  TICKET #${ticketNum} — ${ticketConfig.title.toUpperCase()}`)
      .setDescription(
        `> Welcome <@${user.id}>! A member of the **Moonflip Staff Team** has been notified of your request.\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `### 📋 TICKET GUIDELINES:\n` +
        `✦ **Inquiry**: ${ticketConfig.instructions}\n` +
        `✦ **Evidence / Details**: Attach wallet addresses, transaction IDs, or screenshots if applicable.\n` +
        `✦ **Availability**: Please be patient while a staff member reviews your ticket.\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
      )
      .addFields(
        { name: '👤 Member', value: `<@${user.id}>`, inline: true },
        { name: '📂 Department', value: `\`${ticketConfig.title}\``, inline: true },
        { name: '⚡ Status', value: '`🟢 Awaiting Staff`', inline: true }
      )
      .setFooter({ text: 'Moonflip Staff Portal • Use buttons below to manage this ticket' })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_action_close')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_action_claim')
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🙋‍♂️'),
      new ButtonBuilder()
        .setCustomId('ticket_action_transcript')
        .setLabel('Transcript')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📜')
    );

    const initialMsg = await ticketChannel.send({
      content: `<@${user.id}> Welcome to your private support room!`,
      embeds: [welcomeEmbed],
      components: [actionRow],
    });

    // Store message ID to update status later
    data.activeTickets[ticketChannel.id].messageId = initialMsg.id;
    saveData(data);

    // Notify Staff HQ (#🎁┃redemption-review for redemptions, #🔨┃mod-operations for general/wallet/bug)
    try {
      const targetStaffChName =
        ticketConfig.prefix === 'redemption' ? 'redemption-review' : 'mod-operations';
      const staffAlertCh = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name.includes(targetStaffChName)
      );
      if (staffAlertCh) {
        const alertEmbed = new EmbedBuilder()
          .setColor(ticketConfig.color || 0xf1c40f)
          .setTitle(`🔔  NEW TICKET OPENED — #${ticketNum}`)
          .setDescription(
            `> A new **${ticketConfig.title}** ticket requires staff attention.\n\n` +
            `✦ **Member**: <@${user.id}> (\`${user.tag || user.username}\`)\n` +
            `✦ **Channel**: <#${ticketChannel.id}>\n` +
            `✦ **Department**: \`${ticketConfig.title}\``
          )
          .setTimestamp();
        await staffAlertCh.send({ embeds: [alertEmbed] }).catch(() => {});
      }
    } catch {
      // Ignore notification error
    }

    return interaction.editReply({
      content: `✅ **Ticket Opened!** Your private support room has been created: <#${ticketChannel.id}>`,
    });
  }

  // 2. Claim Ticket Action
  if (customId === 'ticket_action_claim') {
    if (!isStaffMember(member)) {
      return interaction.reply({
        content: '⛔ **Access Denied**: Only server staff and moderators can claim support tickets.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const data = loadData();
    const ticket = data.activeTickets[interaction.channelId];

    if (!ticket) {
      return interaction.reply({
        content: '⚠️ This channel is not registered as an active ticket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    if (ticket.claimedBy) {
      return interaction.reply({
        content: `⚠️ This ticket has already been claimed by <@${ticket.claimedBy}>.`,
        flags: MessageFlags.Ephemeral,
      });
    }

    ticket.claimedBy = user.id;
    ticket.status = 'in_progress';
    saveData(data);

    // Update welcome message embed if found
    if (ticket.messageId) {
      try {
        const msg = await interaction.channel.messages.fetch(ticket.messageId);
        if (msg && msg.embeds.length > 0) {
          const oldEmbed = msg.embeds[0];
          const updatedEmbed = EmbedBuilder.from(oldEmbed)
            .spliceFields(2, 1, {
              name: '⚡ Status',
              value: `\`🟡 Claimed by @${user.username}\``,
              inline: true,
            });

          const updatedRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_action_close')
              .setLabel('Close Ticket')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🔒'),
            new ButtonBuilder()
              .setCustomId('ticket_action_claimed_disabled')
              .setLabel(`Claimed by ${user.username}`)
              .setStyle(ButtonStyle.Success)
              .setEmoji('✅')
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId('ticket_action_transcript')
              .setLabel('Transcript')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('📜')
          );

          await msg.edit({ embeds: [updatedEmbed], components: [updatedRow] });
        }
      } catch (err) {
        console.error('Failed to update claim embed:', err.message);
      }
    }

    await interaction.channel.send({
      content: `🙋‍♂️ **Ticket Claimed**: <@${user.id}> has claimed this ticket and will be handling this inquiry.`,
    });

    return interaction.reply({
      content: '✅ You have claimed this ticket!',
      flags: MessageFlags.Ephemeral,
    });
  }

  // 3. Close Ticket Prompt
  if (customId === 'ticket_action_close') {
    const data = loadData();
    const ticket = data.activeTickets[interaction.channelId];

    // Allowed to close: ticket creator or staff
    const isOwner = ticket && ticket.userId === user.id;
    const isStaff = isStaffMember(member);

    if (!isOwner && !isStaff) {
      return interaction.reply({
        content: '⛔ You do not have permission to close this ticket.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const confirmRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_confirm_close')
        .setLabel('Confirm Close & Delete')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_cancel_close')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('❌')
    );

    return interaction.reply({
      content: '⚠️ **Are you sure you want to close this ticket?**\nA transcript will be compiled and this channel will be permanently removed in 5 seconds after confirmation.',
      components: [confirmRow],
    });
  }

  // 4. Cancel Close
  if (customId === 'ticket_cancel_close') {
    await interaction.message.delete().catch(() => {});
    return interaction.reply({
      content: '✅ Ticket close cancelled.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // 5. Confirm Close Action
  if (customId === 'ticket_confirm_close') {
    const data = loadData();
    const ticket = data.activeTickets[interaction.channelId];

    await interaction.reply({
      content: '🔒 **Ticket closing...** Generating final transcript and removing channel in **5 seconds**.',
    });

    // Generate transcript
    const transcriptAttachment = await generateTranscriptFile(interaction.channel, ticket);

    // Try sending transcript to ticket creator DM
    if (ticket && ticket.userId) {
      try {
        const ticketCreator = await guild.client.users.fetch(ticket.userId);
        if (ticketCreator) {
          const dmEmbed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`📜 Ticket Transcript — #${ticket.id || 'Support'}`)
            .setDescription(
              `> Your ticket on **${guild.name}** was closed by <@${user.id}>.\n` +
              `> Attached below is the complete record of messages sent in your ticket for your records.`
            )
            .setFooter({ text: 'Moonflip Support Archive' })
            .setTimestamp();

          await ticketCreator.send({
            embeds: [dmEmbed],
            files: transcriptAttachment ? [transcriptAttachment] : [],
          });
        }
      } catch {
        // User may have DMs disabled, ignore silently
      }
    }

    // Also archive transcript to Staff HQ (#🎁┃redemption-review or #🔨┃mod-operations)
    try {
      const logChKeyword =
        ticket?.type === 'redemption' ? 'redemption-review' : 'mod-operations';
      const staffLogCh = guild.channels.cache.find(
        (c) => c.type === ChannelType.GuildText && c.name.includes(logChKeyword)
      );
      if (staffLogCh) {
        const logEmbed = new EmbedBuilder()
          .setColor(0x95a5a6)
          .setTitle(`🔒  TICKET ARCHIVED — #${ticket?.id || 'Support'}`)
          .addFields(
            { name: '👤 Member', value: ticket?.userId ? `<@${ticket.userId}>` : 'Unknown', inline: true },
            { name: '📂 Department', value: `\`${ticket?.title || 'Support'}\``, inline: true },
            { name: '🙋‍♂️ Claimed By', value: ticket?.claimedBy ? `<@${ticket.claimedBy}>` : '`Unclaimed`', inline: true },
            { name: '🔒 Closed By', value: `<@${user.id}>`, inline: true }
          )
          .setFooter({ text: 'Moonflip Staff HQ Archive' })
          .setTimestamp();

        const staffAttachment = await generateTranscriptFile(interaction.channel, ticket);
        await staffLogCh
          .send({
            embeds: [logEmbed],
            files: staffAttachment ? [staffAttachment] : [],
          })
          .catch(() => {});
      }
    } catch {
      // Ignore archive error
    }

    // Clean from active data
    if (ticket) {
      delete data.activeTickets[interaction.channelId];
      saveData(data);
    }

    // Delete channel after 5 seconds
    setTimeout(async () => {
      try {
        await interaction.channel.delete(`Ticket closed by ${user.tag}`);
      } catch (err) {
        console.error('Failed to delete ticket channel:', err.message);
      }
    }, 5000);

    return;
  }

  // 6. Generate Transcript on Demand
  if (customId === 'ticket_action_transcript') {
    await interaction.deferReply();

    const data = loadData();
    const ticket = data.activeTickets[interaction.channelId];
    const transcriptAttachment = await generateTranscriptFile(interaction.channel, ticket);

    if (!transcriptAttachment) {
      return interaction.editReply({ content: '⚠️ Failed to generate transcript.' });
    }

    return interaction.editReply({
      content: '📄 **Ticket Transcript Generated**:',
      files: [transcriptAttachment],
    });
  }
  } catch (err) {
    if (err.code === 10062) return; // Interaction expired / unknown, safe to ignore
    console.error('[Ticket Interaction Error]', err.message);
    const replyFn = interaction.replied || interaction.deferred ? 'editReply' : 'reply';
    return interaction[replyFn]({
      content: `⚠️ Failed to process ticket action: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

/**
 * Compiles channel messages into a clean text file attachment
 */
async function generateTranscriptFile(channel, ticketInfo) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    let text = `======================================================================\n`;
    text += `                   MOONFLIP SUPPORT TICKET TRANSCRIPT                 \n`;
    text += `======================================================================\n`;
    text += `Channel: #${channel.name} (${channel.id})\n`;
    text += `Ticket ID: #${ticketInfo?.id || 'N/A'}\n`;
    text += `Department: ${ticketInfo?.title || 'General Support'}\n`;
    text += `User: ${ticketInfo?.userName || 'N/A'} (${ticketInfo?.userId || 'N/A'})\n`;
    text += `Claimed By: ${ticketInfo?.claimedBy ? `<@${ticketInfo.claimedBy}>` : 'Unclaimed'}\n`;
    text += `Generated At: ${new Date().toISOString()}\n`;
    text += `======================================================================\n\n`;

    for (const msg of sorted) {
      const time = new Date(msg.createdTimestamp).toLocaleString();
      const author = msg.author.tag || msg.author.username;
      text += `[${time}] ${author} (${msg.author.id}):\n`;
      if (msg.content) text += `  ${msg.content}\n`;
      if (msg.attachments.size > 0) {
        text += `  [Attachments: ${[...msg.attachments.values()].map((a) => a.url).join(', ')}]\n`;
      }
      if (msg.embeds.length > 0) {
        text += `  [Embed: ${msg.embeds.map((e) => e.title || e.description || 'Rich Embed').join(' | ')}]\n`;
      }
      text += `\n`;
    }

    text += `======================= END OF TRANSCRIPT ===========================\n`;

    const buffer = Buffer.from(text, 'utf-8');
    return new AttachmentBuilder(buffer, {
      name: `transcript-${channel.name}.txt`,
    });
  } catch (err) {
    console.error('Transcript generation error:', err.message);
    return null;
  }
}
