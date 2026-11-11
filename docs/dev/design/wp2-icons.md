# WP2 Icon wrapper (round 2)

Spec: `docs/design/ui-fix-plan.md` 3.4, 4.1, 4.15, 7 WP2. Phosphor-only rule: CLAUDE.md.

## Scope and files
- `web/package.json` + lockfile: `@phosphor-icons/react` pinned to `2.1.10` (done by the Designer).
- `web/src/ui/icons.ts`: the only importer of `@phosphor-icons/react`, one `@phosphor-icons/react/dist/csr/<Name>` import per icon (v2 export `<Name>Icon`). Exports `icons` (`as const`) and `type IconName = keyof typeof icons`. Currently a one-entry stub.
- `web/src/ui/Icon.tsx`: `<Icon name size? weight? label? />`; `web/src/ui/index.ts` already exports `Icon` and its types (the only change to that file).
- `web/src/ui/lib/mealSlotIcon.ts`, `web/src/ui/lib/tagIcon.ts`: pure, no React.
- Not touched: `web/src/theme/*`, `web/src/styles.css` (WP1).

## Icon behaviour
- `size` in `14|16|20|22|24|28|64`, default **20** (button md).
- `weight` default: `bold` when size <= 16, else `regular`. Explicit weight wins. Only `regular|bold|fill|duotone` exist in the type (never thin/light).
- No `label`: `aria-hidden="true"`, no `role`, no `aria-label`. With `label`: `role="img"` and `aria-label`, no `aria-hidden`.
- Colour is `currentColor` (Phosphor default `fill`); no colour prop. Pass `width`/`height` from size via Phosphor's `size` prop.
- No `className`/`style` props (YAGNI); sizing is by `size` only.

## Registry (semantic name -> Phosphor)
Decisions: slash pairs in the plan become separate names; "on/off" pairs become `torch` (fill when on, a weight, not a name) and `voice`/`voiceOff`; empty-state art that reuses an existing glyph reuses its name (`recipes`, `stock`, `ingredients`, `products`, `shops`, `members`, `mealSlots`, `leftover`, `timer`, `offline`, `error`, `celebration`, `search`); new names only where the glyph is new: `planEmpty` (CalendarBlank), `cameraOff` (CameraSlash). Tag names from 4.15 (`pasta`, `fish`, `chicken`, `pizza`, `soup`, `vegetarian`) are registered too. 107 names, 87 distinct Phosphor glyphs.

| Name | Phosphor |
|---|---|
| today | `House` |
| plan | `CalendarDots` |
| scan | `Barcode` |
| shop | `Basket` |
| recipes | `BookOpenText` |
| stock | `Package` |
| ingredients | `Carrot` |
| products | `ShoppingBagOpen` |
| shops | `Storefront` |
| board | `Monitor` |
| settings | `GearSix` |
| signOut | `SignOut` |
| household | `HouseLine` |
| members | `UsersThree` |
| mealSlots | `Clock` |
| planningRules | `SlidersHorizontal` |
| notifications | `Bell` |
| allowlist | `UserPlus` |
| appearance | `Palette` |
| barcodes | `Barcode` |
| breakfast | `Coffee` |
| lunch | `Sun` |
| dinner | `MoonStars` |
| snack | `Cookie` |
| other | `ForkKnife` |
| cook | `CookingPot` |
| markCooked | `CheckCircle` |
| notCooked | `XCircle` |
| swap | `ArrowsLeftRight` |
| pin | `PushPin` |
| unpin | `PushPinSlash` |
| chooseRecipe | `MagnifyingGlass` |
| regenerate | `ArrowsClockwise` |
| add | `Plus` |
| edit | `PencilSimple` |
| archive | `Archive` |
| unarchive | `ArrowCounterClockwise` |
| delete | `Trash` |
| throwOut | `Trash` |
| keep | `Check` |
| tick | `Check` |
| confirm | `Check` |
| close | `X` |
| back | `ArrowLeft` |
| next | `ArrowRight` |
| more | `DotsThreeVertical` |
| search | `MagnifyingGlass` |
| filter | `FunnelSimple` |
| sort | `SortAscending` |
| expand | `CaretUpDown` |
| chevron | `CaretRight` |
| copy | `Copy` |
| undo | `ArrowCounterClockwise` |
| import | `DownloadSimple` |
| export | `UploadSimple` |
| agentPrompt | `Robot` |
| file | `FileArrowUp` |
| torch | `Flashlight` |
| stockTake | `HouseLine` |
| unknownBarcode | `Question` |
| weigh | `Scales` |
| price | `Coins` |
| extra | `NotePencil` |
| timer | `Timer` |
| reheat | `Fire` (R12) |
| pause | `Pause` |
| resume | `Play` |
| addMinute | `PlusCircle` |
| voice | `Microphone` |
| voiceOff | `MicrophoneSlash` |
| exit | `X` |
| why | `Sparkle` |
| ingredientOverlap | `Recycle` |
| favourite | `Heart` |
| dislike | `ThumbsDown` |
| exclusion | `Prohibit` |
| slotRule | `CalendarCheck` |
| varietyRule | `Shuffle` |
| alreadyInStock | `Package` |
| leftover | `BowlFood` |
| useSoon | `HourglassMedium` |
| goesOff | `HourglassMedium` |
| spoiled | `WarningCircle` |
| pinned | `PushPin` |
| cooked | `CheckCircle` |
| advanceStep | `Alarm` |
| passiveStep | `HourglassSimple` |
| activeStep | `Knife` |
| batch | `Stack` |
| portions | `ChartPieSlice` |
| attendance | `UsersThree` |
| tag | `Tag` |
| readyMeal | `Package` |
| duration | `Clock` |
| success | `CheckCircle` |
| info | `Info` |
| warning | `HourglassMedium` |
| error | `WarningCircle` |
| offline | `CloudSlash` |
| streak | `Leaf` |
| celebration | `Confetti` |
| planEmpty | `CalendarBlank` |
| cameraOff | `CameraSlash` |
| camera | `Camera` (UF1) |
| clipboard | `ClipboardText` (UF1) |
| link | `LinkSimple` (UF1) |
| rotateRight | `ArrowClockwise` (UF1) |
| rotateLeft | `ArrowCounterClockwise` (UF1; same glyph as `undo`/`unarchive`) |
| pasta | `BowlSteam` |
| fish | `Fish` |
| chicken | `Bird` |
| pizza | `Pizza` |
| soup | `BowlFood` |
| vegetarian | `Leaf` |
| liquid | `Drop` (R14: Base Unit ml) |
| piece | `Cube` (R14: Base Unit piece) |
| key | `Key` (WP-D) |
| assistant | `Robot` (WP-D; same glyph as agentPrompt) |
| refresh | `ArrowsClockwise` (WP-D; same glyph as regenerate) |

