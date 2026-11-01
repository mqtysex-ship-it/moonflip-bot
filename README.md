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
        "C:\\Users\\denis\\Desktop\\Bot\\src\\index.js"
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
