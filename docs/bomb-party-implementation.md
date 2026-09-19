# Bomb Party gameplay contracts

The Colyseus room owns membership, host controls, synchronization and timers. `games/bomb-party/src/server.ts` owns game rules and the local French dictionary. React owns forms, accessible game status and the circular player table. Phaser presents the bomb with its Canvas 2D renderer, avoiding a WebGL requirement. Neither client controls timeouts or validation.

`BombArena` keeps seats fixed for each round, dims eliminated/departed players, and rotates the arrow toward the authoritative active player. The prompt stays accessible in the DOM. Existing avatars, player popovers and bomb artwork are reused. A DOM bomb is visible while Phaser loads and remains if loading fails; it is replaced only when the scene is ready. Leaving/results destroys the canvas. A server explosion briefly shakes that player's avatar and sends a heart upward, including the final elimination in the results list. Departures do not trigger these effects. Motion respects reduced-motion preferences.

During play, the header compacts and the board uses a wide ellipse whose height follows the laptop viewport. Two-player rounds use larger, facing seats on desktop and a vertical arrangement on mobile; a CSS rotation keeps the arrow aligned without changing turn order or remounting word entry. Larger groups retain the circular arrangement. The bomb, heart counts and active seat provide the focal points; the timer stays hidden. On narrow screens the table stays taller with readable names and touch-friendly word entry.

Word entry is plain text beneath the active player's avatar. A borderless native input preserves accessibility, selection, accents/IME and mobile keyboard support. It focuses on turn start; typing from the page resumes entry without a click, while shortcuts, other editable controls and open popovers keep their keyboard behavior. Enter submits (mobile uses the keyboard's send key). Drafts stay local. Each player's last accepted word is synchronized by the server and remains beneath their seat between turns; it resets with the round.

A server rejection clears the local entry and keeps it focused for another attempt. Word lines participate in each seat's layout instead of hanging outside its bounds. Avatar/type sizing follows the arena container, crowded tables gain vertical space on narrow screens, and the shorter turn arrow leaves clearance before the seats and their words.

## Turns and words

Players take turns in join order, skipping eliminated players. Only the active player can submit `word: { word, turnId }`. Turn IDs reject delayed submissions from earlier turns. The server checks the deadline before validating a submission, so an overdue timer callback cannot let a late word through.

Words must be in the local dictionary, contain the current prompt, and not have been accepted earlier in the round. Case, accents, œ/æ, hyphens and apostrophes are folded; equivalent spellings count as the same used word. Spaces and other punctuation are rejected. The [dictionary README](../games/bomb-party/data/README.md) documents the source, license, coverage and reproducible import. It includes inflected forms and is not a moderation list.

Accepted words advance the turn and select a fresh prompt immediately. **Prompt age counts explosions only**, as confirmed by the user. Invalid submissions do not age a prompt or reset time. Explosions keep the current prompt until its age reaches the configured limit, then select another. Prompt selection excludes fragments with no unused answers; complete exhaustion ends in a draw.

Difficulty is based on distinct dictionary answers per fragment: easy uses 2–3 letters with at least 1,000 answers; normal uses 3 letters with 100–999; hard uses 3 letters with 10–99. A depleted difficulty pool falls back to another answerable fragment.

## Server timer

Time uses the server's monotonic `performance.now()`. A new bomb starts with the configured minimum plus a random 5–15 seconds. Passing the bomb preserves that shared fuse; each new turn's deadline is `max(sharedFuseDeadline, turnStart + minimum)`. An explosion resets the fuse, costs the active player one life, and advances the turn. This is an explicit implementation choice, not a claim about JKLM's exact random distribution.

Colyseus schedules one timeout at the authoritative deadline and checks time again when it fires. Every accepted word, expiration and departure updates synchronized state. The timer is deliberately hidden: no countdown, progress ring or client ticking loop. Only the server causes an explosion.

At zero lives, players are eliminated but remain connected as spectators. The last living player wins automatically. Leaving/disconnecting eliminates that player; an active departure advances with minimum protection. Timers are cleared on results, return and disposal. Returning retains settings and resets the round, readiness, words, lives and bonus progress.

## Settings and bonus letters

Settings are full, atomic, host-only updates in the lobby. Invalid fields reject the entire update. A change resets everyone's readiness. Guests can inspect settings; settings are frozen from countdown through results.

| Setting             | Default    | Supported values                       |
| ------------------- | ---------- | -------------------------------------- |
| Dictionary/language | French     | `fr` / local Lexique 4 only            |
| Difficulty          | Easy       | easy / normal / hard                   |
| Minimum turn        | 5 seconds  | 1–30 seconds                           |
| Maximum prompt age  | 2 failures | 1–20 failures                          |
| Starting lives      | 2          | 1–10, no greater than maximum          |
| Maximum lives       | 3          | 1–10                                   |
| Maximum players     | 8          | 2–8, not below connected players       |
| Bonus alphabet      | A–Z        | Up to 26 ASCII letters; empty disables |

Letters are deduplicated and lowercased. Each player's accepted words accumulate only configured bonus letters. Completing the alphabet awards one life up to the maximum and resets that player's progress, including when already at the cap.

## Verification

`pnpm test` covers dictionary acceptance, invalid/missing-prompt/reused words, stale turns, overdue messages, expiration, life loss, elimination, winner selection, bonus rewards/cap/reset, failure-based prompt age, minimum-protected shared fuse, departures, settings validation/capacity and repeated rounds. Deterministic engine tests use injected time/randomness; room integration tests use real WebSocket clients and the real server timer.

Browser checks exercise two clients, settings synchronization, accepted/rejected words, bonus life, expiration/results/return, responsive controls and Phaser mount/disposal. TypeScript, formatting and production build are checked separately.

Additional games, languages, persistence, reconnection, accounts and production infrastructure remain deferred. Existing visual assets and application structure are preserved; no JKLM artwork or UI is copied.
