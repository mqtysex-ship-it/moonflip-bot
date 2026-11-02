# Coinflip and Plinko

Add two playable web games using the current dark Moonflip controls, mint actions, shared Discord wallet, and server-owned outcomes. Coinflip selects heads/tails with independent 50/50 odds and 1.92x gross payout (4% theoretical house edge). Plinko offers 8–16 rows and low/medium/high risk, a triangular peg board, server-generated left/right path, and visible payout buckets. Payout profiles are normalized to at most 99% theoretical RTP before whole-token rounding; disclose this explicitly. Stake is the interaction reference, not an asset source.

Durable rounds use existing private PostgreSQL game_rounds and wallet functions. A transaction-scoped round lock protects result generation and retries. Store validated request parameters with the outcome; reject reuse with different options or identity. Debit, outcome and settlement commit together. No JSON or in-memory fallback for these games, including guests: require Discord-linked sessions for wagers. Read recent rounds from PostgreSQL for history and restart recovery. Retain pending request IDs locally only as retry metadata; never treat browser state as authoritative.

## Implementation plan
- [x] Test result generation, payout math, validation and expected return before implementation.
- [x] Implement transaction-locked settlement and history over existing schema; test rollback, duplicate requests, identity collisions, concurrency and new service instance recovery.
- [x] Add authenticated API routes and publish wallet updates only after commit. Test invalid inputs and unavailable storage fail closed.
- [x] Build matching controls, coin flip animation and Plinko path animation; wire catalog, sidebar, URLs, history and balance.
- [x] Run isolated suite, default suite in isolated environment, and browser interaction checks at desktop/mobile sizes.

No schema migration required: existing tables already accept both game types and JSONB game state. Production deployment follows the existing migration baseline.

## Verification notes

All 27 payout profiles, private PostgreSQL concurrency/recovery/rollback checks, authenticated HTTP settlement, and the isolated suite pass. Browser checks covered real synthetic wallets, mobile layout, lost response followed by reload/retry, and expired-session recovery. The default `npm test` needs a connected Discord bot; with bot credentials intentionally disabled it fails in test-mcp.js while parsing the missing-token error as JSON. No real user wallets were used in tests.
