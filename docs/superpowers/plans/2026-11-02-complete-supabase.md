# Complete Supabase migration

Goal: All durable application data lives in Supabase; Node hosts run bot/web, never a production JSON fallback.
Architecture: shared pg Pool with verified Supabase CA, asynchronous SQL wallet functions, private JSONB documents for settings/tickets/leaderboards, persistent game rounds. Legacy JSON mode remains only when DATABASE_URL absent for isolated tests and migration source export. Runtime paths await persistence before acknowledgements. Initial production single instance.
Authorization: user explicitly requested completing, connecting, and moving ALL data; deployment is within scope. Never discard either legacy source. Preserve conflicting source copies and document selected canonical value; do not fabricate missing XP.

Tasks:
- [x] Economy adapter/facade and Discord/game consumers. Preserve interfaces or await callers; all wallet changes transactional and no fallback on failure. XP moves to SQL. Tests for rollback, duplicates, insufficient balances.
- [x] Web server/play API async DB integration, persistent Mines and restart-safe game settlements; health endpoint, dashboard injection, no JSON production reads.
- [x] Shared database runtime, private documents and persistence of settings/tickets/leaderboards; awaited writes, database errors surface. Migration SQL and tests.
- [x] Backup and reconcile local/Render sources, private archive in Supabase, migration tool, verified exact import, no blind overwrite.
- [x] Run isolated tests, real SQL tests in rollback transactions, integration tests. Review changes. Deploy single production instance with secrets, verify health and persistence.
- [x] Persistent Blackjack and Double Down transactional wager changes in Supabase game_rounds/game_transitions with restart recovery.
- [x] Persistent Crash flights, auto-cashout settlements, and reboot recovery with automatic wager refunding for interrupted flights.

Progress:
- DATABASE_URL corrected (removed template brackets around password). Verified SQL read successful.
- Supabase CA downloaded and pool test red/green. Credentials never printed.
- Reconciled player snapshots imported into `moonflip_private.wallets`.
- Settings, tickets, departments, and leaderboards stored in `moonflip_private.documents`.
- Coinflip, Keno, and Slots converted to atomic instant settlements.
- Mines converted to persistent game rounds with multi-turn step transitions.
- Blackjack converted to `moonflip_private.game_rounds` and `moonflip_private.game_transitions`, with atomic Double Down transaction and active hand resumption across restarts.
- Crash (Discord & Web Arena) converted to persistent database rounds with startup restart recovery and refunding for interrupted flights.
- User preferences for Mines and Crash persisted to Supabase document store.
- 24/24 isolated tests passing + real Supabase integration tests passing.
