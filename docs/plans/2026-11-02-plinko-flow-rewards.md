# Silent navigation, concurrent Plinko and rewards

- Remove generic UI click beeps. Keep explicit game sound toggle and game feedback.
- Plinko drops have independent SVG balls and request IDs; send bets without waiting for previous animations. Up to 32 concurrent drops; risk/rows remain fixed while drops are active.
- Never highlight the destination, show a round result, or include that round in history/activity before its own ball lands. Animation uses the committed server path. Pending request metadata remains durable across reloads and retries without duplicate debits.
- Remove the secondary balance/house-edge block and technical explanations from instant-game controls. The header remains the wallet display.
- Give Rewards its own compact daily-reward modal: 500 tokens, claim action, cooldown. Use the existing PostgreSQL daily-claim transaction and shared Discord cooldown; no new schema or persistence fallback.
- Verify concurrent UI submissions, no early reveal, per-ball completion, retries/reloads, silent navigation, and idempotent daily claims.

## Verified

- Regression tests cover overlapping balls, a negative first animation timestamp, cross-view pending result privacy, independent stalled requests, expired-session recovery, and per-ball completion.
- Live PostgreSQL HTTP tests confirm concurrent/replayed reward claims credit exactly once and share the Discord cooldown.
- Browser: silent category navigation, multiple airborne balls, no early target highlight, simplified controls, desktop/mobile layout, and reward credit of exactly 500 tokens.
- Full isolated suite passes. Default npm test still fails at test-mcp.js:58 when bot credentials are intentionally disabled (it parses the missing-token error as JSON).
- Independent review found cross-view pending-result exposure and serialized request blocking; both received regression tests and fixes. A real-browser negative RAF timestamp failure was reproduced and fixed too.