## Helpers
- `mealSlotIcon(name: string): IconName`: trim, lower-case, whole-name match on `breakfast|lunch|dinner|snack` returns that name; anything else (incl. "Second breakfast", empty) returns `other`.
- `tagIcon(tag: string | undefined): IconName`: trim, lower-case, whole-name match on `pasta|fish|chicken|pizza|soup|vegetarian` returns that name; else `other`. Callers pass the Recipe's first Tag.

## Tests (red)
- `web/src/ui/Icon.test.tsx`: weight default by size (14/16 bold, 20..64 regular), explicit override, four distinct weights, size attributes, currentColor, aria decorative vs labelled.
- `web/src/ui/icons.test.tsx`: exhaustive registry (keys equal the table exactly; each renders a path; same Phosphor glyph => same svg, different glyph => different svg, without importing Phosphor in a test).
- `web/src/ui/lib/mealSlotIcon.test.ts`, `tagIcon.test.ts`: mapping tables and fallbacks.
- `scripts/test/icons-bundle_test.sh` (picked up by `scripts/check.sh`): icons.ts has no barrel import, >= 87 per-icon imports, and a lib-mode build of `icons.ts` alone (react external) gzips to < 64 kB (65,536 B). This measures the icon payload directly, a stricter and faster proxy than diffing two full builds.

## Developer plan
1. Fill `icons.ts` from the table (one import per distinct Phosphor glyph; aliases point to the same component).
2. Implement `Icon.tsx` (Phosphor `size`, `weight`, `color="currentColor"`; aria per above).
3. Implement the two helpers.
4. Flip `phosphor=warn` to `phosphor=fail` in `scripts/check-ui.rules` (one line; no other change).
5. `scripts/check.sh` must pass.

## Decision: bundle budget raised to 64 kB gz
The 40 kB estimate assumed one weight per glyph. Each `@phosphor-icons/react` csr glyph module carries all six weights, so 87 glyphs measure 62,367 B gz (about 0.7 kB per glyph). PM decision: keep per-icon csr imports (CLAUDE.md rule; `@phosphor-icons/core` SVGs would break it) and set the budget to 64 kB gz (65,536 B). The app is a self-hosted PWA with a precached shell, so this is a one-time cost. About 3 kB of headroom remains, so each new glyph must be justified.

R12 adds `reheat` -> `Fire` (+928 B gz): 65,505 B gz of the 65,536 B budget, 93 modules. 31 B of headroom is left, so the next glyph must raise the budget.

## UF1 update: weights slimmed, budget 42 kB gz
The 64 kB budget above is superseded. `@phosphor-icons/react` modules carry six weights per glyph but the app uses
four (`regular`, `bold`, `fill`, `duotone`), so UF1 strips `thin` and `light` at build time
(`web/vite.phosphor-weights.ts`, see [uf1-icons.md](uf1-icons.md)). 97 glyphs now measure ~41.0 kB gz (40,952 B, ~2.0 kB headroom); the budget is
**43,008 B (42 kB)** and `MIN_MODULES` is 97. UF1 adds `camera`, `clipboard`, `link`, `rotateRight` and `rotateLeft`.

## R14 / WP-D update: five names, three new glyphs
R14 adds `liquid` (`Drop`) and `piece` (`Cube`) for the Base Unit Segmented (g uses `weigh`). WP-D adds `key` (`Key`), `assistant`
(`Robot`, already imported for `agentPrompt`) and `refresh` (`ArrowsClockwise`, already imported for `regenerate`). Three new modules
(Drop, Cube, Key) take the bundle from 40,952 B to **42,249 B gz** (100 modules) of the 43,008 B budget (759 B headroom); `MIN_MODULES` is 100.
WP-D's `connect` (`PlugsConnected`) does **not** fit: it alone costs about 1,070 B: with it the bundle is 43,317 B (309 B over). The budget was not raised; the PM decides
(raise it, drop a glyph, or map `connect` to an existing glyph such as `link`).
