# Plinko autobet, themes and game navigation

- Add finite Plinko autobet (1–1000 bets, selectable interval, explicit Start/Stop and progress). Reuse the same transactional wallet/round settlement and animation pipeline. An autobet run's options and committed progress live in private PostgreSQL documents. Each indexed auto bet advances its run in the same transaction as its debit/result/payout; duplicate retries cannot advance twice. Stop prevents new settlements after its committed stop. Reload never starts wagering automatically: an unfinished run requires explicit Resume or Stop.
- Remove the disabled Mines Auto tab; keep Mines manual only.
- Add Obsidian, Midnight and Forest appearance choices. Persist authenticated preference in the existing private documents table. Guest theme selection is a session preview; no local file/user-data fallback. Only acknowledge a saved preference after database commit.
- Replace the game switcher with accessible illustrated SVG tiles, clear selected state and responsive horizontal scrolling. Use custom vector icons rather than raster art for sharp UI assets.
- Set Plinko's fixed theoretical house edge to 4% with truthful payout buckets and a collapsed Rules disclosure (96% theoretical RTP before whole-token rounding). No player-specific/adaptive chance manipulation. Stored previous rounds retain their committed multipliers.

## Checks
- Run/progress/replay/stop and preferences persistence in PostgreSQL, auth and invalid input/fail-closed API tests.
- Frontend finite autobet, Stop/error/navigation behavior and no automatic resume after reload.
- All 27 payout profiles, existing isolated suite and desktop/mobile browser checks.

## Verification

- Isolated suite passes, including finite autobet/Stop/error/reload-consent and committed theme persistence tests.
- Live PostgreSQL tests pass for indexed run progress, duplicate replay, shared wallet settlement, Stop, persisted preferences and old Start replay after a subsequent run.
- Independent review identified historical Start replay; fixed by durable per-run records with regression coverage. No additional schema migration is required; the existing private documents table is reused.
- Browser: three-bet run completes, Stop halts after one bet, a persisted paused run places zero bets after reload, Midnight survives reload, Forest saves, Mines has no Auto tab, and four custom SVG game icons render.
