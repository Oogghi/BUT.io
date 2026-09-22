# Game cosmetics — 22 September 2026

Current live compatibility supersedes the rollout instructions below: see [the schema audit](supabase-schema-audit.md). The hosted database supports three frames and one equipped frame only. The expanded slots are not enabled in the application; these migrations must not be applied merely to resolve a stale query.

Follow-up: [avatar expansion](avatar-art.md) adds six free faces (twelve total), four premium avatars, and a fifth independent `avatar` slot. Its migration follows the original cosmetics migration; both must be applied before release. That note contains the current avatar behavior, verification, artwork paths, and generation prompts.

## Goal and acceptance

Expand the existing account-backed locker with cosmetics visibly used in multiple games. Keep game rules and rewards unchanged; validate ownership server-side, preserve old frame selections, and support reduced motion. User requested generated art matching the existing style, with regeneration when needed.

## Implemented

- Nine new items plus the three existing frames: three card backs and three dealing animations for Blackjack/Poker; three hull decals for Tank Arena.
- Shared catalog/types/slot validation in `packages/shared/src/cosmetics.ts`; SQL price parity regression test.
- Four independent equipment slots. Purchases automatically equip only an empty matching slot; equip/reset preserves other slots. Legacy frame RPC/column remain compatible.
- Server reads verified account ownership and equipment on lobby join, sanitizes the loadout, and broadcasts it. Guests, invalid items, unowned items, and unavailable database reads use default cosmetics. Changes take effect on the next lobby join.
- Locker includes category filters, game labels, previews/replay, independent unequip, loading/busy/insufficient-funds states, and English/French copy.
- Three generated card textures in `apps/web/public/cosmetics/`, optimized to 400×560 WebP (~111 KB total). Rejected ornate initial midnight artwork and regenerated against the existing card back. Tank markings use shared polygon shapes to stay crisp and attached to the hull.
- Bomb Tank was present at initial inspection but removed by concurrent workspace changes; no removed files were recreated and this implementation targets Tank Arena.

## Verification

- Workspace typecheck and changed-file Prettier check pass.
- Full workspace tests pass, including 82 server tests and four new cosmetics integration tests. Two additional shared tests validate malformed/unowned/wrong-slot loadouts and SQL/catalog price parity.
- Production web build passes; existing large-chunk warning remains.
- New migration and SQL regression executed in isolated PGlite PostgreSQL: all prices, legacy backfill, ownership, insufficient funds, duplicate purchases, independent slots/reset, auth denial, grants, and rollback pass. Native Supabase advisors and concurrent transaction stress testing were unavailable.
- Browser screenshots/reports are in ignored `artifacts/cosmetics/`. Real guest locker and an isolated mock-account fixture exercise the actual LockerView at 1440px/390px; purchases/equip/reset, disabled states, filters/replays, asset decoding, reduced-motion previews pass with no page errors or overflow. Account browser tests use a mock; SQL tests run separately against real PostgreSQL WASM.
- Actual Blackjack and Poker components rendered with two distinct player loadouts: correct card texture per seat, no page errors; Blackjack dealing is static with reduced motion enabled before page load. Card screenshots use deterministic local state fixtures.

## Rollout / remaining

Tank Arena browser verification also passed with zero runtime errors: all three decal shapes on all three hulls, mirrored facing, rotations, and Bubble replay visibility. Screenshots include `tank-decals-detail.png`, `tank-decals-rotated.png`, and `tank-decals-bubble.png`. Temporary browser fixtures were removed and the dedicated verification preview was stopped.

Apply `supabase/migrations/20260921222011_game_cosmetic_slots.sql` before releasing updated web and game server builds. Hosted database was not changed; no deployment or Git commit was made. Existing saved frames are backfilled automatically. The Letta memory connector was unavailable, so no memory persistence is claimed.
