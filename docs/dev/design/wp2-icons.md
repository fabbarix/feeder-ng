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
| pasta | `BowlSteam` |
| fish | `Fish` |
| chicken | `Bird` |
| pizza | `Pizza` |
| soup | `BowlFood` |
| vegetarian | `Leaf` |

## Helpers
- `mealSlotIcon(name: string): IconName`: trim, lower-case, whole-name match on `breakfast|lunch|dinner|snack` returns that name; anything else (incl. "Second breakfast", empty) returns `other`.
- `tagIcon(tag: string | undefined): IconName`: trim, lower-case, whole-name match on `pasta|fish|chicken|pizza|soup|vegetarian` returns that name; else `other`. Callers pass the Recipe's first Tag.

## Tests (red)
- `web/src/ui/Icon.test.tsx`: weight default by size (14/16 bold, 20..64 regular), explicit override, four distinct weights, size attributes, currentColor, aria decorative vs labelled.
- `web/src/ui/icons.test.tsx`: exhaustive registry (keys equal the table exactly; each renders a path; same Phosphor glyph => same svg, different glyph => different svg, without importing Phosphor in a test).
- `web/src/ui/lib/mealSlotIcon.test.ts`, `tagIcon.test.ts`: mapping tables and fallbacks.
- `scripts/test/icons-bundle_test.sh` (picked up by `scripts/check.sh`): icons.ts has no barrel import, >= 87 per-icon imports, and a lib-mode build of `icons.ts` alone (react external) gzips to < 40 kB. This measures the icon payload directly, a stricter and faster proxy than diffing two full builds.

## Developer plan
1. Fill `icons.ts` from the table (one import per distinct Phosphor glyph; aliases point to the same component).
2. Implement `Icon.tsx` (Phosphor `size`, `weight`, `color="currentColor"`; aria per above).
3. Implement the two helpers.
4. Flip `phosphor=warn` to `phosphor=fail` in `scripts/check-ui.rules` (one line; no other change).
5. `scripts/check.sh` must pass.
