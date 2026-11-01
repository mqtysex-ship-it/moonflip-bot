import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Prevent accidental duplicate local Windows instance unless FORCE_LOCAL_BOT=true,
// while running normally on Render / Linux server environments!
if (process.platform === 'win32' && !process.env.RENDER && !process.env.FORCE_LOCAL_BOT) {
  console.log('[Daemon Runner] Local Windows daemon skipped: Moonflip runs server-side on Render.');
  process.exit(0);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../src/index.js');

let currentChild = null;

function killChild() {
  if (currentChild && !currentChild.killed) {
    try {
      currentChild.kill('SIGTERM');
    } catch {}
  }
}

process.on('SIGINT', () => {
  killChild();
  process.exit(0);
});
process.on('SIGTERM', () => {
  killChild();
  process.exit(0);
});
process.on('uncaughtException', (err) => {
  console.error('[Daemon Runner Uncaught Exception]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Daemon Runner Unhandled Rejection]', reason?.message || reason);
});

const heartbeat = setInterval(() => {}, 30000);
process.on('exit', () => clearInterval(heartbeat));

function startProcess() {
  console.log('[Daemon Runner] Launching Discord Bot process...');
  const child = spawn(process.execPath, [indexPath], {
    stdio: ['pipe', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..'),
  });
  currentChild = child;

  child.on('exit', (code, signal) => {
    console.warn(
      `[Daemon Runner] Process exited (code: ${code}, signal: ${signal}). Auto-restarting in 2 seconds...`
    );
    currentChild = null;
    setTimeout(startProcess, 2000);
  });

  child.on('error', (err) => {
    console.error('[Daemon Runner] Process error:', err.message);
    currentChild = null;
    setTimeout(startProcess, 2000);
  });
}

startProcess();
