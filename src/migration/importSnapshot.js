import { validateSnapshot } from './snapshot.js';

// Call only after all legacy writers are stopped and an independently saved,
// complete snapshot has been verified. Existing database rows are never merged.
export async function importSnapshot(pool, input) {
  const snapshot = validateSnapshot(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE moonflip_private.wallets IN ACCESS EXCLUSIVE MODE');
    const result = await client.query('SELECT count(*) AS count FROM moonflip_private.wallets');
    if (result.rows[0].count !== '0' && result.rows[0].count !== 0) throw new Error('Destination wallets table is not empty');
    for (const [id, user] of Object.entries(snapshot.users)) {
      const created = new Date(user.createdAt);
      const daily = user.lastDaily ? new Date(user.lastDaily) : null;
      if (!Number.isFinite(created.getTime()) || (daily && !Number.isFinite(daily.getTime()))) throw new Error(`Invalid timestamp for user ${id}`);
      await client.query(`INSERT INTO moonflip_private.wallets
        (discord_user_id, balance, total_bet, total_won, games_played, last_daily, xp, level, created_at, username, avatar_url)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [id, user.balance, user.totalBet, user.totalWon, user.gamesPlayed, daily, user.xp, user.level, created, user.username ?? null, user.avatarUrl ?? null]);
    }
    await client.query('COMMIT');
    return Object.keys(snapshot.users).length;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* keep original error */ }
    throw err;
  } finally {
    client.release();
  }
}
