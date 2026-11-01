import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverScript = path.resolve(__dirname, '../src/index.js');

const child = spawn('node', [serverScript], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let stdout = '';
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString();
  if (stdout.includes('"jsonrpc"')) {
    console.error('[SUCCESS] Successfully received JSON-RPC response over stdio transport:');
    console.error(stdout.trim());
    child.kill();
    process.exit(0);
  }
});

child.on('error', (err) => {
  console.error('[ERROR] Child process error:', err);
  process.exit(1);
});

// Send standard MCP initialize message
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'stdio-test-client',
      version: '1.0.0',
    },
  },
};

child.stdin.write(JSON.stringify(initRequest) + '\n');

setTimeout(() => {
  console.error('[ERROR] Timeout waiting for stdio response');
  child.kill();
  process.exit(1);
}, 5000);
