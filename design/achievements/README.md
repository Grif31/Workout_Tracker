# Achievements design source

The plan is TODO.md §27. This folder is the design behind it: badge art, the Trophy Hall, track ladder, badge back, share card, unlock moment, the Your Journey redesign and the profile frames. Phase 2 (`AchievementBadge.tsx`) and the frames redesign (`ProfileAvatarFrame.tsx`) port their geometry from here. Not shipped in the app.

## Where things live

- `canvas/Badges.dc.html` is the source of truth for badge art. Its script holds every shape (`SH`), icon (`IC`), engraved detail (`DETAIL`), finial (`EXTRA`), the tracks and their thresholds (`TRACKS`, `HIDDEN`, `PLATES`), the metal tiers (`MT`, `BAND`) and the generated layout (`ICT` icon transforms, `STY` stamp heights, `BANDS` key bands, `SHAPED_CROWNS`). Its `<defs>` hold the metal gradients: face `m-*`, rim `r-*`, ink `i-*`, icon ink `j-*`, plus `gloss` and `spec`.
- The other `canvas/*.dc.html` files are the screen mocks. Hall, Track and Journey are generated from the sheet (below), so their badges always match it. `canvas.json` is the canvas index.
- The mocks are Design-canvas artboards: an `<x-dc>` template with `{{holes}}` and `<sc-for>` loops, filled by the `renderVals()` script at the bottom. `support.js` and the `/_blob/...` logo come from the hosted canvas and don't load locally; `tools/render_dc.js` fills the holes so a page opens in a plain browser.

## Tools

Run from `tools/` after `npm ci` (clipper-lib, for the even band offsets).

| Script | What it does |
|---|---|
| `layout.js <sheet>` | Builds each shape's key band (a true 4.5-unit inset, rounded joins) and solves the stamp (as low as fits) and icon (as large as fits above it), keeping a gap from the band. Writes `layout.json` |
| `splice.js <sheet>` | Writes `layout.json` back into the sheet's `ICT` / `STY` / `BANDS` block |
| `crown.js` | Olive crowns that follow each non-round outline. Writes `crowns.json`; copy an entry into `SHAPED_CROWNS`. Reads `bbox.js` from the working directory |
| `audit.js <sheet>` | Clearance report: band evenness and room around icon, stamp and labels |
| `gen_hall.js <sheet> <out>` | Trophy Hall artboard |
| `gen_track.js <sheet> <out>` | Track ladder, Plates and the locked-badge flip |
| `gen_journey.js <sheet> <out>` | Your Journey redesign, score button closed and open |
| `gen_frames.js <out> [options-out]` | Profile frame sheet; with a second path, the Demigod ornament options. `REVIEW=<out>` writes every frame at hero, 72 and 44 px on dark, light grey and white with measured reach (`ONLYR=5,6` limits the ranks) |
| `export_rn.js <sheet> <out.ts>` | Writes the sheet's shapes, bands, icons, crowns, metals and each outline's room for back text to the app's `constants/badgeArt.ts`. Rerun after any sheet change; never edit that file by hand |
| `render*.js` | Plain-HTML renders of badges or artboards for screenshots (`ONLY`, `SIZE`, `COLS` env vars on `render.js`) |

After changing a shape or icon: `node layout.js ../canvas/Badges.dc.html && node splice.js ../canvas/Badges.dc.html`, then `node export_rn.js ../canvas/Badges.dc.html ../../../src/workout-tracker-native/constants/badgeArt.ts`, then regenerate the screens that show it. Check by rendering, e.g. headless Chrome: `chrome --headless=new --screenshot=out.png --window-size=W,H file:///.../page.html`.

## Rules the geometry follows

- A badge is a 64-unit box drawn in `viewBox="-8 -8 80 80"`; a frame is a 120-unit box (`-10..110`) around a photo of radius 36, and nothing may reach past 60 from the centre.
- No SVG filters anywhere: depth is gradients plus offset copies (dark below-right, light above-left), so everything ports to react-native-svg.
- The top tier is marble in an olive crown, never the PR laurel.
