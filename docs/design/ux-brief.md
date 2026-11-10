# Feeder: UX brief

Inputs for the UI/UX proposals. Domain terms are defined in [GLOSSARY.md](../../GLOSSARY.md).

## Mood
- **Calm base, playful moments.** Neutral, airy layouts; colour and character are spent on chips, toggles, illustrations and small celebrations.
- **Adults only.** No kid-facing UI; adult literacy and density are assumed.

## Visual language
- **Type:** rounded geometric sans (Nunito or Figtree class), with tabular numerals for timers and quantities.
- **Colour:** accent-tinted everything (Material You style). Each User's accent generates tonal light and dark palettes, and every surface takes a tint from it. Contrast is checked against WCAG AA. Status colours (spoiling soon, leftover) are reserved and are not derived from the accent.
- **Imagery:** the Recipe photo when there is one; otherwise a generated illustrated tile (Tag icon + initial on an accent tone).
- **Shape & motion:** soft, generous rounding (16–24 px cards, pill chips); springy but short motion (≤ 250 ms); `prefers-reduced-motion` respected.

## Structure
- **Home = Today, context-aware:** next meal, Advance Steps due, Leftovers to use, Cooked to confirm. Switches to the Shopping List when a scan session is active.
- **Phone navigation:** bottom bar with Today · Plan · [Scan] · Shop · Recipes, where Scan is the raised centre button. "Shop" here is a UI label for the shopping screen (Shopping List plus scanning), not the glossary **Shop**. Stock and Settings sit behind the avatar. On desktop this becomes a side rail, and the layout expands for weekly planning and recipe editing.
- **Planner transparency:** "why" chips on every auto-planned meal ("uses Monday's chicken", "Anna's favourite", "leftover from Tue"); one tap to swap offers 3 alternatives, and swapping pins the meal.

## Key flows
- **Scanning:** a compact viewfinder strip at the top with the live Shopping List beneath. Scanning is continuous, with a haptic buzz and the ticked line sliding away. A torch toggle is available. An unknown barcode opens a bottom sheet. It must work one-handed.
- **Cook Mode (phone + kitchen tablet):** screen-wide tap zones (left half = back, right half = next) and optional voice commands ("next", "repeat", "start timer"). The screen stays awake. Passive Step timers run concurrently.
- **Kitchen tablet at rest:** an ambient kitchen board showing today's meals, upcoming Advance Steps, Leftovers to use and running timers. Big type, readable from 2 m, dims to dark after sunset.

## Playful moments
- Shopping List complete: a small celebration plus a cost summary.
- Meal Cooked: a friendly check plus where the Leftovers went.
- Empty states: illustrated and witty.
- Zero-waste wins: e.g. "all chicken used before it spoiled" on Today.

## Chosen direction: Bento (2026-11-09)
Modular tiles of different sizes, each sized by urgency. Today is a grid of widgets (tonight's dinner as a large accent tile; prep-ahead, leftovers, use-soon and streak as smaller tiles). Plan is a 2-column grid of day tiles with today spanning both columns. The Shopping List is a progress tile, a cost tile and a grid of item tiles. The kitchen board is a 4×3 tile grid, and Cook Mode is a large step tile with timer tiles and full-width Back/Next tiles. The font is Figtree, the tint is strong (surfaces visibly tinted from the accent) and corners are 20–32 px. Reference: the "2 Bento" row of the proposals canvas, https://claude.ai/artifact/BXPfBDmcwV9udSGKYKsWx1.

## Proposal deliverable
Five clickable HTML mockups plus a comparison page. Each proposal shows the same screens: Today, Plan (week), Shopping + Scan, Cook Mode, Recipe detail, Kitchen board. Each is shown at phone and tablet sizes, in light and dark modes, with a live accent picker.
