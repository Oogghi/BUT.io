# Purchasable Blackjack celebrations — 22 September 2026

Three visual effects are available through the existing Locker coin purchase flow: Golden 21 (180 coins), Royal Arrival (220), and Electric 21 (200). Their independent `blackjack-celebration` slot preserves card backs, dealing animations, frames and tank decals. English/French copy, replay previews and unequip controls are included. Equipment still takes effect on the next room join, after server ownership verification.

The effect mounts only for an authoritative two-card, non-split `blackjack` hand. A three-card 21, split 21 or ordinary win never triggers it. It plays after the second card's dealing delay, once for that hand, including a natural that later pushes against the dealer. Room updates do not replay a completed effect. Effects have no input capture, sound or gameplay consequences. Reduced motion replaces particle/crown/bolt movement with a brief fade. Locker previews keep a static illustration after finishing and replay on demand.

## Database and release

Applied migration `20260922135151_blackjack_celebration_cosmetics` to BUT.io after the user requested the push. The complete SQL is [add_blackjack_celebrations.sql](../supabase/manual/add_blackjack_celebrations.sql). No need to run it again on the connected database.

The script extends the currently deployed 12-item catalog to 15 and adds the equipment slot. The purchase RPC already handles prices and independent auto-equipping, so it is reused. It changes no existing player data. Transactional before/after comparisons passed for every wallet (including equipment), ownership row, game statistic, match and coin transaction. The script is repeatable on this catalog and refuses to overwrite the separate premium-avatar expansion. Do not blindly replay either older cosmetic SQL script after this release.

Supabase CLI is unavailable locally; MCP applied the migration and assigned its timestamp. The manual SQL is the exact release artifact. The standalone SQL regression is for an isolated database only; no real account purchases or destructive live-account tests were performed.

## Verification

- 41 focused application tests pass: web 19, shared 13, server 9. Coverage includes natural-blackjack eligibility, owned/wrong-slot equipment, authoritative synchronization and existing Supabase client behavior.
- Isolated PGlite checks pass: all three prices, duplicate and unaffordable purchase rejection, authentication, equip/unequip, preservation of other slots, exact data preservation, repeated SQL execution and the pre-existing shop regression.
- Workspace typechecking and production web build pass (existing chunk-size warning).
- Browser checks cover desktop/mobile effects, replay, one-shot completion across room updates, reduced motion and pointer-events. No browser errors; the scoped design detector returned no findings.
- Live read-only verification confirms all three catalog entries/prices, enabled RLS and authenticated-only equip permission. Security advisor findings are unchanged, including the intentional [authenticated SECURITY DEFINER RPC advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable); caller authentication, ownership and wallet locking remain enforced.

Letta tools remain unavailable; this is the durable project handoff. After deployment, refresh, buy/equip in Locker, and rejoin a Blackjack room. Only this feature's files are included in the release; concurrent game/UI work remains local.

Activity: added three coin-purchased natural-blackjack animations with independent equipment and verified data-preserving catalog expansion.
