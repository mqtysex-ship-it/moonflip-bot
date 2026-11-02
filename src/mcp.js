// MCP administration is a separate process from the gameplay bot.
process.env.MOONFLIP_MCP_ONLY = '1';
const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
const { createDiscordMcpServer } = await import('./server.js');
const server = createDiscordMcpServer();
await server.connect(new StdioServerTransport());
