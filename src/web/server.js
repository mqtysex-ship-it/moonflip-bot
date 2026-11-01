import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { EmbedBuilder, PermissionFlagsBits, ActivityType } from 'discord.js';
import { getDiscordClient, fetchGuild } from '../discord.js';
import { getUser, addTokens, setBalance, getLeaderboard } from '../games/economy.js';
import { setupTicketPanel, loadDepartments, saveDepartments } from '../tickets/ticketSystem.js';
import { deployGamePanels } from '../games/panels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const DEPARTMENTS_FILE = path.join(DATA_DIR, 'departments.json');

// Memory buffer for live logs
const recentLogs = [];
const MAX_LOGS = 100;

function addLog(level, msg) {
  const line = {
    id: Date.now() + Math.random().toString(36).substr(2, 4),
    time: new Date().toLocaleTimeString(),
    level,
    message: typeof msg === 'string' ? msg : JSON.stringify(msg),
  };
  recentLogs.push(line);
  if (recentLogs.length > MAX_LOGS) recentLogs.shift();
}

// Intercept console.log and console.error safely to capture logs for the dashboard
const origLog = console.log;
const origError = console.error;
console.log = (...args) => {
  origLog(...args);
  addLog('info', args.join(' '));
};
console.error = (...args) => {
  origError(...args);
  addLog('error', args.join(' '));
};

const DEFAULT_GUILD_ID = '1566215806956601466';

