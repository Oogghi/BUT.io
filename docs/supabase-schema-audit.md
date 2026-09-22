# Live Supabase schema audit — 22 September 2026

## Goal and acceptance

Reconcile application reads, writes, RPCs and display state with the user's live public-schema snapshot. Verify the affected client/server behavior, preserve unrelated work, and commit/push only this audit's changes. No schema expansion or RLS changes are needed.

## Verified contract

The supplied snapshot was confirmed against the BUT.io project's live columns, constraints, RPC definitions, grants and public RLS policies using read-only Supabase queries.

- `player_wallets` persists one nullable `equipped_cosmetic`; there is no plural equipment column. Owned items come from `player_cosmetics`, whose constraint permits only coral, mint and sky frames. Live purchase prices are 40, 60 and 80 coins. The browser and server read the singular column; the room/UI loadout is derived from it and verified ownership.
- `purchase_cosmetic(p_cosmetic_id)` and `set_equipped_cosmetic(p_cosmetic_id)` exist and return `{ coins, equipped_cosmetic }`. `set_cosmetic_slot` does not exist. The shop exposes only supported frames, and unsupported purchases/equipment fail before sending a request. Free local avatars remain available. Expanded artwork/renderers are retained but account-backed premium equipment is unavailable.
- `friendships.status` permits pending, accepted and blocked. Declining deletes only the incoming pending request. Existing DELETE/SELECT policies permit either participant; group-invite decline remains a separate RPC using its valid declined status. Blocked relationships cannot be turned into new requests by the application.
- `group_members.user_id` is globally unique. The application's single-membership lookup and live create/join/accept RPC checks agree. Group RPC names, parameters and response shapes match. `group_lobby_invites.game_id` and its publisher allow only Bomb Party, Tank Arena and Blackjack; Poker stats use a separate game type.
- `record_match_result` allows those three games plus Poker. Reward transactions insert positive credits only. Cosmetic purchases debit wallets directly; Blackjack rebuy debits are recorded separately in `private.blackjack_rebuys`. Neither path inserts negative coin transactions. Match/rebuy RPC execution is restricted to the service role.
- Stats and match winner foreign keys reference profiles, while wallets/groups reference auth users. Server reward identity verification now requires a profile matching the verified auth ID. There is no observed auth-user creation trigger that guarantees that profile exists.
- Authenticated users can read all `match_history` rows: RLS does not filter by participant. Recent-match queries explicitly filter `metadata.participants` before limiting results and use the RPC's per-player outcome (including shared wins and draws). Poker is included in stats, recent history and leaderboards.
- Usernames have a length constraint but no unique index/constraint. Name-based profile lookup returns no result when ambiguous instead of selecting an arbitrary account. Account writes continue to key on the auth user ID.
- All referenced direct table columns match the snapshot. Row interfaces reflect non-null counters/timestamps and distinct friendship/group-invite statuses. Database error codes are retained, with missing schema objects classified separately from permission denial; empty RLS-filtered results are not mislabeled as schema errors.

## Migration status and scope

The existing `20260921222011_game_cosmetic_slots.sql` and `20260921224407_premium_avatar_cosmetics.sql` files describe an unapplied expansion, not the live database. Their SQL tests exercise that proposed schema, not production compatibility. Do not apply them as a fix for the application/schema mismatch. Enabling the expansion requires a separate coordinated database/application rollout.

Live policies and the functions invoked by this application were inspected for compatibility. This is not a comprehensive security audit of every backend function, policy, index, view or Edge Function. Existing grants and RLS were preserved. No live data, functions, policies or migrations were changed.

## Verification and current state

- Live read-only test queries confirm the wallet/ownership columns and participant JSONB filter resolve, and confirm the singular equip RPC exists while the slot RPC is absent.
- Regression fixtures enforce live column names, friendship statuses, cosmetic IDs and RPC signatures; server integration tests use real Supabase HTTP and Colyseus clients.
- All 38 relevant tests pass: 16 web, 12 shared and 10 server integration tests. Workspace typecheck and the production web build pass; the existing bundle-size warning remains.
- Live account purchase/equip and deployed browser behavior still need a post-deployment smoke check. No live account data was modified during verification.
- Letta memory tools are unavailable; no memory persistence is claimed. This note preserves the audit findings and rollout constraint.

Activity: reconciled and validated application assumptions against the supplied schema and live read-only metadata. The user authorized committing and pushing only this audit's changes.
