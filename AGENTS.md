# Data persistence

- Supabase PostgreSQL is the authoritative store for all durable application data and new features.
- Do not introduce production JSON-file persistence or process-memory-only state for user data, wagers, game recovery, settings, tickets, or history.
- Keep wallet and game state changes transactional and retry-safe; never acknowledge a successful change before it is committed.
- Database errors must fail closed rather than silently falling back to local files.
- Preserve private schema access controls and test restart recovery, concurrent operations, and migrations when relevant.
- The legacy JSON path exists for migration and isolated development tests; do not use it as production storage.
