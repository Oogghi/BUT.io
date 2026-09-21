# Generated visual assets

Generated with the built-in image-generation tool on 2026-09-18. These are decorative transparent PNGs; text, controls, interface icons, and backgrounds remain code. The final edits simplify texture in response to visual review.

## Placeholder games

Outputs: `apps/web/public/images/tank-arena.png`, `brawl-like.png`, and `blackjack-party.png`.

Generated separately with the existing bomb illustration as a style reference. Shared direction: soft matte 3D, broad highlights, minimal texture, clear centered silhouettes, true transparent backgrounds, no text, UI, scenery, or glow.

- Tank Arena: chunky forest-green and mint toy tank with rounded tracks, short cannon, three-quarter view.
- Brawl-like: original amber starburst character, dark navy eyes, small confident smile, slightly tilted.
- Blackjack Party: two ivory cards, navy spade and coral heart, one navy poker chip with mint edges; no letters or numbers.

These illustrations are layout placeholders, not gameplay assets.

## Poker Party

Output: `apps/web/public/images/poker-party.png`. Generated with the built-in image-generation tool, using Blackjack Party as a style reference.

Prompt:

Create ONE isolated game-card illustration for Poker Party: a compact stack of chunky poker chips, primarily deep navy with ivory edge segments and a few coral chips, with one large mint chip leaning against the front showing a simple navy spade symbol. Chip stack is the dominant silhouette; no playing cards. Premium soft matte 3D style, rounded edges, broad gentle highlights, minimal texture, clear readable silhouette, playful and polished. Match the supplied Blackjack illustration's sculpted materials and visual weight; supplied image is STYLE REFERENCE ONLY, not an edit target. Centered three-quarter view with comfortable padding. True transparent alpha background. No letters, numbers, text, currency symbols, UI, branding, floor, scenery, glow or extra objects. Square image.

## Blackjack card back

Output: `apps/web/public/blackjack-party/card-back.png`.

Unlike the game-card illustrations above this is an in-game asset, drawn at roughly
64×90 px on the table and as a 34×20 px sliver in the discard tray. It has to read as a
card back at that size, so the motif stays flat, bold and low-detail rather than
sculpted 3D. Portrait 1:1.4 to match the card, ~500×700, opaque (it fills the card).

The current file is a supplied design (green panel, gold rule, red club medallion,
hearts and diamonds), not generated from the prompt below. It arrived as a 1054×1493
WebP on a solid black margin, so it was cropped to the card itself (844×1205 at
105,123 — the white border then sits at the card edge), scaled to 500×700, and reduced
to a 64-colour palette with no dithering, which suits flat art: 77 KB, down from the
2.1 MB original. To reprocess a replacement:

```bash
ffmpeg -i in.webp -vf "crop=W:H:X:Y,scale=500:700:flags=lanczos,palettegen=max_colors=64:stats_mode=full" palette.png
ffmpeg -i in.webp -i palette.png -lavfi "crop=W:H:X:Y,scale=500:700:flags=lanczos[x];[x][1:v]paletteuse=dither=none" card-back.png
```

Prompt, for generating one from scratch:

Create ONE playing-card back design, flat cartoon style, filling the whole image edge to edge with no transparency. Deep navy background (#0e2332) with a slightly lighter navy inner panel (#153247) inset behind a clean rounded border. Centered motif: one simple bold spade, drawn as a flat cartoon shape in warm gold (#ffc43d), with a small coral (#ff6b4a) diamond above it and a small mint (#45dcae) diamond below it, all on the vertical centre line. Thin ivory (#f4f7fa) double outline following the card edge. Flat vector cartoon look with clean even fills, soft rounded corners on every shape, no gradients, no grain, no gloss, no bevels, no drop shadows. Extremely simple and high contrast so it still reads at thumbnail size. Perfectly symmetrical top to bottom. No letters, numbers, text, pips in the corners, faces, scenery or branding. Portrait card proportions, 500×700.

## Bomb

Output: `apps/web/public/images/bomb.png`

Mode: initial generation, then reference-image edit.

Initial prompt:

Use case: stylized-concept. Asset type: one isolated game-card illustration. A charming premium 3D navy-black spherical cartoon bomb with a short curved woven fuse and one small warm golden spark. Slight three-quarter view, rounded sculptural forms, soft blue edge lighting, matte finish, no face, no text. Clean polished playful app illustration, restrained detail and no neon effects. Centered with ample margin on a truly transparent alpha background; no backdrop, no rectangle, no glow, no ground, no other objects. Fits a dark muted terracotta game card.

Final edit prompt:

Edit this bomb illustration only. Preserve its navy round silhouette, curved golden fuse, small golden spark, composition and transparent alpha background. Strongly simplify the materials: smooth matte clay surface, broad clean shading, no grain or pores. Replace intricate braided rope texture with one simple smooth curved cord. Simplify the spark to a small warm five-point star with no white glare, no particles or neon rim glow. Refined low-detail 3D game-card illustration, not photorealistic, no text or new objects.
