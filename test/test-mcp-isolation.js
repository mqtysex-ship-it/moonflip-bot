import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
if (process.env.MOONFLIP_ISOLATED_TEST !== '1') throw new Error('Run this test only in an isolated project copy.');
const script = fileURLToPath(new URL('../src/mcp.js', import.meta.url));
const child = spawn(process.execPath, [script], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, DISCORD_BOT_TOKEN: '', DISCORD_TOKEN: '' } });
let output = '';
let errors = '';
child.stdout.on('data', (part) => { output += part; });
child.stderr.on('data', (part) => { errors += part; });
child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
  protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'isolation-test', version: '1' },
} }) + '\n');
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`MCP did not initialize: ${errors}`)), 4000);
    child.stdout.on('data', () => { if (output.includes('"id":1')) { clearTimeout(timer); resolve(); } });
    child.on('exit', (code) => { if (code !== null && code !== 0) { clearTimeout(timer); reject(new Error(`MCP exited: ${errors}`)); } });
  });
  assert.doesNotMatch(errors, /Web Dashboard|Logged in as/);
  console.log('MCP starts without the game bot or web server');
} finally { child.kill(); }
