import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
if (process.env.MOONFLIP_DB_INTEGRATION !== '1') throw new Error('Explicit integration-test opt-in required');
const { databasePool: pool, closeDatabase } = await import('../src/database.js');
const { PostgresEconomy } = await import('../src/games/postgresEconomy.js');
const { PostgresDocumentStore } = await import('../src/postgresDocumentStore.js');
const { createCrashPreferences } = await import('../src/games/crashPreferences.js');
const { createCoinflipPreferences } = await import('../src/games/coinflipPreferences.js');
const { createMinesPreferences } = await import('../src/games/minesPreferences.js');
const economy = new PostgresEconomy(pool);
const suffix = randomUUID();
const game = `recovery-test-${suffix}`;
const userId = () => '00' + BigInt('0x' + randomUUID().replaceAll('-', '').slice(0, 14)).toString().padStart(18, '0');
const users = [userId(), userId()];
const rounds = [randomUUID(), randomUUID()];
try {
  for (let i = 0; i < 2; i++) await economy.startRound(rounds[i], users[i], game, 100, {});
  const results = await Promise.all([
    economy.recoverInterruptedRounds(game, true, 0, [rounds[0]]),
    economy.recoverInterruptedRounds(game, true, 0, [rounds[0]]),
  ]);
  assert.equal(results.reduce((a, b) => a + b, 0), 1);
  const state = await pool.query('SELECT round_id, status FROM moonflip_private.game_rounds WHERE round_id = ANY($1::uuid[])', [rounds]);
  assert.equal(state.rows.find(r => r.round_id === rounds[0]).status, 'active');
  assert.equal(state.rows.find(r => r.round_id === rounds[1]).status, 'settled');
  await economy.settleRound(rounds[0], users[0], 150);
  await economy.settleRound(rounds[0], users[0], 150);
  const wallets = await pool.query('SELECT discord_user_id, balance FROM moonflip_private.wallets WHERE discord_user_id = ANY($1::text[])', [users]);
  assert.equal(Number(wallets.rows.find(r => r.discord_user_id === users[0]).balance), 1050);
  assert.equal(Number(wallets.rows.find(r => r.discord_user_id === users[1]).balance), 1000);
  const preferences = createCrashPreferences(new PostgresDocumentStore(pool));
  await preferences.save(users[0], { betAmount: 250, autoCashout: 2, streak: 1 });
  assert.deepEqual(await createCrashPreferences(new PostgresDocumentStore(pool)).load(users[0]), { betAmount: 250, autoCashout: 2, streak: 1 });

  const coinflipPrefs = createCoinflipPreferences(new PostgresDocumentStore(pool));
  await coinflipPrefs.save(users[0], 4);
  assert.equal(await createCoinflipPreferences(new PostgresDocumentStore(pool)).load(users[0]), 4);

  const minesPrefs = createMinesPreferences(new PostgresDocumentStore(pool));
  await minesPrefs.save(users[0], { bet: 250, bombs: 5 });
  assert.deepEqual(await createMinesPreferences(new PostgresDocumentStore(pool)).load(users[0]), { bet: 250, bombs: 5 });

  console.log('Concurrent recovery, settlement and multi-game preferences passed against PostgreSQL');
} finally {
  await new PostgresDocumentStore(pool).update('user_preferences', {}, doc => { delete doc[users[0]]; });
  await pool.query('DELETE FROM moonflip_private.game_rounds WHERE round_id = ANY($1::uuid[])', [rounds]);
  await pool.query('DELETE FROM moonflip_private.wallets WHERE discord_user_id = ANY($1::text[])', [users]);
  await closeDatabase();
}
