# BUT.io multiplayer slice

A TypeScript multiplayer platform with playable French Bomb Party: home → create/join lobby → ready → start → game → results → lobby.

## Run locally

Use Node.js 24 LTS and pnpm 12.4.2 (pinned in `package.json`).

```sh
pnpm install
pnpm dev
```

Open http://127.0.0.1:5173 in two tabs. Enter a name in the profile card and click the avatar to cycle its appearance. Select **Bomb Party** to expand its room options inline. Create a lobby in the first tab, then select **Join room** with its six-character code in the second (or use the invitation link). The host can edit **Game settings** before everyone selects **Ready**, then **Start session**. Take turns entering French words containing the prompt. The server validates words, runs the bomb, and declares the last survivor the winner. The host selects **Return to lobby** for another round. Labels follow the browser's preferred English/French language.

Ctrl+C stops the development processes. No environment files are required with the defaults. To change the multiplayer port, copy `apps/server/.env.example` to `apps/server/.env` and edit `PORT`, then copy `apps/web/.env.example` to `apps/web/.env` and update `VITE_COLYSEUS_URL`. Restart development after changing environment files. `VITE_` values are public browser configuration, never secrets. The local server binds to loopback; a deployed server must use its public URL.

## Structure

```text
apps/
  web/src/
    App.tsx               Routes and connection ownership
    EntryForm.tsx         Profile, game selection, create/join forms
    GameCard.tsx          Shared inline card expansion and Motion layout animations
    gameCards.ts          Display metadata for the game grid
    profile.ts           Validated browser-local profile storage
    Avatar.tsx            Shared profile and lobby avatar rendering
    StatsPopover.tsx      Anchored, dismissible stats preview (no data yet)
    i18n.ts               English/French copy and server error translation
    spring.ts             Shared Motion transition defaults
    LobbyView.tsx         Player list and lifecycle controls
    lobbyConnection.ts    SDK client and immutable React snapshots
    BombPartyPlay.tsx      Automatic inline typing, countdown and bonus alphabet
    BombArena.tsx          Circular seats, turn arrow, lazy Phaser and DOM fallback
    BombPartySettings.tsx  Host settings form and guest read-only settings
    TankArenaPlay.tsx      Hosts the Phaser arena; owns the plan, keyboard shortcuts
    TankLoadout.tsx        Lobby tank picker
  web/test/               Profile storage boundary tests (Node test runner)
  server/
    src/rooms/            Authoritative Colyseus rooms (LobbyRoom holds the shared
                          lobby lifecycle; one subclass per game)
    test/                 Room integration and deterministic gameplay tests
games/
  bomb-party/src/
    index.ts              Metadata, game protocol, settings, normalization
    client.ts             Phaser presentation and mount/dispose functions
    server.ts             Game rules and local dictionary/prompt selection
  bomb-party/data/        French word list and source/license attribution
  tank-arena/src/
    index.ts              Metadata, roster, actions, map, replay/protocol types
    physics.ts            Terrain grid and stepping shared by server and previews
    sim.ts                Deterministic turn simulation and action behaviors
    server.ts             Turn lifecycle, pickups, hazards, winner
    client.ts             Phaser renderer, replay animation, in-canvas controls
packages/
  shared/src/index.ts     Framework-free metadata and lobby protocol types
```

React Router owns `/` and `/lobby/:code`. The lobby URL remains unchanged throughout a session. Name and avatar are remembered in this browser under `but.profile`; malformed or unavailable storage falls back safely. These are local preferences, not accounts or authentication. Shared lobby URLs prefill the saved name; refreshing still requires joining again with a new session identity. No reconnection tokens are stored.

Workspace dependencies use `workspace:*` and explicit package exports. Private packages expose TypeScript source for Vite/tsx. Phaser stays in `@but/bomb-party/client`, loaded dynamically only in the playing phase, and its canvas is destroyed on phase change or navigation. Node imports rules through the server-only game export; the dictionary never enters the browser bundle. Generic lobby contracts are framework-free; concrete synchronization schemas and lifecycle logic live on the server. Shared UI and input packages remain deferred until actual reuse exists.

## Visual layer

The current design uses a dark dotted background, die logo, coral game card, colorful avatars, raised controls, and Bricolage Grotesque typography. Tokens and responsive rules live in `apps/web/src/style.css`; the font loads from Google Fonts with a system fallback. The bomb and game-card artwork are documented in [visual assets](docs/visual-assets.md).

The profile row provides an editable name, avatar cycling, and shortcut tiles. Stats opens a preview with empty values; nothing records statistics. Friends, leaderboard, and settings remain unavailable placeholders. Lobby seats show synchronized avatars and open the same stats preview. The room code copies an invitation link, with a visible fallback when clipboard access fails.

Game selection spans the full grid row on desktop and grows beneath the artwork on mobile. `EntryForm` owns one active game ID and keeps create/join state separate from selection. The selected game moves to the first row; closing restores catalog order. If the grid top is off-screen, selecting a game scrolls it into view (instantly for reduced motion). `GameCard` uses Motion layout projection inside a shared `LayoutGroup` so card size, position, and neighboring tiles animate together with a short eased tween. Nested layout elements keep artwork and text undistorted. Don't layer CSS transform transitions onto Motion-driven transforms. Exiting options are inert and removed from layout immediately while fading out; clicking the expanded surface or pressing Escape closes it and restores tile focus. Buttons, links, inputs, and labels keep their normal actions. Reduced-motion users skip layout, hover, and content movement. Other games expand into a coming-soon message; only Bomb Party can create/join rooms. Sunbursts stay static at rest, artwork uses its baked-in shading rather than live CSS filters, and each card contains its own layout/paint work to reduce rendering cost.

