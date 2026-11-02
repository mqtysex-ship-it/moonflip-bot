# Complete Supabase migration

Goal: All durable application data lives in Supabase; Node hosts run bot/web, never a production JSON fallback.
Architecture: shared pg Pool with verified Supabase CA, asynchronous SQL wallet functions, private JSONB documents for settings/tickets/leaderboards, persistent game rounds. Legacy JSON mode remains only when DATABASE_URL absent for isolated tests and migration source export. Runtime paths await persistence before acknowledgements. Initial production single instance.
Authorization: user explicitly requested completing, connecting, and moving ALL data; deployment is within scope. Never discard either legacy source. Preserve conflicting source copies and document selected canonical value; do not fabricate missing XP.

Tasks:
- [ ] Economy adapter/facade and Discord/game consumers. Preserve interfaces or await callers; all wallet changes transactional and no fallback on failure. XP moves to SQL. Tests for rollback, duplicates, insufficient balances.
- [ ] Web server/play API async DB integration, persistent Mines and restart-safe game settlements; health endpoint, dashboard injection, no JSON production reads.
- [ ] Shared database runtime, private documents and persistence of settings/tickets/leaderboards; awaited writes, database errors surface. Migration SQL and tests.
- [ ] Backup and reconcile local/Render sources, private archive in Supabase, migration tool, verified exact import, no blind overwrite.
- [ ] Run isolated tests, real SQL tests in rollback transactions, integration tests. Review changes. Deploy single production instance with secrets, verify health and persistence.

Progress:
- DATABASE_URL corrected (removed template brackets around password). Verified SQL read successful, wallets empty.
- Supabase CA downloaded and pool test red/green. Credentials never printed.
- Existing working tree has many user changes. Keep current checkout, do not reset. No automatic commits of unrelated changes.
