# Tank Arena

A 2–8 player turn-based artillery brawler modeled on Plato's Brawlbots: everyone plans at once, the server resolves the turn, and every client replays the same result.

## Turn loop

1. **Planning** (`PLANNING_SECONDS`, 20 s). Players pick an action and aim, then press Ready. Plans stay hidden from opponents; only the ready flag is synced. Ready is final: the server rejects any later plan that turn (`locked`).
2. **Lock.** The turn resolves as soon as every living tank has locked in, or at the deadline. Unconfirmed tanks hold (skip).
3. **Resolution.** `TankArenaGame` runs one deterministic `Simulation`. All actions launch on tick 0 in seat order, then bodies move until the arena is still. An announced airstrike then strikes, and poison ticks.
4. **Replay.** The result is published as a `Replay` (sampled tracks plus timed events) together with the final state. Clients animate the replay, then adopt the state. The server waits for the replay length plus 1.2 s before the next turn.
5. **End of turn.** Cooldowns and freezes count down, pickups settle, and a pickup may spawn. From turn 3 an airstrike may be announced for the next turn.
6. **Winner.** The last tank alive wins. If everyone dies at once, nobody wins.

## World and physics (`games/tank-arena/src/physics.ts`)

- **Units and gravity:** map pixels, simulated at 60 ticks per second. Jungle and Frostbite use 1250 px/s²; Lava uses 1800 px/s².
- **Terrain:** a 4 px collision grid built from the map's solid rectangles. Explosions carve circular craters in both the grid and the foreground art (`map_destroy`).
- **Wrapping:** the arena wraps horizontally. Tanks and shells that leave one side re-enter from the other, and blasts, hits and pickups measure distance the short way across the edge. The only way to fall is through a hole into the water (`waterY`), which eliminates the tank.
- **Tanks:** each tank is a rigid 120×64 box with an angle and spin. Gravity, contacts with the terrain and other tanks (slight bounce, strong friction) and blasts that land off-center make tanks tip, tumble, roll off edges and settle on slopes. A tank rests once it has been calm for a few ticks, and wakes as soon as its center of mass is no longer over what holds it (a crater opens, the tank below moves). A tank that settles on its side or roof hops back upright.
- **Jumps:** launch speed is `1455 − 6 × weight` px/s. At full power the Neon rises about 640px, the Viper 500px and the Howler 370px, just enough to reach the platforms.
- **Explosions:** damage falls off linearly to 50% at the blast edge, measured to the nearest point of each tank's box. Knockback pushes away from the blast with an upward bias, scaled by `55 / (weight + 25)`. Shells also hurt their own tank.
- **Shared previews:** the client's trajectory preview runs the same stepping code as the server. It stops at the first contact.
- **Replays:** tank tracks record the angle at every sample, so every client plays back the same tumble.

## Roster (`tanks` in `src/index.ts`)

| Tank   | Health | Weight | Missile damage | Accuracy | Abilities                 |
| ------ | -----: | -----: | -------------: | -------: | ------------------------- |
| Howler |    150 |     80 |             26 |     0.85 | Pulse Bomb, Big Shell     |
| Neon   |    110 |     30 |             32 |     0.80 | Triple Shot, Spike Bubble |
| Viper  |    130 |     55 |             29 |     0.95 | Cluster Bomb, Toxic Shot  |

Stats come from the provided `.stats` files, rebalanced for quicker rounds. `nano.stats` was matched to the Neon sprite. Accuracy adds up to ±(1 − accuracy) × 6° of seeded server-side spread to shots.

Every tank has Missile, Jump and Hold. The Pulse Bomb (internal id `shockwave`) is a lobbed charge: little damage and no crater, but a 150px blast with heavy knockback where it lands. The Spike Bubble launches the Neon itself as an 84px bouncing ball: it feels 45% of normal gravity and keeps 88% of its speed per bounce. It deals 10 damage to each tank it newly touches and shoves it; it pops after 2.5 s, 8 bounces or once nearly stopped, and the tank drops back upright. Action rules (cooldown, aim type, speed, movement) live in `actions` in `src/index.ts`. Each action's behavior is one entry in the `behaviors` registry in `src/sim.ts`, so adding an ability means adding data plus one function.

## Maps

- **Jungle:** the classic map with steady footing, strong cover and standard crater size.
- **Frostbite:** uses the supplied ice art and collision mask. Tanks slide farther and explosions carve 1.45× larger craters, so shelves break away faster.
- **Lava:** uses the supplied volcanic art and collision mask. Higher gravity makes launches fall faster; high friction and 0.55× craters keep the rock solid without making it indestructible.
- **Lobby votes:** players can vote for either map or Random. The most-voted option wins; ties and Random resolve randomly. Voting is optional: only player readiness gates launch.

## Pickups and hazards

- **Pickups:** at most two crates exist at once. After each turn one spawns with 60% chance on a random surface, and a tank collects it by touching it during a turn.
  - Repair: +35 health.
  - Shield: absorbs 40 damage.
  - Reload: resets cooldowns.
  - Overcharge: next attack deals +50%.
  - Venom: next attack poisons (8 damage per turn for 3 turns).
  - Cryo: next attack freezes; frozen tanks can't jump next turn.
- **Airstrike:** from turn 3, there's a 25% chance each turn. The strike zone is shown during planning, and five shells fall across it after the turn's actions.

## Controls

- **Aim:** drag anywhere in the arena. The drag offsets the current aim, and power follows the drag distance (the dotted arc shows the result).
- **Actions:** the square buttons in the compact bar at the bottom, or keys 1–5.
- **Ready:** the Ready / Prêt button, or Enter. After that the bar stays visible but locked until the turn resolves.
- **Timer:** a ring at the top center.
- **Keyboard aim:** arrow keys adjust the angle and power.

A screen-reader status line announces the turn, stage and hint.

## Networking

Room type `tank-arena` shares the lobby lifecycle with Bomb Party through `LobbyRoom`.

- **Lobby intents:** `tank` sends the chosen roster id.
- **In-game intents:** `plan` sends `{ action, angle, power, turn }`. Rejections come back as `plan-error`.
- **Synced state:** per-player health, position, cooldowns and status, plus JSON blobs for the replay, craters, pickups and the announced hazard.
- **Countdown:** clients count down from the moment each server timestamp arrives, so every browser shows the same time.

## Lobby hangar

In the lobby, Tank Arena shows a full-width hangar under the player list:

- **Tank showcase:** the chosen tank's in-game art, role, stats and abilities. Switch with the arrows, the crest strip or ← → on the strip. Each crest shows which players picked that tank.
- **Map board:** one card per map, built from the map's own background and terrain art, plus a Random card. Cards show the map's traits and who voted for it; the leading map gets a badge. Voting stays optional.

## Adding a map

1. Put the art in `apps/web/public/tank-arena/`: a background and a destructible terrain layer, both 1672×941.
2. Add an `ArenaMap` entry in `games/tank-arena/src/index.ts` (collision rectangles, spawns, water line, gravity, friction, crater multiplier) with its picker data: `name`, an English and French `description`, an `icon` (a name from `apps/web/src/Icon.tsx`), an `accent` color and trait `stats`.
3. Register it in `maps`.

The map board, voting and random pick all read from `maps`, so nothing else needs to change.

## Known limits

- Three maps (Jungle, Frostbite and Lava).
- There's no reconnection. A refresh leaves the match, like in Bomb Party.
- The in-canvas controls use drawn shapes. Generated button and panel art can replace them without changing any behavior.
