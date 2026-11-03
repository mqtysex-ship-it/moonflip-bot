import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createDiscordMcpServer } from './server.js';
import { getDiscordClient, destroyDiscordClient } from './discord.js';
import { startWebServer } from './web/server.js';
import { shutdownContinuousCrash } from './games/continuousCrash.js';
import { shutdownWebCrash } from './web/playApi.js';

// Global process error handlers to prevent unhandled rejections from terminating daemon
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection at Promise]', reason?.message || reason);
});

async function main() {
  const server = createDiscordMcpServer();
  const transport = new StdioServerTransport();
  let webServer = null;

  const cleanup = async () => {
    console.error('[Discord MCP] Shutting down...');
    try {
      await Promise.allSettled([
        shutdownContinuousCrash(),
        shutdownWebCrash(),
      ]);
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

  // 1. Launch Web Dashboard & Web Arena Control Center immediately so HTTP healthchecks pass at 0ms
  const webPort = process.env.PORT || 3000;
  webServer = startWebServer(webPort);

  // 2. Connect Discord Gateway in background to listen for button & slash command interactions
  getDiscordClient().catch((err) => {
    console.error('[Discord Gateway Init Error]', err.message);
  });

  // 3. Connect MCP Stdio transport in non-blocking mode for local CLI / agent integration
  console.error('[Discord MCP] Starting server with StdioServerTransport...');
  server.connect(transport).then(() => {
    console.error('[Discord MCP] Server running on stdio.');
  }).catch((err) => {
    console.error('[Discord MCP Stdio Note]', err.message);
  });
}

main().catch((err) => {
  console.error('[Discord MCP Fatal Error]', err);
  process.exit(1);
});
