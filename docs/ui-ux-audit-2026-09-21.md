# BUT.io visual and interaction audit

Reviewed 21 September 2026 against the current local working tree. This records the original audit and proposal. Subsequent implementation and verification are recorded in [ui-polish-state.md](ui-polish-state.md).

## Coverage and limits

- Browser review: home, all four expanded game cards, create/join controls, invitation pages, invalid-code validation, Settings, social/auth drawer, locker, signed-out community routes, and not-found page.
- Game review: all four lobbies and gameplay entry states; two local clients for Bomb Party and Tank Arena; Bomb Party departure/result state.
- Mobile screenshots at 390 × 844: home, Settings, social/auth drawer, locker, Poker, Bomb Party, and Tank Arena. Desktop screenshots were around 1260–1280 × 712–720.
- Source review: shared navigation, motion, settings, forms, community views, cosmetic controls, gameplay presentation, and result components.
- Not verified: authenticated friends/groups/statistics/leaderboards, purchasing or equipping cosmetics, populated full-capacity games, all card-game action/result states, touch hardware, the mobile software keyboard, or production performance. Findings about those unvisited states are explicitly source-based.
- Existing uncommitted application changes were preserved. Project memory tools were unavailable, so no memory update was made.

## Design direction to preserve

The Bricolage Grotesque typography, blue night background, saturated game artwork, friendly avatars, and raised controls already form a recognizable identity. Preserve that vocabulary. The opportunity is to make the important action easier to find, reduce competing movement, and finish the small interactions consistently.

## Prioritized findings

### 1. High: Tank Arena needs usable mobile controls

**Observed:** At 390px wide, the entire landscape game scales into a roughly 366 × 206px strip. The timer, labels, ability icons, and Ready button shrink with it, leaving most of the phone screen unused. The browser accessibility tree exposes an image and status text, rather than the visible ability controls.

**Improve:** Keep Phaser for the arena, but move the timer, action picker, aim/power controls, and confirmation into responsive DOM controls. The existing React component already owns the selected action and aim. Make portrait play deliberate: readable arena area, a stable control dock, and an optional landscape suggestion. Use approximately 44–48px touch targets as a product design target.

**Source:** `apps/web/src/TankArenaPlay.tsx` (state, handlers, canvas host), `apps/web/src/style.css:5408` (fixed arena ratio), `games/tank-arena/src/client.ts` (canvas HUD).

**Acceptance:** At 390 × 844, a player can identify the selected ability, read the countdown, adjust aim, and confirm without zooming. Each action is focusable and named for assistive technology.

### 2. High: Finish drawer behavior before adding drawer effects

**Confirmed:** Opening Settings leaves focus on the background Settings trigger. Escape does not dismiss it. Pressing Tab moves focus to Bomb Party behind the drawer. Closing with the close button leaves focus on the document. The social drawer has the same basic overlay structure, with no focus-management implementation in its component.

**Improve:** Give Settings and Social one shared drawer shell. If it blocks interaction with the page, use modal behavior: focus inside on open, contain keyboard focus, make the background inert, close on Escape, restore focus to the trigger, and manage background scrolling. A native `dialog` is worth considering before adding a dependency. Keep visible, comfortably sized close controls.

**Motion detail:** Drawers currently animate in with CSS, then disappear immediately because the component returns `null` when closed. Add a short exit that completes before unmounting. A lightly dimmed backdrop would make the modal relationship clearer; the current backdrop is transparent.

**Source:** `apps/web/src/SettingsPanel.tsx:23`, `apps/web/src/CommunityView.tsx:235`, `apps/web/src/style.css:376`.

**Acceptance:** Keyboard users can open, use, and dismiss either drawer without reaching hidden background controls, and focus returns to the original trigger. See the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### 3. High: Make Poker language and onboarding consistent

**Confirmed:** English navigation leads to French Poker settings and gameplay labels: “Choisis ta table,” “Manches,” and “Miser.” Its description refers to a yellow table although the playing surface is blue. Poker's expanded homepage card also lacks the tagline shown for the other games: the `gameTaglines` lookup has no Poker entry.

**Improve:** Move Poker settings, actions, help text, and results into the existing English/French dictionary. Add a brief explanation of Ultimate versus Hold’em and the next required action. Distinguish session chips from the persistent coin balance visually and in copy where necessary.

**Source:** `apps/web/src/PokerSettings.tsx:24`, `apps/web/src/PokerPlay.tsx:642`, `apps/web/src/PokerResults.tsx:32`, `apps/web/src/EntryForm.tsx:319`, `apps/web/src/i18n.ts:400`.

