# Game cosmetics restored — 22 September 2026

Update: [Blackjack celebrations](blackjack-celebrations.md) subsequently expanded the deployed catalog to 15 items and five game-cosmetic slots. Do not re-run the older 12-item restoration script against that newer catalog.

## Current state

The user approved the database expansion after the live-schema audit. Applied to BUT.io as migration `20260922131246_restore_game_cosmetics_preserve_stats` before releasing the app changes. The earlier audit's single-frame-only restriction is superseded for game cosmetics.

The shop supports 12 items: three frames, three card backs, three dealing animations, and three tank decals. It uses four independent equipment slots. Premium avatars remain unavailable because their separate migration was not requested or applied. The app retains the audit's friendship, profile, history, stats and error-handling fixes.

## SQL to keep or run on another matching database

[restore_game_cosmetics.sql](../supabase/manual/restore_game_cosmetics.sql) is the complete SQL Editor script. Run the entire file together. It has already been applied to the connected BUT.io database; there is no need to run it again there.

The script adds `player_wallets.equipped_cosmetics`, copies existing frame selections into its frame slot, expands the ownership constraint and catalog, and installs the purchase/equip RPCs. It retains the singular frame column/RPC for older deployed clients. RLS stays enabled and anonymous execution is denied. No stats, history or transaction logic is replaced.

The whole script runs in a transaction, aborts if locks take longer than five seconds, and compares complete before/after rows for wallets, ownership, game stats, match history and coin transactions. Only the new equipment map may differ. Any preservation failure rolls everything back. Re-running on the same 12-item schema preserves existing equipment instead of resetting it. The manual script is the guarded release copy of `20260921222011_game_cosmetic_slots.sql`; the Supabase MCP assigned the applied migration its current timestamp. Do not blindly replay the unrelated premium-avatar migration.

## Verification

- Isolated PGlite PostgreSQL tests passed migration/backfill, exact data preservation, repeated execution with existing card equipment, deliberate stats corruption triggering rollback, and the full game-cosmetics SQL regression (prices, ownership, independent slots, insufficient funds, duplicate purchases and authentication).
- 38 focused application tests pass: 17 web, 12 shared, 9 server integration. Typecheck and the production web build pass (existing bundle-size warning only).
- Live preservation guards passed during the migration. Before/after: 5 stats rows, 17 matches, 23 coin transactions, 4 wallets, 880 total coins, 1 owned item. No frame-backfill mismatches; wallet/ownership RLS remain enabled. Live read-only catalog queries confirm all 12 items and their prices.
- A live-account mutation regression was rejected by automatic approval review because it would temporarily delete/update real account data even with rollback. It was not run or bypassed. Isolated SQL tests and live read-only verification provide the validation instead.
- Security advisor findings remain in the existing categories. The authenticated SECURITY DEFINER advisory moves from the legacy equip function to the new slot function; caller identity, non-anonymous status and ownership are explicitly enforced. See [the advisory explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Existing unrelated policy/auth advisories were not changed.

Letta memory tools remain unavailable. This note is the durable handoff. After the web/server deployment finishes, refresh the page and rejoin a lobby to use newly equipped game cosmetics.

Activity: restored game cosmetics through a guarded, data-preserving schema expansion and coordinated application update; unrelated workspace changes are excluded from the push.