export function createWebServer() {
  const app = express();

  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  // Helper to load ticket data
  function loadTicketsData() {
    try {
      if (fs.existsSync(TICKETS_FILE)) {
        return JSON.parse(fs.readFileSync(TICKETS_FILE, 'utf-8'));
      }
    } catch {}
    return { counter: 0, activeTickets: {} };
  }

  function saveTicketsData(data) {
    try {
      fs.writeFileSync(TICKETS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save tickets data:', err.message);
    }
  }

  // Helper to load economy data
  function loadEconomyData() {
    try {
      if (fs.existsSync(ECONOMY_FILE)) {
        return JSON.parse(fs.readFileSync(ECONOMY_FILE, 'utf-8'));
      }
    } catch {}
    return { users: {} };
  }

  // Helper to load settings data
  function loadSettingsData() {
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
      }
    } catch {}
    return {};
  }

  function saveSettingsData(data) {
    try {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save settings:', err.message);
    }
  }

  // 1. GET /api/status - Live bot & guild status
  app.get('/api/status', async (req, res) => {
    try {
      const client = await getDiscordClient().catch(() => null);
      if (!client || !client.isReady()) {
        return res.json({
          online: false,
          message: 'Discord client not connected',
        });
      }

      const guild = client.guilds.cache.get(DEFAULT_GUILD_ID) || client.guilds.cache.first();

      res.json({
        online: true,
        bot: {
          id: client.user.id,
          tag: client.user.tag,
          avatarUrl: client.user.displayAvatarURL(),
        },
        guild: guild
          ? {
              id: guild.id,
              name: guild.name,
              memberCount: guild.memberCount,
              iconUrl: guild.iconURL() || null,
              channelsCount: guild.channels.cache.size,
              rolesCount: guild.roles.cache.size,
            }
          : null,
        uptime: Math.floor(process.uptime()),
        ping: client.ws?.ping ?? 0,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. GET /api/stats - Aggregated metrics
  app.get('/api/stats', (req, res) => {
    try {
      const eco = loadEconomyData();
      const tickets = loadTicketsData();

      let totalTokens = 0;
      let totalWagered = 0;
      let totalGamesPlayed = 0;
      const userList = Object.values(eco.users || {});

      for (const u of userList) {
        totalTokens += u.balance || 0;
        totalWagered += u.totalBet || 0;
        totalGamesPlayed += u.gamesPlayed || 0;
      }

      res.json({
        economy: {
          totalTokens,
          totalWagered,
          totalGamesPlayed,
          totalUsers: userList.length,
        },
        tickets: {
          totalTickets: tickets.counter || 0,
          activeTicketsCount: Object.keys(tickets.activeTickets || {}).length,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. GET /api/economy/players - Leaderboard & players list
  app.get('/api/economy/players', (req, res) => {
    try {
      const eco = loadEconomyData();
      const players = Object.entries(eco.users || {}).map(([userId, data]) => ({
        userId,
        balance: data.balance || 0,
        totalBet: data.totalBet || 0,
        totalWon: data.totalWon || 0,
        gamesPlayed: data.gamesPlayed || 0,
        lastDaily: data.lastDaily || null,
        createdAt: data.createdAt || null,
      }));

      players.sort((a, b) => b.balance - a.balance);
      res.json({ players });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. POST /api/economy/adjust - Set, Add, or Deduct tokens
  app.post('/api/economy/adjust', async (req, res) => {
    try {
      const { userId, action, amount } = req.body;
      if (!userId || typeof amount !== 'number' || amount < 0) {
        return res.status(400).json({ error: 'Valid userId and positive amount are required.' });
      }

      let newBalance = 0;
      const current = getUser(userId);

      if (action === 'set') {
        newBalance = setBalance(userId, amount);
      } else if (action === 'add') {
        newBalance = addTokens(userId, amount);
      } else if (action === 'deduct') {
        const finalAmt = Math.max(0, current.balance - amount);
        newBalance = setBalance(userId, finalAmt);
      } else {
        return res.status(400).json({ error: 'Action must be "add", "deduct", or "set".' });
      }

      res.json({
        success: true,
        userId,
        previousBalance: current.balance,
        newBalance,
        action,
        amount,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. GET /api/tickets - Active tickets list
  app.get('/api/tickets', async (req, res) => {
    try {
      const data = loadTicketsData();
      const client = await getDiscordClient().catch(() => null);
      const guild = client?.guilds.cache.get(DEFAULT_GUILD_ID);

      const activeList = [];
      for (const [chanId, ticket] of Object.entries(data.activeTickets || {})) {
        const chan = guild?.channels.cache.get(chanId);
        activeList.push({
          ...ticket,
          channelExists: Boolean(chan),
          channelName: chan?.name || `ticket-${ticket.id}`,
        });
      }

      res.json({
        counter: data.counter || 0,
        activeTickets: activeList,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. POST /api/tickets/close - Close ticket channel directly from web app
  app.post('/api/tickets/close', async (req, res) => {
    try {
      const { channelId } = req.body;
      if (!channelId) {
        return res.status(400).json({ error: 'channelId is required' });
      }

      const client = await getDiscordClient();
      const guild = client.guilds.cache.get(DEFAULT_GUILD_ID);
      const channel = guild?.channels.cache.get(channelId);

      if (channel) {
        await channel.delete('Closed via Web Dashboard').catch(() => {});
      }

      const data = loadTicketsData();
      delete data.activeTickets[channelId];
      saveTicketsData(data);

      res.json({ success: true, message: `Ticket channel ${channelId} closed.` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. GET /api/roles - Roles list with security analysis
  app.get('/api/roles', async (req, res) => {
    try {
      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const roles = await guild.roles.fetch();

      const rolesList = roles.map((r) => {
        const p = r.permissions;
        const isAdmin = p.has(PermissionFlagsBits.Administrator);
        const canManageRoles = p.has(PermissionFlagsBits.ManageRoles);
        const canManageChannels = p.has(PermissionFlagsBits.ManageChannels);
        const canManageGuild = p.has(PermissionFlagsBits.ManageGuild);
        const canMentionEveryone = p.has(PermissionFlagsBits.MentionEveryone);
        const canModerate = p.has(PermissionFlagsBits.ModerateMembers) || p.has(PermissionFlagsBits.KickMembers);

        return {
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          hoist: r.hoist,
          managed: r.managed,
          memberCount: r.members.size,
          isAdmin,
          canManageRoles,
          canManageChannels,
          canManageGuild,
          canMentionEveryone,
          canModerate,
          isDangerous: isAdmin || canManageRoles || canManageChannels || canManageGuild || canMentionEveryone,
        };
      });

      rolesList.sort((a, b) => b.position - a.position);

      // Audit summary: flag any non-staff role with dangerous perms
      const staffKeywords = ['owner', 'manager', 'admin', 'moderator', 'mcp'];
      const vulnerableRoles = rolesList.filter(
        (r) =>
          !staffKeywords.some((kw) => r.name.toLowerCase().includes(kw)) &&
          (r.canManageRoles || r.canManageChannels || r.canManageGuild || r.canMentionEveryone || r.isAdmin)
      );

      res.json({
        roles: rolesList,
        audit: {
          isSecure: vulnerableRoles.length === 0,
          vulnerabilitiesCount: vulnerableRoles.length,
          vulnerableRoles: vulnerableRoles.map((r) => r.name),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. POST /api/roles/fix-permissions - Run role hardening
  app.post('/api/roles/fix-permissions', async (req, res) => {
    try {
      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const roles = await guild.roles.fetch();

      // Fix @everyone
      const everyoneRole = guild.roles.everyone;
      const safeEveryonePerms = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.UseExternalEmojis,
        PermissionFlagsBits.UseExternalStickers,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.UseVAD,
        PermissionFlagsBits.ChangeNickname,
        PermissionFlagsBits.UseApplicationCommands,
        PermissionFlagsBits.CreateInstantInvite,
        PermissionFlagsBits.SendVoiceMessages,
        PermissionFlagsBits.SendPolls,
      ];
      await everyoneRole.setPermissions(safeEveryonePerms, 'Security fix: Hardened from Web Dashboard');

      // Strip dangerous perms from non-staff roles
      const staffKeywords = ['owner', 'manager', 'admin', 'moderator', 'mcp'];
      for (const [, role] of roles) {
        if (role.id === everyoneRole.id || role.managed) continue;
        const isStaff = staffKeywords.some((kw) => role.name.toLowerCase().includes(kw));
        if (!isStaff) {
          const current = role.permissions;
          const hasDangerous =
            current.has(PermissionFlagsBits.Administrator) ||
            current.has(PermissionFlagsBits.ManageGuild) ||
            current.has(PermissionFlagsBits.ManageRoles) ||
            current.has(PermissionFlagsBits.ManageChannels) ||
            current.has(PermissionFlagsBits.MentionEveryone);

          if (hasDangerous) {
            const cleaned = current
              .remove(PermissionFlagsBits.Administrator)
              .remove(PermissionFlagsBits.ManageGuild)
              .remove(PermissionFlagsBits.ManageRoles)
              .remove(PermissionFlagsBits.ManageChannels)
              .remove(PermissionFlagsBits.MentionEveryone);
            await role.setPermissions(cleaned, 'Hardened via Dashboard Security Audit');
          }
        }
      }

      res.json({
        success: true,
        message: 'Server roles and permissions successfully hardened! All member roles secured.',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. GET /api/channels - List text channels grouped by category
  app.get('/api/channels', async (req, res) => {
    try {
      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const channels = await guild.channels.fetch();

      const textChannels = [];
      for (const [, ch] of channels) {
        if (!ch || (ch.type !== 0 && ch.type !== 5)) continue; // GuildText or GuildAnnouncement
        const parent = ch.parentId ? guild.channels.cache.get(ch.parentId) : null;
        textChannels.push({
          id: ch.id,
          name: ch.name,
          type: ch.type,
          categoryName: parent?.name || 'Uncategorized',
          position: ch.rawPosition ?? 0,
        });
      }

      textChannels.sort((a, b) => a.position - b.position);
      res.json({ channels: textChannels });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. POST /api/channels/send-announcement - Send custom embed/message
  app.post('/api/channels/send-announcement', async (req, res) => {
    try {
      const { channelId, title, description, colorHex = '#f1c40f', mention = 'none' } = req.body;
      if (!channelId || !title || !description) {
        return res.status(400).json({ error: 'channelId, title, and description are required.' });
      }

      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const channel = guild.channels.cache.get(channelId);
      if (!channel) {
        return res.status(404).json({ error: 'Channel not found in guild.' });
      }

      const colorInt = parseInt(colorHex.replace('#', ''), 16) || 0xf1c40f;

      const embed = new EmbedBuilder()
        .setColor(colorInt)
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: `${guild.name} Official Announcement`, iconURL: guild.iconURL() || undefined })
        .setTimestamp();

      let content = null;
      if (mention === 'everyone') content = '@everyone';
      if (mention === 'here') content = '@here';

      await channel.send({
        content: content || undefined,
        embeds: [embed],
      });

      res.json({
        success: true,
        message: `Announcement posted in #${channel.name}!`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. POST /api/deploy/tickets - One-click ticket panel setup
  app.post('/api/deploy/tickets', async (req, res) => {
    try {
      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const result = await setupTicketPanel(guild);
      res.json({
        success: true,
        message: `Ticket system deployed in #${result.panelCh.name}!`,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 12. POST /api/deploy/games - One-click casino games deployment
  app.post('/api/deploy/games', async (req, res) => {
    try {
      await deployGamePanels(DEFAULT_GUILD_ID);
      res.json({
        success: true,
        message: 'Casino game panels deployed to #mines, #keno, #slots, #coinflip, #blackjack!',
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 13. GET /api/settings - Load bot and server settings
  app.get('/api/settings', (req, res) => {
    try {
      const settings = loadSettingsData();
      res.json({ settings });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 14. POST /api/settings - Save settings & update bot presence
  app.post('/api/settings', async (req, res) => {
    try {
      const newSettings = req.body;
      saveSettingsData(newSettings);

      // If presence or activity is customized, apply directly to bot client
      const client = await getDiscordClient().catch(() => null);
      if (client?.isReady() && newSettings?.general) {
        const { botActivity, activityType = 'Custom', status = 'online' } = newSettings.general;
        const actMap = {
          Playing: ActivityType.Playing,
          Streaming: ActivityType.Streaming,
          Listening: ActivityType.Listening,
          Watching: ActivityType.Watching,
          Custom: ActivityType.Custom,
          Competing: ActivityType.Competing,
        };

        if (botActivity) {
          client.user.setPresence({
            activities: [
              {
                name: botActivity,
                type: actMap[activityType] ?? ActivityType.Custom,
              },
            ],
            status,
          });
        }
      }

      res.json({ success: true, message: 'Settings saved and applied successfully!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 15. GET /api/tickets/departments - Get configurable ticket departments
  app.get('/api/tickets/departments', (req, res) => {
    try {
      const departments = loadDepartments();
      res.json({ departments });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 16. POST /api/tickets/departments - Update ticket departments
  app.post('/api/tickets/departments', (req, res) => {
    try {
      const { departments } = req.body;
      if (!Array.isArray(departments) || departments.length === 0) {
        return res.status(400).json({ error: 'Departments array is required.' });
      }

      saveDepartments(departments);
      res.json({ success: true, message: 'Ticket departments saved!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 17. POST /api/roles/update - Edit role color, name, hoist, mentionable
  app.post('/api/roles/update', async (req, res) => {
    try {
      const { roleId, name, color, hoist, mentionable } = req.body;
      if (!roleId) return res.status(400).json({ error: 'roleId is required.' });

      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const role = guild.roles.cache.get(roleId);
      if (!role) return res.status(404).json({ error: 'Role not found.' });

      await role.edit({
        name: name || role.name,
        color: color || role.hexColor,
        hoist: typeof hoist === 'boolean' ? hoist : role.hoist,
        mentionable: typeof mentionable === 'boolean' ? mentionable : role.mentionable,
      });

      res.json({ success: true, message: `Role @${role.name} updated successfully!` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 18. GET /api/charts - Economy distribution & analytics
  app.get('/api/charts', (req, res) => {
    try {
      const eco = loadEconomyData();
      const users = Object.values(eco.users || {});

      // 1. Wealth brackets
      const brackets = {
        '0 - 1k': 0,
        '1k - 5k': 0,
        '5k - 20k': 0,
        '20k - 50k': 0,
        '50k+': 0,
      };

      for (const u of users) {
        const b = u.balance || 0;
        if (b < 1000) brackets['0 - 1k']++;
        else if (b < 5000) brackets['1k - 5k']++;
        else if (b < 20000) brackets['5k - 20k']++;
        else if (b < 50000) brackets['20k - 50k']++;
        else brackets['50k+']++;
      }

      // 2. Estimated game activity breakdown
      const totalGames = users.reduce((acc, u) => acc + (u.gamesPlayed || 0), 0);
      const gameEstimates = {
        Mines: Math.round(totalGames * 0.35),
        Crash: Math.round(totalGames * 0.25),
        Keno: Math.round(totalGames * 0.15),
        Slots: Math.round(totalGames * 0.12),
        Coinflip: Math.round(totalGames * 0.08),
        Blackjack: Math.round(totalGames * 0.05),
      };

      res.json({
        wealthDistribution: {
          labels: Object.keys(brackets),
          data: Object.values(brackets),
        },
        gamesBreakdown: {
          labels: Object.keys(gameEstimates),
          data: Object.values(gameEstimates),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 19. POST /api/channels/send-advanced-embed - Full featured embed dispatcher
  app.post('/api/channels/send-advanced-embed', async (req, res) => {
    try {
      const {
        channelId,
        authorName,
        authorIconUrl,
        title,
        titleUrl,
        description,
        colorHex = '#f1c40f',
        fields = [],
        thumbnailUrl,
        imageUrl,
        footerText,
        footerIconUrl,
        timestamp = true,
        mention = 'none',
      } = req.body;

      if (!channelId || (!title && !description)) {
        return res.status(400).json({ error: 'Channel ID and Title or Description are required.' });
      }

      const guild = await fetchGuild(DEFAULT_GUILD_ID);
      const channel = guild.channels.cache.get(channelId);
      if (!channel) return res.status(404).json({ error: 'Channel not found.' });

      const embed = new EmbedBuilder();
      const colorInt = parseInt(colorHex.replace('#', ''), 16) || 0xf1c40f;
      embed.setColor(colorInt);

      if (title) embed.setTitle(title);
      if (titleUrl) embed.setURL(titleUrl);
      if (description) embed.setDescription(description);

      if (authorName) {
        embed.setAuthor({
          name: authorName,
          iconURL: authorIconUrl || undefined,
        });
      }

      if (Array.isArray(fields) && fields.length > 0) {
        for (const f of fields) {
          if (f.name && f.value) {
            embed.addFields({
              name: String(f.name),
              value: String(f.value),
              inline: Boolean(f.inline),
            });
          }
        }
      }

      if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
      if (imageUrl) embed.setImage(imageUrl);

      if (footerText) {
        embed.setFooter({
          text: footerText,
          iconURL: footerIconUrl || undefined,
        });
      }

      if (timestamp) embed.setTimestamp();

      let content = null;
      if (mention === 'everyone') content = '@everyone';
      if (mention === 'here') content = '@here';

      await channel.send({
        content: content || undefined,
        embeds: [embed],
      });

      res.json({ success: true, message: `Embed successfully posted to #${channel.name}!` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 20. GET /api/logs - Live bot log stream
  app.get('/api/logs', (req, res) => {
    res.json({ logs: recentLogs.slice(-50) });
  });

  return app;
}

export function startWebServer(port = 3000) {
  const app = createWebServer();
  const server = app.listen(port, () => {
    console.log(`[Web Dashboard] 🚀 Server running at http://localhost:${port}`);
  });

  return server;
}

// Standalone runner
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const PORT = process.env.PORT || 3000;
  startWebServer(PORT);
}