**Acceptance:** Selecting English or French produces one consistent language through selection, settings, play, and results. Every game has a useful introductory line.

### 4. Medium: Stabilize game selection and tighten the expanded card

**Observed:** Selecting Poker moves it from the second row to the first, expands it across the grid, moves the other cards, and can scroll the page. The create state has a conspicuous empty band between the mode switch and primary action. Source confirms that the hidden join-code field deliberately reserves this space.

**Improve:** Preserve catalog order and reveal options beside or below the selected card, or use a stable detail area. Keep the art-led cards, but make the form content-driven rather than reserving an invisible field. Animate only the selected expansion with a restrained ease. Provide a direct “Join with code” entry near the game heading so a returning invitee need not choose a game first.

**Source:** `apps/web/src/EntryForm.tsx:65`, `apps/web/src/EntryForm.tsx:75`, `apps/web/src/EntryForm.tsx:397`, `apps/web/src/GameCard.tsx`.

**Acceptance:** Selecting or closing a card does not unexpectedly reorder the catalog; create mode has no unexplained blank area; keyboard focus remains predictable.

### 5. Medium: Give mobile home more room for games

**Observed:** The profile block and four tall shortcut tiles occupy much of the first mobile viewport. At 390px wide, the initial screen shows only Bomb Party, with the remaining games below it.

**Improve:** Use a compact mobile profile row, shorten shortcut labels where possible, and reduce their vertical footprint. Consider shorter horizontal game cards on phones. Keep the larger artwork on desktop. Make the editable display name more explicit with a quiet label or edit affordance.

**Source:** `apps/web/src/EntryForm.tsx`, `.hero`, `.profile-actions`, `.game-card`, and mobile rules in `apps/web/src/style.css`.

**Acceptance:** The first phone viewport exposes more than one game without making names or controls cramped.

### 6. Medium: Rebalance lobby setup around the next action

**Observed:** Empty seats dominate a one-player lobby. Tank selection and map voting sit below this large roster; the first desktop viewport does not show them. Poker places a large settings panel before readiness, while Blackjack places settings below the roster. “Everyone ready.” appears even when zero players are ready; it is a requirement, but reads like a status.

**Improve:** Show connected players plus a compact capacity/invite affordance instead of giving every empty seat equal weight. Bring the selected tank and map summary near readiness. Standardize the order of player setup, essential settings, and Start. Replace generic requirement copy with derived guidance: “Invite one more player,” “Mark yourself ready,” “Waiting for Alex,” or “Everyone is ready.”

**Source:** `apps/web/src/LobbyView.tsx:307`, `apps/web/src/LobbyView.tsx:456`, game settings components.

**Acceptance:** A new host can see what prevents starting and reach essential setup without scrolling past empty placeholders.

### 7. Medium: Keep card-game instructions and actions visible

**Observed:** At the reviewed desktop height, Poker's main betting action and Blackjack's betting hint/action fall below the initial viewport while a large area of table felt remains visible. Poker initially presents a disabled “Miser 0” with little visible explanation. Its mobile layout makes the action more visible, but the chip spots remain subtle.

**Improve:** Reserve space for a persistent action dock and size the table to the remaining viewport height. Put a short, state-specific instruction by the actionable controls. Offer explicit amount selection on touch instead of depending on hover discovery of quick bets. Keep the local player's controls visually stronger than decorative table details.

**Source:** `apps/web/src/BlackjackPlay.tsx`, `apps/web/src/PokerPlay.tsx`, `.bj-felt`, `.bj-dock`, `.bj-quick-bets` in `apps/web/src/style.css`.

**Acceptance:** At a 1280 × 720 desktop viewport and common phone sizes, the current instruction, timer, and required action are simultaneously visible. Verify again with full tables and split hands.

### 8. Medium: Make the locker preview useful and its sign-in prompt actionable

**Confirmed:** On mobile, the large avatar preview pushes the actual avatar controls below the first viewport. Cosmetic cards show color swatches, not the frame on an avatar. “Sign in to unlock” is plain text both above and inside the cards.

**Improve:** On phones, place a smaller live preview beside the name and avatar selection. Let users preview a frame on that avatar without purchasing. Provide one clear sign-in action that returns to the locker. Show a brief change confirmation; the current “Saved on this browser” label is permanently present rather than tied to a successful save.

**Source:** `apps/web/src/LockerView.tsx:220`, `apps/web/src/LockerView.tsx:233`, `apps/web/src/profile.ts`.

**Acceptance:** Users can understand a cosmetic's actual appearance and reach sign-in from the same screen. Do not claim a save succeeded when browser storage failed.

### 9. Medium: Unify motion preferences and reduce idle movement

