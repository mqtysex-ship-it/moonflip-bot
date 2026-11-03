# Discord MCP Server

A Model Context Protocol (MCP) server for Discord administration, channel management, role assignment, and automated server setup from natural-language prompts using Node.js, `discord.js`, and the official `@modelcontextprotocol/sdk`.

## ✨ Features

- **Full MCP Protocol Support**: Built using the official `@modelcontextprotocol/sdk` (Stdio transport).
- **Official Discord API**: Uses `discord.js` v14.
- **Natural-Language Server Automation**:
  - `discord_plan_server_setup`: Generates detailed channel, category, and role layouts from prompts or built-in templates (`software_dev`, `gaming`, `community`, `minimal`).
  - `discord_apply_server_setup`: Orchestrates multi-step creation with automated dependency resolution (roles → categories → channels → permissions).
- **Granular Server Management**:
  - `discord_list_servers`: Lists all guilds the bot belongs to.
  - `discord_get_server`: Inspects server channels, categories, roles, and member count.
  - `discord_create_category`: Creates channel categories with optional permission overwrites.
  - `discord_create_channel`: Creates text, voice, announcement, stage, or forum channels.
  - `discord_create_role`: Creates roles with custom colors, permissions, and hoist settings.
  - `discord_set_channel_permissions`: Configures channel or category permission overwrites for roles/members.
  - `discord_set_role_permissions`: Updates server-wide role permissions.
- **Safety First (Approval Gate)**: Every mutating action requires explicit confirmation (`confirmed: true`). If `confirmed` is `false`, the tool generates a dry-run proposal requiring user approval before modifying the Discord server.
- **Credential Protection**: Tokens are loaded from `.env` (gitignored) and are never logged, printed, or exposed in tool outputs.

---

## 🚀 Getting Started

The dashboard requires `DASHBOARD_PASSWORD` and uses the username `admin`.
Set a strong unique password in the deployment environment before starting the
server. The public `/play` arena does not require dashboard credentials.
Set `WEB_SESSION_SECRET` to a stable, private random value of at least 32 characters
on every deployment. Changing it invalidates existing web-play links. Issuing a
new `/play` link also revokes that player's previous link. Existing links created
before the session registry was introduced must be replaced using `/play`.

For Codex MCP integration, run `node src/mcp.js` rather than `src/index.js`.
The MCP entry point does not start a second dashboard or gameplay bot.

Set `DATABASE_URL` to the Supabase PostgreSQL connection string and apply the
project migrations before startup. Production refuses to start without it; a
database failure does not switch to JSON. Legacy files are for migration and
isolated tests only. `/health` returns 503 when the database is unavailable.
The Crash arena keeps live timing in one process; run a single application
instance until cross-instance ownership and recovery are implemented.

### 1. Bot Invite

If the bot has not been added to your server yet, invite it using the generated OAuth2 authorization link:

[Invite Bot with Admin Permissions](https://discord.com/oauth2/authorize?client_id=1566215352453562368&permissions=8&integration_type=0&scope=bot)

### 2. Configuration

Credentials are stored securely in `.env`:
```env
DISCORD_BOT_TOKEN=your_token_here
```

### 3. MCP Client Registration

Registered in `C:\Users\denis\.gemini\config\mcp_config.json`:
```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": [
        "C:\\Users\\denis\\Desktop\\Bot\\src\\mcp.js"
      ]
    }
  }
}
```

### 4. Running Tests

```bash
npm test
node test/test-stdio.js
```

---

## 🛠 Available MCP Tools

| Tool | Description | Mutating | Approval Required |
|---|---|:---:|:---:|
| `discord_list_servers` | List all servers the bot is in (with member count and invite link). | No | No |
| `discord_get_server` | Get categories, channels, roles, and permissions of a server. | No | No |
| `discord_create_category` | Create a new channel category. | Yes | **Yes** (`confirmed: true`) |
| `discord_create_channel` | Create a text, voice, announcement, stage, or forum channel. | Yes | **Yes** (`confirmed: true`) |
| `discord_create_role` | Create a role with color, hoist, and permissions. | Yes | **Yes** (`confirmed: true`) |
| `discord_set_channel_permissions` | Configure permission overrides for roles or members. | Yes | **Yes** (`confirmed: true`) |
| `discord_set_role_permissions` | Configure server-wide role permissions. | Yes | **Yes** (`confirmed: true`) |
| `discord_plan_server_setup` | Generate a dry-run server layout plan from prompt or template. | No | No |
| `discord_apply_server_setup` | Apply an approved server layout plan to Discord. | Yes | **Yes** (`confirmed: true`) |


### Web Coinflip and Plinko

Open `/play/?game=coinflip` or `/play/?game=plinko`, or choose either game from the lobby. Both require a Discord-linked wallet and `DATABASE_URL`. They share the existing wallet, update it through SSE after commit, and record rounds in `moonflip_private.game_rounds`; no additional migration is needed beyond the existing baseline. Recent rounds and public activity are read from PostgreSQL.

Coinflip uses independent 50/50 heads/tails with a 1.92× winning return (4% theoretical house edge). Plinko supports 8–16 rows and three risk levels; its payout profiles are normalized to at most 96% theoretical RTP (4% fixed house edge). Whole-token payout rounding can increase the effective edge at small stakes. Payout buckets show rounded labels; selecting a bucket shows its exact rate. The web coinflip uses these disclosed rules rather than the legacy Discord streak-adjusted RNG.

Each bet includes a stable UUID. The server commits its outcome, debit and payout in one transaction, and retries return the same result. Browser storage holds pending request metadata only. After a lost response or reload, use **Recover round** before placing another bet. Database failures do not fall back to JSON or demo balances.

Run `npm run test:isolated` for the isolated suite. For live PostgreSQL transaction checks, set `MOONFLIP_DB_INTEGRATION=1` and run `node test/test-persistent-instant-games.js`. That test creates random synthetic wallets and removes its fixtures afterward.


Plinko accepts up to 32 independent drops in flight. Each request has its own recovery ID and a 15-second network timeout; one stalled request does not hold up later drops. Destination highlights and round history/activity appear after the corresponding animation lands. Pending results stay hidden across reloads and other views until recovered.

Rewards has a dedicated daily-claim dialog. Its 500-token reward shares the existing PostgreSQL `/daily` cooldown with Discord, and retries cannot credit it twice. Generic UI click sounds are disabled; game sound settings remain available.


Plinko supports finite autobet series of 1–1,000 bets at 250/500/1,000 ms intervals between committed requests. Stop is enforced by the database; interrupted series require explicit Resume after reload. Run identity/history and indexed progress use private PostgreSQL documents and advance atomically with the settled round. Replayed Start requests never reopen stopped or completed runs. Mines remains manual only.

Appearance offers Obsidian, Midnight and Forest. Discord-linked accounts save their choice in the existing private documents table; database failures do not report a successful save. Guests may preview a theme for the current visit. The game switcher uses a local SVG symbol set with keyboard navigation and responsive scrolling. Plinko's collapsed Rules panel describes its fixed 4% edge and whole-token payout rounding.
