# Extended game settings — 22 September 2026

The user requested wider existing rules, including 50 rounds and 15 Blackjack splits, without adding new controls to games such as Tank Arena. Blackjack now defaults to 20 rounds, a 500 maximum bet and 10 maximum splits. Poker also defaults to 20 rounds. Other defaults are unchanged.

The game packages export numeric bounds shared by the lobby forms and server parsers:

| Setting                                         |       Maximum |
| ----------------------------------------------- | ------------: |
| Blackjack / Poker rounds                        |           100 |
| Blackjack splits per player per round           | 20 (21 hands) |
| Blackjack decks                                 |            32 |
| Card game starting chips and numeric bet limits |     1,000,000 |
| Blackjack side-bet payout multipliers           |       1,000:1 |
| Card game action / betting timers               |   240 seconds |
| Blackjack rebuys                                |           100 |
| Blackjack rebuy chips / cost                    |     1,000,000 |
| Bomb Party starting / maximum lives             |           100 |
| Bomb Party minimum turn time                    |   120 seconds |
| Bomb Party prompt age                           |           100 |

Existing relational checks still apply (bets within starting chips, starting lives within maximum lives, enough chips for four Poker antes). Player capacities and payout presets remain unchanged. Poker's existing timer setting is accepted by the server but is not exposed by its current settings panel.

All new limits fit the existing room wire types, so no wire-schema or database migration is required. The live Supabase rebuy RPC was checked read-only: its positive rebuy number and bigint cost support the extended settings. The existing numeric JSON statistics and capped match coin rewards are unchanged. For the separately restored game cosmetics and data-preserving SQL, see [cosmetics-restoration.md](cosmetics-restoration.md).

Validation: workspace typecheck and production web build passed (existing large-chunk warning). The 69 relevant rules and multiplayer tests pass after correcting two old-limit assertions: 41 affected pure-rule tests passed on rerun, and the other 28 tests passed in the initial run. Tests exercise the requested defaults, every numeric boundary, 15 actual splits followed by settlement, complete 50-round Blackjack/Ultimate/Hold'em matches, guest settings synchronization and starting a Bomb Party match with 100 lives.

Scope: only this task's settings, test and documentation changes are included in the commit. Unrelated Color Switch, Mini Golf and UI work remains in the workspace. Letta memory tools are unavailable; this note is the durable handoff. Existing rooms retain their selected rules; newly created rooms use the new defaults after server deployment.

Activity: widened existing game settings, synchronized client/server validation, updated requested defaults and verified extended matches without changing existing stats.