English and French strings are centralized in `i18n.ts`, including typed lobby error codes. Browser language is selected at load; reload after changing it. Stats popovers use the native Popover API's top layer, with manual dismissal so Motion can finish the exit. Scroll/resize listeners and animations are cleaned up when their owner unmounts. Phaser is never retained for an exit animation.

## Authoritative protocol

- Room types: `bomb-party` and `tank-arena` (see [Tank Arena](docs/tank-arena.md) for its turn protocol). The lobby state carries `gameId`, and invite links add `?game=` so the join page shows the right card. Its six-character room ID is the lobby code, using uppercase letters and digits without `I`, `O`, `0`, or `1`. Codes are collision-checked within this single server process, released when the room is disposed, and are invitation identifiers rather than authentication secrets.
- Create/join options: `{ displayName, avatar? }`. Names are trimmed and validated by the server (1–24 characters, no control characters); invalid avatar indices fall back to zero. Duplicate names are allowed; Colyseus session IDs identify players.
- Synchronized state: generic lobby fields plus game-specific `settings` and `game` (active player, prompt/age, turn ID, server deadline, lives, bonus letters, each player's last accepted word, winner). The dictionary and full used-word set stay server-side. Word entry appears beneath the active avatar; type immediately and press Enter to submit, or tap the text on mobile.
- Client intents: `ready` with a boolean; payload-free `start` and `return`; `settings` with the complete settings object; `word` with `{ word, turnId }`. Lobby rejections use `action-error`; game rejections use `word-error`. The client renders authoritative patches and cannot force results.
- `lobby → starting`: host only, 2–8 connected players, everyone ready including the host. Joining is locked until the next lobby phase. The server's one-second timer advances `starting → playing`.
- `playing → results`: only one living player remains, including after a departure. That player wins. An exhausted dictionary ends the round without a winner.
- `results → lobby`: host only, clears gameplay, resets readiness and reopens joining. Settings remain; the next round starts with fresh lives, words and bonus progress.
- The first connected player is host. On departure the next remaining player becomes host. Membership changes reset readiness. Any departure during `starting` cancels the timer and returns to the lobby. Departures during play eliminate that player; play continues while at least two living players remain.
- Unexpected disconnects remove players just like leaving; there is no reconnection grace period. Navigating home leaves the room. Canceled connection attempts are closed when they resolve. Empty rooms are disposed automatically.

The original `foundation` room remains available only for its existing connectivity smoke check.

## Bomb Party rules

See [gameplay contracts](docs/bomb-party-implementation.md) for timer semantics, settings, normalization and prompt difficulty. The local dictionary has 159,588 word forms derived from [Lexique 4](https://lexique.org/); [data attribution and rebuild instructions](games/bomb-party/data/README.md) accompany the checked-in word list. This reproduces the requested mechanics, not JKLM's private dictionary or exact random timer distribution.

## Checks and commands

```sh
pnpm dev:web                       # Web only
pnpm dev:server                    # Server only
pnpm check                         # All TypeScript projects and formatting
pnpm test                          # Game rules, room integration + profile storage tests
pnpm build                         # TypeScript checks plus web bundle
pnpm format                        # Format source/configuration
pnpm --filter @but/server test      # Game/room tests; no dev server required
pnpm --filter @but/web test         # Storage tests; no browser/dependencies required
pnpm --filter @but/server smoke     # Existing smoke checks; dev server required
pnpm --filter @but/web preview      # Serve the built SPA
pnpm --filter @but/server start     # Server without file watching
pnpm install --frozen-lockfile      # Reproduce the pinned dependency installation
```

The server runs source through `tsx`; a compiled server release pipeline remains deferred. Dependencies and lockfile are pinned. Prettier and strict TypeScript provide basic static checks. Optional native MessagePack acceleration is disabled in favor of the JavaScript fallback.

After interaction changes, check two browser clients through create/join, ready, start, Phaser, results, and return. Check avatar synchronization, stats dismissal, rapid card open/close, and a 390px viewport. Phaser should have one canvas per playing client and none after results or navigation. The production build currently reports large chunks, including the lazily loaded Phaser engine; this is a warning, not a failed build.

## Extending the project

Keep game metadata and client code in `games/<game>`, authoritative rooms on the server, and engine-independent contracts in `packages/shared`. The web app owns routes, connection lifetime, and application UI. Add a game through those existing boundaries; extract shared UI or game helpers only when another implementation actually needs them. Server validation must remain authoritative even when forms validate locally.

This is a single-process, in-memory multiplayer foundation. Room codes are reserved within that process and rooms disappear on restart. Multiple server processes will require coordinated matchmaking/code allocation and an explicit reconnection strategy; no such deployment capability is claimed here.

## Intentionally deferred

Brawl-like, Blackjack Party, and Poker Party (2–6 players) are visual grid samples only, with illustrative player counts and generated artwork. They share card expansion and hover behavior but do not open rooms or register games on the server.

Additional languages, dictionary moderation, scoring beyond lives/winner, authentication, Supabase, friends, chat, working leaderboards/account settings, matchmaking queues, server-side persistence, recorded statistics, reconnection/resume, multi-process coordination, and production deployment. Browser-local profile preferences and empty stats previews are already implemented. No Redis, Docker, custom framework, or state-management library is included.
