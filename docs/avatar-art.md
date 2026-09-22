# Avatar expansion — 22 September 2026

## Result and rollout

Added six free SVG faces (Starry, Dreamer, Heart eyes, Cheeky, Mustache, Masked), for twelve free avatars total. Added four account-owned premium avatars purchasable with earned coins: Royal smile (120), Orbit buddy (160), Pocket wizard (140), Pixel pal (160).

The `avatar` equipment slot is independent of frames/card cosmetics/decals. Buying the first avatar auto-equips it; additional purchases preserve the current choice. Choosing a free face clears the account's paid avatar before saving the local fallback; failed resets preserve the current choice. Home previews refresh on equipment changes and clear for signed-out/different accounts. All games receive the server-verified numeric avatar; unowned or forged paid numeric IDs cannot be selected through a join payload.

Apply `20260921224407_premium_avatar_cosmetics.sql` after the earlier `20260921222011_game_cosmetic_slots.sql` migration before releasing the updated app/server. Neither migration has been applied to the hosted database by this task. No Git commit or deployment was made. The memory connector is unavailable; project notes are the durable handoff.

Validation: full workspace tests pass (85 server tests, including seven cosmetic integration tests), workspace typecheck passes, production build passes with the existing large-chunk warning. PGlite ran all seven migrations plus cosmetics/avatar/poker reward SQL regressions successfully. Browser checks passed desktop/390px mobile, purchases/equip/reset including failure preservation, all 12 free faces, premium artwork decoding/transparency, home preview refresh, sign-out fallback, account isolation, and four-column premium shop. Account browser tests used isolated mocks; SQL tests ran separately in PostgreSQL WASM. Screenshots/reports are under ignored `artifacts/cosmetics/`.

## Art delivery

Generated with the built-in image generation tool, one call per avatar. All four results fit the existing simple rounded-square mascot style, so no regeneration was needed for this set. Transparent alpha was retained; delivery copies were resized to 320×320 WebP, about 52 KB combined. Free avatars extend the existing editable SVG system.

Saved assets:

- `apps/web/public/avatars/royal-avatar.webp`
- `apps/web/public/avatars/astronaut-avatar.webp`
- `apps/web/public/avatars/wizard-avatar.webp`
- `apps/web/public/avatars/robot-avatar.webp`

The royal output was the style reference for the other three. Original generated PNGs remain in the tool's generated-images directory. Exact generation prompts follow.

### Royal smile

Production game avatar icon for BUT.io, a playful casual multiplayer web game. A single GOLDEN ROYAL mascot: a chunky yellow rounded-square face tile with a small three-point golden crown resting on top. Style is extremely simple clean vector-like cartoon: deep navy two vertical pill eyes, tiny curved smile, bold crisp outlines, broad flat saturated colors and only a little hard-edged lower shadow. Friendly geometric toy mascot, not human, no body. Crown has just one coral gem. Square 1:1 composition, centered big face taking 75% of canvas, generous margin so crown not clipped. Solid deep navy blue #0e2332 background, no floor, no scene, no lettering, no logo, no watermark. No realism, no metallic rendering, no ornate details, no gradients, no fuzzy texture, no 3D CGI gloss. Should blend with cheerful yellow/mint/sky/coral rounded-square SVG face avatars and remain readable at 32px.

### Orbit buddy

Create one sibling ASTRONAUT avatar matching this exact cheerful rounded-square mascot style, navy outline weight, simple pill eyes and tiny smile, same centered square icon scale and margins. Replace the yellow crowned mascot with a sky-blue rounded-square astronaut helmet, a large dark teal visor framing a mint face with two simple dark navy pill eyes and tiny smile. Small white earpieces, one small coral button; no crown. Thick navy outline, broad clean flat colors with only a little hard-edged bottom shadow, friendly casual game icon, no realistic rendering. Transparent background, no text, scene, glow, starfield, body or decorative sparkles. One mascot only, must be readable at 32px.

### Pocket wizard

Create one sibling WIZARD avatar matching this exact cheerful rounded-square mascot, same centered square composition, thick navy outline, simple pill eyes and tiny smile. Replace yellow face with lavender-purple rounded-square face. Replace crown with a simple navy/purple pointed wizard hat with bent tip, mint band and one gold star. Face big and readable. Broad clean flat colors with restrained hard-edged lower shadow; not realistic, no 3D CGI. Transparent background, no scene, text, glow, particles, body, wand, or decorative sparkles outside hat. One simple mascot only. At 32px the eyes and hat silhouette must still read.

### Pixel pal

Create one sibling ROBOT avatar matching this exact cheerful rounded-square mascot style, centered square icon scale and generous margin. Replace yellow crowned face with a coral-orange rounded-square robot head, thick navy outline and a large simple dark navy screen face showing two bright mint pill-shaped eyes and small mint curved smile. Tiny navy side ear knobs and ONE short antenna with a mint round tip. Two small simple screws at bottom corners. No crown. Broad clean flat colors, restrained hard-edged lower shadow, not realistic or detailed. Transparent background, no floor, scene, text, logos, body, sparks or glow. One friendly mascot only, legible at 32px.