**Source-confirmed:** The in-app Reduce motion preference configures `MotionConfig`, but CSS animations are gated by the operating-system media query. Components use `useReducedMotion()` for device preference, and Tank Arena checks `matchMedia` directly. Thus the in-app preference does not govern all CSS, scrolling, and canvas motion. Card sunbursts rotate indefinitely in the current stylesheet.

**Improve:** Derive one effective preference from the app setting and device preference, expose it to CSS and imperative renderers, and use it for programmatic scrolling. Keep calm fades for reduced motion. Reserve movement for selection, turn changes, card reveals, and meaningful rewards; stop idle rays or use a one-time entrance. As a starting point, use roughly 120–160ms for press/feedback and 180–240ms for small panels, then judge the actual interaction rather than treating durations as rules.

**Source:** `apps/web/src/App.tsx:269`, `apps/web/src/EntryForm.tsx:75`, `apps/web/src/style.css:1364`, `apps/web/src/style.css:5367`, `games/tank-arena/src/client.ts:191`.

**Acceptance:** Either preference produces the same calm experience in React, CSS, scroll behavior, and Phaser. [MotionConfig](https://motion.dev/docs/react-motion-config) controls child Motion animations; [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) reads the device setting. Neither replaces application wiring for CSS or canvas effects.

### 10. Medium: Explain community features before the account gate

**Observed:** Stats, leaderboard, friends, and group entry surfaces lead signed-out users into essentially the same authentication form. The supporting guest text discusses group membership even on statistics pages.

**Improve:** Use context-specific entry copy and previews: what gets tracked, what the leaderboard ranks, or how a group stays together. Make guest versus account benefits explicit. If public leaderboard browsing is desired, assess data permissions first rather than merely removing the UI gate.

**Source-only follow-up:** Authenticated arena pages render both the main four-link community navigation and another Stats/Leaderboard switch. Simplify to one clear navigation model. Stats cards and leaderboard filters currently list three games and omit Poker; either explain that coverage or finish it when tracking is supported.

**Source:** `apps/web/src/CommunityView.tsx:119`, `apps/web/src/CommunityView.tsx:159`, `StatsFeature`, `LeaderboardFeature`.

**Acceptance:** Each entry surface explains its own value and limits. Current navigation agrees with the URL, and unsupported tracking is clear.

### 11. Polish: Strengthen gameplay input and outcome hierarchy

**Observed:** Bomb Party makes the active player clear, but the mobile word input appears as a small “TYPE…” label below the avatar. Its departure result returns to a large roster beside a smaller generic checkmark/winner panel.

**Improve:** Give mobile word entry an unmistakable tap target and a concise instruction mentioning French words and Enter. Validate with the software keyboard open. Make results lead with the winner's avatar and outcome, followed by a compact useful summary and replay action. Use a quiet departure outcome when other players leave; reserve celebration for a completed competitive round.

**Source:** `apps/web/src/BombPartyPlay.tsx`, `apps/web/src/BombArena.tsx`, `apps/web/src/LobbyView.tsx:421`, result components.

**Acceptance:** A first-time phone player knows where to type and how to submit; the result is the first thing people notice after a round.

### 12. Polish: Make loading, errors, and empty pages feel complete

**Observed/source:** Invalid join-code validation already focuses the correct field and provides a specific message. Community loading/error components are plain text. The not-found page consists of a heading and a low-emphasis home link. Tank renderer load failure is logged to the console without a visible retry state.

**Improve:** Preserve the existing good field validation. Add stable loading placeholders where content substantially changes height, visible recovery actions for failed loads, and compact empty states that point to the next action. Give the not-found page the existing illustration/icon vocabulary and a recognizable home button. Avoid inventing new decorative components for each state.

**Source:** `apps/web/src/CommunityView.tsx:1066`, `apps/web/src/TankArenaPlay.tsx`, catch-all route in `apps/web/src/App.tsx`.

## Suggested implementation order

1. Correctness and access: drawer behavior, Poker localization, shared motion preference.
2. Mobile usability: Tank controls, card-game action visibility, compact home and locker layouts.
3. Journey clarity: stable selection, direct code entry, readiness guidance, actionable locker sign-in.
4. Finishing pass: contextual community entry states, outcomes, loading/retry states, restrained feedback animation.

Keep these as focused changes using the current React, Motion, and CSS setup. Reuse one drawer shell and a few motion tokens where there is real duplication; avoid a wholesale component-system rewrite. For each change, check the affected flow with keyboard input, 390px mobile, a short desktop viewport, both languages, and both reduced-motion sources. Multiplayer presentation changes also need two-client checks.
