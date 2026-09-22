# UI polish implementation — 21 September 2026

Implemented the visual/UX audit following the user's approval, with special attention to excess side gutters. Preserved the existing BUT.io palette, typography, artwork, and unrelated working-tree changes. No new dependencies, commits, deployment, backend rules, or authentication changes.

## Changes

- Fluid shared shell: 3vw gutters (24–72px), up to 1920px of content; removed competing lobby, locker, community, and invitation width caps. Four desktop game columns, two tablet columns, and compact horizontal phone cards.
- Stable game order and a compact shared action tray. Direct join-by-code entry; no invisible reserved field. Closing restores focus; reopening game selection after direct join starts in create mode.
- Shared native modal drawer for Settings and Social: initial focus, inert background, Escape, trigger focus restoration, backdrop, scroll lock, and entrance/exit animation.
- Shared application/device reduced-motion preference for Motion, CSS, programmatic scrolling, avatar/game effects, and Tank renderer initialization. Removed perpetual game-card ray rotation.
- Tank Arena retains Phaser with responsive HTML action, angle, power, Ready, and timer controls. Desktop sidebar preserves arena space; phone controls sit below it. Controls remain stable during resolution and disabled after confirmation. Renderer import failures offer a visible retry.
- Poker settings, actions, hints, hand names, errors, and results use English/French copy. Added homepage tagline and ante/multiplier guidance. Settings follow readiness and use Poker's violet accent.
- Card tables use available width and adapt to short desktop height, preserving card separation and keeping actions visible. Short screens hide redundant header/rules decoration.
- Lobbies show connected players and an invite affordance instead of empty seat rows. Readiness copy reflects state. Results lead on phones and show the winner's avatar.
- Locker has a shorter mobile preview, actual avatar/frame previews, actionable sign-in links, and browser-storage save feedback. Extended existing profile tests for save success/failure.
- Community entry copy reflects the feature, explains tracking coverage, and uses one navigation model consistent with the URL. Desktop account gates use two columns.
- Bomb Party word entry has clearer help and an emphasized input. The 404 page offers a clear home action.

## Verification

- Production build and workspace typecheck passed.
- Full suite passed: 91 tests (7 shared, 8 web, 76 server). Updated profile assertions also passed separately.
- Browser checks: home/selection/direct-join validation; Settings and Social focus/Escape; app reduced-motion toggle; desktop/mobile locker and cosmetic previews; signed-out community entry; 404 recovery; English/French Poker lobby and play; short desktop Blackjack; two-client Tank play with keyboard range changes and server-confirmed plan locking; Tank departure result.
- Viewports include 390×844, 1280×720/900, 1920×1080 and 2560×1440. At 2560px content is 1920px wide with no horizontal overflow. At 1280×720 both card-game docks fit within the viewport.
- Repository-wide formatting check reports pre-existing issues in untouched apps/web/src/settings.ts and games/bomb-party/src/server.ts. Changed files were formatted.

## Remaining verification limits

Authenticated community contents and cosmetic transactions, full-capacity card tables, real touch hardware/software keyboards, system-level reduced-motion emulation, renderer network-failure simulation, and production performance were not re-tested. Main/Phaser bundle-size warnings remain outside this visual pass.

Local Letta tools were unavailable; no external memory update was persisted. This file holds the compact current state. Development server remains available for local review.

## Follow-up: restore card expansion

The user preferred the original expanding-card animation and visual treatment over a separate action tray. Restored the selected card expanding across the grid, promoting it to the first position, and revealing the form inside its colored surface. This supersedes the stable catalog/action-tray decision above. Kept fluid page spacing, compact form height, the direct Join shortcut, mobile stacking, reduced-motion support, and focus restoration. Verified create/join switching, Escape dismissal, and no horizontal overflow at 390px.

## Follow-up: expand on the current row

The user wants the expanding card to stay on its current row instead of moving to the top. Removed the selected-first catalog sort. The card now spans the row it occupied when clicked, with preceding rows remaining above it, including when switching between expanded cards. Responsive width changes recalculate the row; phones keep the catalog's natural order. Verified second-row opening, switching to the third row, mobile ordering/overflow, and web typecheck.

## Follow-up: use the collapsed catalog row

Switching cards now derives the expansion row from the selected game's original catalog index and the responsive collapsed column count. This supersedes measuring the temporary row while another card is open: Blackjack and Poker replace each other on row two in the two-column layout. CSS owns the column count, and resizing updates it through ResizeObserver. Existing expansion animation is preserved. Verified both switch directions, desktop row one, phone order, and no horizontal overflow; web typecheck passed.
