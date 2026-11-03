// Database operations are deliberately asynchronous; callers must await the
// committed result before acknowledging a wager, transfer, or payout.
function amount(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`);
  return value;
}
function number(value, name) {
  const result = Number(value);
  return amount(result, name);
}
function identity(value, name) {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${name}`);
  return value;
}
export class PostgresEconomy {
  constructor(pool) {
    if (!pool || typeof pool.query !== 'function') throw new Error('Database pool required');
    this.pool = pool;
  }
  async playInstantRound(roundId, userId, game, wager, payout, state, documentUpdate = null) {
    identity(roundId, 'round'); identity(userId, 'user'); identity(game, 'game');
    amount(wager, 'wager', 1); amount(payout, 'payout');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('select * from moonflip_private.start_game_round($1::uuid,$2,$3,$4::bigint,$5::jsonb)', [roundId, userId, game, wager, JSON.stringify(state)]);
      const result = await client.query('select * from moonflip_private.settle_game_round($1::uuid,$2,$3::bigint)', [roundId, userId, payout]);
      let docResult = null;
      if (documentUpdate && typeof documentUpdate === 'object' && documentUpdate.key && typeof documentUpdate.updater === 'function') {
        const { key, fallback = {}, updater } = documentUpdate;
        await client.query(
          'INSERT INTO moonflip_private.documents (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING',
          [key, JSON.stringify(fallback)]
        );
        const loaded = await client.query('SELECT value FROM moonflip_private.documents WHERE key = $1 FOR UPDATE', [key]);
        const value = loaded.rows[0].value;
        docResult = await updater(value);
        await client.query(
          'UPDATE moonflip_private.documents SET value = $2::jsonb, updated_at = now() WHERE key = $1',
          [key, JSON.stringify(value)]
        );
      }
      await client.query('COMMIT');
      return { balance: number(result.rows[0].balance_after, 'balance'), applied: result.rows[0].applied, documentResult: docResult };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async changeBalance(operationId, userId, kind, value) {
    identity(operationId, 'operation'); identity(userId, 'user'); amount(value, 'amount');
    if (!['bet', 'win', 'credit'].includes(kind)) throw new Error('Invalid wallet operation');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('select * from moonflip_private.apply_wallet_delta($1::uuid,$2,$3,$4::bigint)',
        [operationId, userId, kind, kind === 'bet' ? -value : value]);
      const row = result.rows[0];
      if (row.applied && kind === 'bet') await client.query(
        'UPDATE moonflip_private.wallets SET total_bet = total_bet + $2, games_played = games_played + 1 WHERE discord_user_id = $1', [userId, value]);
      if (row.applied && kind === 'win') await client.query(
        'UPDATE moonflip_private.wallets SET total_won = total_won + $2 WHERE discord_user_id = $1', [userId, value]);
      await client.query('COMMIT');
      return { balance: number(row.balance_after, 'balance'), applied: row.applied };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  async getAllUsers() {
    const result = await this.pool.query('SELECT * FROM moonflip_private.wallets ORDER BY discord_user_id');
    return Object.fromEntries(result.rows.map(row => [row.discord_user_id, {
      balance: number(row.balance, 'balance'), totalBet: number(row.total_bet, 'total bet'), totalWon: number(row.total_won, 'total won'),
      gamesPlayed: number(row.games_played, 'games played'), lastDaily: row.last_daily ? new Date(row.last_daily).getTime() : 0,
      xp: number(row.xp, 'xp'), level: number(row.level, 'level'), createdAt: new Date(row.created_at).getTime(),
      username: row.username, avatarUrl: row.avatar_url,
    }]));
  }
  async getLeaderboard(limit = 10) {
    amount(limit, 'limit');
    const users = await this.getAllUsers();
    return Object.entries(users).map(([userId, data]) => ({ userId, ...data })).sort((a, b) => b.balance - a.balance).slice(0, limit);
  }
  async settleRound(roundId, userId, payout) {
    identity(roundId, 'round'); identity(userId, 'user'); amount(payout, 'payout');
    const result = await this.pool.query('select * from moonflip_private.settle_game_round($1::uuid,$2,$3::bigint)', [roundId, userId, payout]);
    const row = result.rows[0];
    return { balance: number(row.balance_after, 'balance'), applied: row.applied };
  }
  async getEconomyStats() {
    const result = await this.pool.query(`SELECT coalesce(sum(balance), 0) AS total_tokens,
      coalesce(sum(total_bet), 0) AS total_wagered, coalesce(sum(games_played), 0) AS total_games,
      count(*) AS total_users FROM moonflip_private.wallets`);
    const row = result.rows[0];
    return { totalTokens: number(row.total_tokens, 'total tokens'), totalWagered: number(row.total_wagered, 'total wagered'),
      totalGamesPlayed: number(row.total_games, 'total games'), totalUsers: number(row.total_users, 'total users') };
  }
  async getEconomyPlayers() {
    const result = await this.pool.query(`SELECT discord_user_id, balance, total_bet, total_won, games_played,
      last_daily, created_at, username, avatar_url FROM moonflip_private.wallets ORDER BY balance DESC, discord_user_id`);
    return result.rows.map(row => ({ userId: row.discord_user_id, balance: number(row.balance, 'balance'),
      totalBet: number(row.total_bet, 'total bet'), totalWon: number(row.total_won, 'total won'),
      gamesPlayed: number(row.games_played, 'games played'), lastDaily: row.last_daily ? new Date(row.last_daily).getTime() : null,
      createdAt: new Date(row.created_at).getTime(), username: row.username, avatarUrl: row.avatar_url }));
  }
  async getUser(userId) {
    identity(userId, 'user');
    const result = await this.pool.query(`INSERT INTO moonflip_private.wallets (discord_user_id) VALUES ($1)
      ON CONFLICT (discord_user_id) DO UPDATE SET discord_user_id = EXCLUDED.discord_user_id
      RETURNING discord_user_id, balance, total_bet, total_won, games_played, last_daily, xp, level, created_at, username, avatar_url`, [userId]);
    const row = result.rows[0];
    return { userId: row.discord_user_id, balance: number(row.balance, 'balance'), totalBet: number(row.total_bet, 'total bet'),
      totalWon: number(row.total_won, 'total won'), gamesPlayed: number(row.games_played, 'games played'),
      lastDaily: row.last_daily ? new Date(row.last_daily).getTime() : 0, xp: number(row.xp, 'xp'), level: number(row.level, 'level'),
      createdAt: new Date(row.created_at).getTime(), username: row.username, avatarUrl: row.avatar_url };
  }
  async setUserMeta(userId, username, avatarUrl) {
    identity(userId, 'user');
    if (username != null && typeof username !== 'string') throw new Error('Invalid username');
    if (avatarUrl != null && typeof avatarUrl !== 'string') throw new Error('Invalid avatar URL');
    await this.getUser(userId);
    await this.pool.query(`UPDATE moonflip_private.wallets SET username = COALESCE(NULLIF($2, ''), username),
      avatar_url = COALESCE(NULLIF($3, ''), avatar_url), updated_at = now() WHERE discord_user_id = $1`,
      [userId, username ?? null, avatarUrl ?? null]);
  }
  async startRound(roundId, userId, game, wager, state) {
    identity(roundId, 'round'); identity(userId, 'user'); identity(game, 'game'); amount(wager, 'wager', 1);
    const result = await this.pool.query('select * from moonflip_private.start_game_round($1::uuid,$2,$3,$4::bigint,$5::jsonb)',
      [roundId, userId, game, wager, JSON.stringify(state)]);
    const row = result.rows[0];
    return { balance: number(row.balance_after, 'balance'), applied: row.applied };
  }
  async advanceRound(operationId, roundId, userId, version, state, payout) {
    identity(operationId, 'operation'); identity(roundId, 'round'); identity(userId, 'user'); amount(version, 'version');
    if (payout !== null) amount(payout, 'payout');
    const result = await this.pool.query('select * from moonflip_private.advance_game_round($1::uuid,$2::uuid,$3,$4::bigint,$5::jsonb,$6::bigint)',
      [operationId, roundId, userId, version, JSON.stringify(state), payout]);
    const row = result.rows[0];
    return { version: number(row.version, 'version'), balance: number(row.balance_after, 'balance'), applied: row.applied };
  }
  async transfer(operationId, sender, receiver, value) {
    identity(operationId, 'operation'); identity(sender, 'sender'); identity(receiver, 'receiver');
    if (sender === receiver) throw new Error('Invalid transfer');
    amount(value, 'transfer amount', 1);
    const result = await this.pool.query('select * from moonflip_private.transfer_wallet_tokens($1::uuid,$2,$3,$4::bigint)',
      [operationId, sender, receiver, value]);
    const row = result.rows[0];
    return { senderBalance: number(row.sender_balance, 'balance'), receiverBalance: number(row.receiver_balance, 'balance'), applied: row.applied };
  }
  async claimDaily(operationId, userId) {
    identity(operationId, 'operation'); identity(userId, 'user');
    const result = await this.pool.query('select * from moonflip_private.claim_wallet_daily($1::uuid,$2)', [operationId, userId]);
    const row = result.rows[0];
    return { balance: number(row.balance_after, 'balance'), applied: row.applied, success: row.success, availableAt: row.available_at };
  }
  async getRakeback(userId) {
    identity(userId, 'user');
    const user = await this.getUser(userId);
    const totalWagered = user.totalBet || 0;
    const docRes = await this.pool.query(
      'SELECT value FROM moonflip_private.documents WHERE key = $1',
      [`rakeback/${userId}`]
    );
    const doc = docRes.rows[0]?.value || {};
    const claimedWager = Number(doc.claimedWager || 0);
    const lifetimeClaimed = Number(doc.lifetimeClaimed || 0);
    const unclaimedWager = Math.max(0, totalWagered - claimedWager);
    const rate = 0.005;
    const available = Math.floor(unclaimedWager * rate);
    return {
      rate,
      ratePercent: 0.5,
      totalWagered,
      claimedWager,
      unclaimedWager,
      available,
      lifetimeClaimed
    };
  }
  async claimRakeback(operationId, userId) {
    identity(operationId, 'operation');
    identity(userId, 'user');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const docKey = `rakeback/${userId}`;
      await client.query(
        'INSERT INTO moonflip_private.documents (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING',
        [docKey, JSON.stringify({ claimedWager: 0, lifetimeClaimed: 0, claims: {} })]
      );
      const docRes = await client.query(
        'SELECT value FROM moonflip_private.documents WHERE key = $1 FOR UPDATE',
        [docKey]
      );
      const doc = docRes.rows[0]?.value || { claimedWager: 0, lifetimeClaimed: 0, claims: {} };
      if (!doc.claims || typeof doc.claims !== 'object') doc.claims = {};

      if (doc.claims[operationId]) {
        const prior = doc.claims[operationId];
        await client.query('COMMIT');
        return {
          success: true,
          applied: false,
          amount: Number(prior.amount || 0),
          balance: Number(prior.balanceAfter || 0),
          lifetimeClaimed: Number(doc.lifetimeClaimed || 0)
        };
      }

      const walletRes = await client.query(
        'SELECT balance, total_bet FROM moonflip_private.wallets WHERE discord_user_id = $1 FOR UPDATE',
        [userId]
      );
      if (walletRes.rows.length === 0) {
        throw new Error('wallet not found');
      }

      const totalWagered = Number(walletRes.rows[0].total_bet || 0);
      const currentBalance = BigInt(walletRes.rows[0].balance);
      const claimedWager = Number(doc.claimedWager || 0);
      const unclaimedWager = Math.max(0, totalWagered - claimedWager);
      const rate = 0.005;
      const available = Math.floor(unclaimedWager * rate);

      if (available < 1) {
        await client.query('COMMIT');
        return {
          success: false,
          applied: false,
          amount: 0,
          balance: Number(currentBalance),
          reason: 'No rakeback available to claim',
          lifetimeClaimed: Number(doc.lifetimeClaimed || 0)
        };
      }

      const wagerConsumed = Math.floor(available / rate);
      const newClaimedWager = claimedWager + wagerConsumed;
      const newLifetimeClaimed = Number(doc.lifetimeClaimed || 0) + available;
      const newBalance = currentBalance + BigInt(available);

      doc.claimedWager = newClaimedWager;
      doc.lifetimeClaimed = newLifetimeClaimed;
      doc.claims[operationId] = {
        amount: available,
        balanceAfter: Number(newBalance),
        claimedAt: Date.now()
      };

      const claimKeys = Object.keys(doc.claims);
      if (claimKeys.length > 50) {
        delete doc.claims[claimKeys[0]];
      }

      await client.query(
        'UPDATE moonflip_private.wallets SET balance = balance + $2, updated_at = now() WHERE discord_user_id = $1',
        [userId, available]
      );

      await client.query(
        'UPDATE moonflip_private.documents SET value = $2::jsonb, updated_at = now() WHERE key = $1',
        [docKey, JSON.stringify(doc)]
      );

      await client.query('COMMIT');
      return {
        success: true,
        applied: true,
        amount: available,
        balance: Number(newBalance),
        lifetimeClaimed: newLifetimeClaimed
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async addXp(operationId, userId, value) {
    identity(operationId, 'operation'); identity(userId, 'user'); amount(value, 'xp');
    const result = await this.pool.query('select * from moonflip_private.add_wallet_xp($1::uuid,$2,$3::bigint)', [operationId, userId, value]);
    const row = result.rows[0];
    return { balance: number(row.balance_after, 'balance'), xp: number(row.xp_after, 'xp'),
      level: number(row.level_after, 'level'), bonus: number(row.token_bonus, 'bonus'), applied: row.applied };
  }
  async adjust(operationId, userId, action, value) {
    identity(operationId, 'operation'); identity(userId, 'user'); amount(value, 'amount');
    if (!['add', 'deduct', 'set'].includes(action)) throw new Error('Invalid action');
    const result = await this.pool.query('select * from moonflip_private.adjust_wallet($1::uuid,$2,$3,$4::bigint)', [operationId, userId, action, value]);
    const row = result.rows[0];
    return { previousBalance: number(row.old_balance, 'balance'), balance: number(row.new_balance, 'balance'), applied: row.applied };
  }
  async loadRound(roundId, userId) {
    identity(roundId, 'round'); identity(userId, 'user');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, game_type, wager, payout, game_state, status, version, balance_after_wager
      FROM moonflip_private.game_rounds WHERE round_id = $1::uuid AND discord_user_id = $2`, [roundId, userId]);
    const row = result.rows[0];
    if (!row) return null;
    const res = { roundId: row.round_id, userId: row.discord_user_id, game: row.game_type,
      wager: number(row.wager, 'wager'), state: row.game_state, status: row.status, version: number(row.version, 'version'),
      balanceAfterWager: number(row.balance_after_wager, 'balance') };
    if (row.payout != null) res.payout = number(row.payout, 'payout');
    return res;
  }
  async loadActiveRound(userId, game) {
    identity(userId, 'user'); identity(game, 'game');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, game_type, wager, game_state, status, version, balance_after_wager
      FROM moonflip_private.game_rounds WHERE discord_user_id = $1 AND game_type = $2 AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`, [userId, game]);
    const row = result.rows[0];
    if (!row) return null;
    return { roundId: row.round_id, userId: row.discord_user_id, game: row.game_type,
      wager: number(row.wager, 'wager'), state: row.game_state, status: row.status, version: number(row.version, 'version'),
      balanceAfterWager: number(row.balance_after_wager, 'balance') };
  }
  async loadActiveMines(userId) {
    identity(userId, 'user');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, game_type, wager, game_state, status, version, balance_after_wager
      FROM moonflip_private.game_rounds WHERE discord_user_id = $1 AND game_type = 'mines' AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return { roundId: row.round_id, userId: row.discord_user_id, game: row.game_type,
      wager: number(row.wager, 'wager'), state: row.game_state, status: row.status, version: number(row.version, 'version'),
      balanceAfterWager: number(row.balance_after_wager, 'balance') };
  }
  async loadActiveBlackjack(userId) {
    identity(userId, 'user');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, game_type, wager, game_state, status, version, balance_after_wager
      FROM moonflip_private.game_rounds WHERE discord_user_id = $1 AND game_type = 'blackjack' AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return { roundId: row.round_id, userId: row.discord_user_id, game: row.game_type,
      wager: number(row.wager, 'wager'), state: row.game_state, status: row.status, version: number(row.version, 'version'),
      balanceAfterWager: number(row.balance_after_wager, 'balance') };
  }
  async loadActiveCrash(userId) {
    identity(userId, 'user');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, game_type, wager, game_state, status, version, balance_after_wager
      FROM moonflip_private.game_rounds WHERE discord_user_id = $1 AND game_type = 'crash' AND status = 'active'
      ORDER BY created_at DESC LIMIT 1`, [userId]);
    const row = result.rows[0];
    if (!row) return null;
    return { roundId: row.round_id, userId: row.discord_user_id, game: row.game_type,
      wager: number(row.wager, 'wager'), state: row.game_state, status: row.status, version: number(row.version, 'version'),
      balanceAfterWager: number(row.balance_after_wager, 'balance') };
  }
  async doubleRound(operationId, roundId, userId, version, extraWager, state, payout) {
    identity(operationId, 'operation'); identity(roundId, 'round'); identity(userId, 'user');
    amount(version, 'version'); amount(extraWager, 'extra wager', 1); amount(payout, 'payout');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const prior = await client.query(
        'SELECT * FROM moonflip_private.game_transitions WHERE operation_id = $1::uuid',
        [operationId]
      );
      if (prior.rows.length > 0) {
        await client.query('COMMIT');
        return { version: number(prior.rows[0].resulting_version, 'version'), balance: number(prior.rows[0].balance_after, 'balance'), applied: false };
      }
      const roundRes = await client.query(
        'SELECT * FROM moonflip_private.game_rounds WHERE round_id = $1::uuid AND discord_user_id = $2 FOR UPDATE',
        [roundId, userId]
      );
      if (roundRes.rows.length === 0) throw new Error('round not found');
      const round = roundRes.rows[0];
      if (round.status !== 'active') throw new Error('round already settled');
      if (number(round.version, 'version') !== version) throw new Error('stale game state');

      const walletRes = await client.query(
        'SELECT balance FROM moonflip_private.wallets WHERE discord_user_id = $1 FOR UPDATE',
        [userId]
      );
      if (walletRes.rows.length === 0) throw new Error('wallet not found');
      const currentBalance = BigInt(walletRes.rows[0].balance);
      if (currentBalance < BigInt(extraWager)) throw new Error('insufficient balance');

      let balanceAfter = currentBalance - BigInt(extraWager);
      let totalWonAdd = BigInt(0);
      if (payout > 0) {
        balanceAfter += BigInt(payout);
        totalWonAdd = BigInt(payout);
      }
      await client.query(
        `UPDATE moonflip_private.wallets 
         SET balance = $2, total_bet = total_bet + $3, total_won = total_won + $4, updated_at = now() 
         WHERE discord_user_id = $1`,
        [userId, balanceAfter.toString(), extraWager, totalWonAdd.toString()]
      );

      const nextVersion = version + 1;
      await client.query(
        `UPDATE moonflip_private.game_rounds
         SET wager = wager + $2, game_state = $3, version = $4, status = 'settled', payout = $5,
             balance_after_settlement = $6, settled_at = now()
         WHERE round_id = $1::uuid`,
        [roundId, extraWager, JSON.stringify(state), nextVersion, payout, balanceAfter.toString()]
      );

      await client.query(
        `INSERT INTO moonflip_private.game_transitions
         (operation_id, round_id, discord_user_id, expected_version, next_state, payout, resulting_version, balance_after)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)`,
        [operationId, roundId, userId, version, JSON.stringify(state), payout, nextVersion, balanceAfter.toString()]
      );

      await client.query('COMMIT');
      return { version: nextVersion, balance: number(balanceAfter, 'balance'), applied: true };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async updateRoundState(roundId, state) {
    identity(roundId, 'round');
    if (!state || typeof state !== 'object') throw new Error('Invalid state');
    await this.pool.query(
      `UPDATE moonflip_private.game_rounds
       SET game_state = $2::jsonb
       WHERE round_id = $1::uuid AND status = 'active'`,
      [roundId, JSON.stringify(state)]
    );
  }
  async recoverInterruptedRounds(game, refund = true, olderThanSeconds = 1200, activeRoundIds = []) {
    identity(game, 'game');
    amount(olderThanSeconds, 'olderThanSeconds', 0);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 42))', [`recover_rounds_${game}`]);
      const activeRounds = await client.query(
        `SELECT round_id, discord_user_id, wager, game_state, version
         FROM moonflip_private.game_rounds
         WHERE game_type = $1 AND status = 'active'
           AND created_at < now() - ($2 || ' seconds')::interval
           AND round_id <> ALL($3::uuid[])
         FOR UPDATE`,
        [game, olderThanSeconds, activeRoundIds]
      );
      let count = 0;
      for (const r of activeRounds.rows) {
        let payout;
        const gs = r.game_state || {};
        if (gs.outcome === 'cashed_out' && gs.winAmount != null) {
          payout = BigInt(gs.winAmount);
        } else if (gs.outcome === 'crashed') {
          payout = 0n;
        } else {
          payout = refund ? BigInt(r.wager) : 0n;
        }
        let currentBalance;
        if (payout > 0n) {
          const w = await client.query(
            `UPDATE moonflip_private.wallets
             SET balance = balance + $2, total_won = total_won + $2, updated_at = now()
             WHERE discord_user_id = $1
             RETURNING balance`,
            [r.discord_user_id, payout.toString()]
          );
          currentBalance = w.rows[0].balance;
        } else {
          const w = await client.query(
            `SELECT balance FROM moonflip_private.wallets WHERE discord_user_id = $1`,
            [r.discord_user_id]
          );
          currentBalance = w.rows[0].balance;
        }
        await client.query(
          `UPDATE moonflip_private.game_rounds
           SET status = 'settled', payout = $2, balance_after_settlement = $3, settled_at = now()
           WHERE round_id = $1::uuid`,
          [r.round_id, payout.toString(), currentBalance]
        );
        count++;
      }
      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
  async loadTransition(operationId, roundId, userId) {
    identity(operationId, 'operation'); identity(roundId, 'round'); identity(userId, 'user');
    const result = await this.pool.query(`SELECT round_id, discord_user_id, next_state, payout, resulting_version, balance_after
      FROM moonflip_private.game_transitions WHERE operation_id = $1::uuid AND round_id = $2::uuid AND discord_user_id = $3`,
      [operationId, roundId, userId]);
    const row = result.rows[0];
    if (!row) return null;
    return { roundId: row.round_id, userId: row.discord_user_id, state: row.next_state,
      payout: row.payout === null ? null : number(row.payout, 'payout'),
      version: number(row.resulting_version, 'version'), balance: number(row.balance_after, 'balance') };
  }
}
