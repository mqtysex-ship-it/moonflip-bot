import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDiscordMcpServer } from './server.js';
import { getDiscordClient, destroyDiscordClient } from './discord.js';
import { startWebServer } from './web/server.js';

// Global process error handlers to prevent unhandled rejections from terminating daemon
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection at Promise]', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err.message);
});

async function main() {
  const server = createDiscordMcpServer();
  const transport = new StdioServerTransport();
  let webServer = null;

  const cleanup = async () => {
    console.error('[Discord MCP] Shutting down...');
    try {
      if (webServer) webServer.close();
      await server.close();
      await destroyDiscordClient();
    } catch (e) {
      console.error('[Discord MCP Cleanup Error]', e.message);
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  console.error('[Discord MCP] Starting server with StdioServerTransport...');
  await server.connect(transport);
  console.error('[Discord MCP] Server running on stdio.');

  // Connect Discord Gateway in background to listen for button interactions
  getDiscordClient().catch((err) => {
    console.error('[Discord Gateway Init Error]', err.message);
  });

  // Launch Web Dashboard Control Center on port 3000
  const webPort = process.env.PORT || 3000;
  webServer = startWebServer(webPort);
}

main().catch((err) => {
  console.error('[Discord MCP Fatal Error]', err);
  process.exit(1);
});
