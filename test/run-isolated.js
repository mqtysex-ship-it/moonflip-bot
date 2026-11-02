import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'moonflip-tests-'));
const tests = [
  'test-document-store.js',
  'test-isolated-database-env.js', 'test-economy-no-database-fallback.js', 'test-persistent-mines.js', 'test-postgres-pool.js', 'test-postgres-economy.js', 'test-migration-snapshot.js', 'test-migration-import.js', 'test-mcp-isolation.js', 'test-dashboard-auth.js', 'test-discord-admin.js', 'test-crash-autocashout.js',
  'test-dashboard-balance.js', 'test-dashboard-database-adjust.js', 'test-level-balance-sync.js', 'test-mines-invalid-tile.js',
  'test-rng-integrity.js', 'test-session-security.js', 'test-data-directory.js', 'test-web-arena.js',
  'test-crash-engine.js', 'test-mines-leaderboard.js',
  'test-blackjack-persistence.js', 'test-crash-persistence.js',
];
try {
  fs.cpSync(path.join(project, 'src'), path.join(sandbox, 'src'), { recursive: true });
  fs.cpSync(path.join(project, 'test'), path.join(sandbox, 'test'), { recursive: true });
  fs.cpSync(path.join(project, 'supabase'), path.join(sandbox, 'supabase'), { recursive: true });
  fs.copyFileSync(path.join(project, 'package.json'), path.join(sandbox, 'package.json'));
  fs.symlinkSync(path.join(project, 'node_modules'), path.join(sandbox, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const env = { ...process.env, MOONFLIP_ISOLATED_TEST: '1' };
  delete env.DISCORD_BOT_TOKEN;
  delete env.DISCORD_TOKEN;
  delete env.WEB_SESSION_SECRET;
  delete env.MOONFLIP_DATA_DIR;
  delete env.DATABASE_URL;
  for (const test of tests) {
    const result = spawnSync(process.execPath, [path.join(sandbox, 'test', test)], { cwd: sandbox, env, stdio: 'inherit' });
    if (result.status !== 0) throw new Error(`${test} failed (${result.status ?? result.error?.message})`);
  }
  console.log('All isolated tests passed.');
} finally {
  const tempRoot = fs.realpathSync(os.tmpdir());
  const resolved = fs.realpathSync(sandbox);
  if (path.dirname(resolved) !== tempRoot || !path.basename(resolved).startsWith('moonflip-tests-')) {
    throw new Error(`Refusing to remove unexpected test directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}
