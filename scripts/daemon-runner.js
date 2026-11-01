import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexPath = path.resolve(__dirname, '../src/index.js');

function startProcess() {
  console.log('[Daemon Runner] Launching Discord Bot process...');
  const child = spawn(process.execPath, [indexPath], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
  });

  child.on('exit', (code, signal) => {
    console.warn(`[Daemon Runner] Process exited (code: ${code}, signal: ${signal}). Auto-restarting in 2 seconds...`);
    setTimeout(startProcess, 2000);
  });

  child.on('error', (err) => {
    console.error('[Daemon Runner] Process error:', err);
    setTimeout(startProcess, 2000);
  });
}

startProcess();
