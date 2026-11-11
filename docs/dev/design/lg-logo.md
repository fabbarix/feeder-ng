# LG: Family Pot logo and app icons (design note)

The user chose "Family Pot": a casserole pot with a heart for its lid knob. This task replaces the old two-circles favicon with the pot across the browser tab, the installed PWA, and the signed-out pages. Wiring only; no GLOSSARY, CHANGELOG, spec, `app/nav.ts`, shell, `ui/index.ts` or Gallery.

## What the test author left, and what the developer does

| Piece | State | Developer work |
|---|---|---|
| `web/public/*` icons (10 files) | copied, final | none |
| `docs/brand/` (README, `master/`, `ios/`, `android/`, `web/` snippets) | copied, final | none |
| `web/index.html` head | old: one `rel="icon"` svg link, boot-mark circles | use the snippet below; swap the boot-mark circles for the pot |
| `web/vite.config.ts` manifest and glob | old: one svg icon | five icons; glob adds `png,ico` |
| `internal/app/spa.go` | serves files with Go's types, no cache header | add `Cache-Control` rules below |
| `FeederMark.tsx` | plate and fork | inline Family Pot, mono |
| `strings`, pages | untouched | none |

Old tests rewritten by this commit: `web/src/app/favicon.test.ts` (head links, new favicon), `web/src/sw/manifestConfig.test.ts` (five icons), `internal/app/app_test.go` (the "no /favicon.ico" decision is reversed: browsers request it by name, and now it exists). New: `web/src/app/brandAssets.test.ts`, `web/src/features/signin/components/FeederMark.pot.test.tsx`, `internal/app/spa_icons_test.go`, and the icon loop in `scripts/test/precache_test.sh`.

## File locations

- Shipped icons live in `web/public/` (Vite copies them to `dist/`, `web/embed.go` embeds them, `spaHandler` serves them at the root): `favicon.ico` (16/32/48), `favicon.svg` (light and dark through `prefers-color-scheme`), `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png` (180, opaque), `icon-192.png`, `icon-512.png` ("any", transparent), `icon-maskable-192.png`, `icon-maskable-512.png` (opaque, full bleed), `safari-pinned-tab.svg`.
- Sources and native sets live in `docs/brand/`: `master/` (marks and the horizontal logo in light, dark and mono, `print/`), `ios/`, `android/`, `web/manifest-icons.json`, `web/head-snippet.html`, and `README.md` (colours, clear space H/4, minimum size 16 px; below 48 px use `mark-small`).
- Native sets are kept for a future wrapper; nothing in the build reads them.

## index.html head

Use `docs/brand/web/head-snippet.html` as is: `rel="icon"` for `/favicon.ico` (`sizes="48x48"`), `/favicon.svg` (`image/svg+xml`), `/favicon-32.png`, `/favicon-16.png`; `apple-touch-icon`; `mask-icon` (`/safari-pinned-tab.svg`, `color="#34724e"`); `manifest` (`/manifest.webmanifest`); `theme-color` `#e7f4eb` for light and `#090f0b` for dark. The existing theme-color metas, boot-paint style and `color-scheme` stay; do not duplicate the theme-color metas. The boot mark in `#root` (two circles) becomes the pot: the same inline SVG as `FeederMark`, 48 px, `currentColor`.

## Manifest (vite.config.ts, VitePWA `manifest.icons`)

Five entries, `purpose` never combined: `/icon-192.png` 192x192 any; `/icon-512.png` 512x512 any; `/icon-maskable-192.png` 192x192 maskable; `/icon-maskable-512.png` 512x512 maskable; `/favicon.svg` `sizes: 'any'` any. `theme_color` and `background_color` stay `#e7f4eb` (the app's light page colour; `docs/brand/web/manifest-icons.json` shows the same). `includeManifestIcons` stays `false`: the icons are listed once, through the glob.

## Precache

`injectManifest.globPatterns` becomes `**/*.{js,css,html,svg,woff2,png,ico}`, so all ten icon files are in `sw.js`, once each. `scripts/test/precache_test.sh` checks that each icon URL is present (and still that there are no duplicates). `classifyRequest` already treats icons as `static`; no `sw.ts` change.

## Go serving and caching

Content types: `.ico` is `image/x-icon` or `image/vnd.microsoft.icon` (Go's built-in table), `.svg` `image/svg+xml`, `.png` `image/png`, `.webmanifest` `application/manifest+json` (already registered). Register `.ico`, `.svg`, `.png` explicitly in `init()` so the result does not depend on the host's `/etc/mime.types`.

Cache-Control, by URL (these files are not hashed):
- `/manifest.webmanifest`: `no-cache` (install metadata must revalidate).
- the ten icon files above: `public, max-age=86400`. A new icon reaches users within a day; the service worker precache fetches with `cache: 'reload'` so an installed app updates on its next worker update regardless.
- `index.html` stays `no-cache`. Unknown paths with an extension still 404 (never the index).

## Sign-in and Access Request placement (Bento)

- Both pages already share `FeederMark`, rendered first inside the hero `Tile` (accent fill), centred above the `h1`. Keep that placement; only the art changes.
- Size 48 px, one mark per page: modest, a badge-sized accent in the tile, not a banner.
- The hero is the accent fill, where the basil colour mark would vanish. So the page uses `master/mark-small-mono.svg`-style one-colour art (`master/mark-mono.svg`, 48 px is the boundary; use `mark-mono`), with `fill="currentColor"` and `color: var(--color-on-accent)` from `.signin__mark`. That follows light and dark with no second asset and no hex in the component.
- Accessible name: inline `<svg role="img">` with `<title>Feeder</title>` (also `aria-labelledby` pointing at it is fine). The component copies the `<g id="symbol">` paths and the `0 0 512 512` viewBox from `master/mark-mono.svg`. No `<img>`, no network request, so the signed-out pages render the mark offline.
- Layout: no change to the tile grid or the 16 px gap; the page-layout guard must stay green (the mark is 48 px, as the old one was).
