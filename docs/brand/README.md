# Feeder: Family Pot master art

The symbol is a casserole pot with a heart for its lid knob. Every shape is a plain filled path: no strokes,
no filters, no text. Each SVG keeps the symbol in `<g id="symbol">`; the horizontal logos keep the wordmark
(Figtree Bold, outlined) in `<g id="wordmark">`.

## Files
The master art is in `master/`; the web icons ship from `web/public/`; `web/` here keeps the manifest and head snippets they came with.

- `master/mark.svg`, `mark-dark.svg`, `mark-mono.svg` (uses `currentColor`): the symbol on transparent, 512 box.
- `mark-small.svg`, `mark-small-mono.svg`: the simplified symbol for anything drawn below 48 px
  (one solid lid, wider lid gap, larger heart, chunkier handles).
- `logo-horizontal.svg`, `logo-horizontal-dark.svg`, `logo-horizontal-mono.svg` (`currentColor`).
- `print/`: the same art with physical sizes (mark 100 mm, logo 200 mm wide). Vector, so any size works;
  the smallest gap in the art is 16/512 of the mark (over 1/64).

## Colours
| Use | Hex | OKLCH |
|---|---|---|
| Basil (brand, icon background, mark on light) | `#34724e` | `oklch(50.0% 0.087 155.9)` |
| Apricot (heart on light) | `#e0763a` | `oklch(67.7% 0.151 47.7)` |
| Mint (mark on dark) | `#89c8a0` | `oklch(77.9% 0.086 156.0)` |
| Light apricot (heart on dark) | `#f4a36b` | `oklch(78.4% 0.120 54.7)` |
| Cream (pot on the icon) | `#fff4e6` | `oklch(97.2% 0.022 74.1)` |
| Icon heart | `#f6a26a` | `oklch(78.4% 0.123 53.7)` |
| Wordmark on light / one-colour | `#173a28` | `oklch(31.6% 0.052 158.9)` |
| Wordmark on dark | `#eef5f0` | `oklch(96.3% 0.010 155.1)` |
| iOS dark appearance: pot | `#9ad8b0` | `oklch(82.9% 0.085 155.8)` |
| iOS dark appearance: heart | `#f6ad78` | `oklch(80.6% 0.110 56.4)` |

## Clear space and minimum size
- Clear space: keep a margin of at least **H/4 on every side**, where H is the height of the pot symbol
  (lid-heart tip to pot base). In the horizontal logo the same H/4 applies around the whole lock-up.
- The heart's own height (about H/6) is the minimum gap between the symbol and the wordmark; the master
  logo already uses it.
- Minimum size: the symbol at 16 px on screen (use `mark-small.svg` below 48 px), 6 mm in print;
  the horizontal logo at 80 px / 20 mm wide.
- One colour: use `mark-mono.svg` / `logo-horizontal-mono.svg` in basil, wordmark green, black or white only.
