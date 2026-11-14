# Feeder UI review 3: the whole app, every size, every workflow

Status: approved design, 2026-11-14. Scope: the web SPA and the backend changes it needs, on `main` @ `834ea743` (1.0.0-beta.8 plus two Shop fixes). The build plan is [ui-remediation-plan-3.md](ui-remediation-plan-3.md), which ships everything below as **1.0.0-beta.9**.
Inputs: [ux-brief.md](ux-brief.md) (direction **Bento**), [system.md](system.md), [ui-review-2.md](ui-review-2.md), [GLOSSARY.md](../../GLOSSARY.md), [docs/adr/](../adr/), [functional-spec.md](../spec/functional-spec.md).

## How this was reviewed

**Stage 1: seven reviewers.** Each one owned an area: `shell` (shell, navigation, Today, Kitchen board, Notifications, sign-in), `plan`, `recipes`, `shop` (Shop, Scan, Receipt, Pantry, Supplies), `settings`, `cross` (primitives, contrast, axe, forced colours, text size, reflow) and `flows` (end-to-end workflows). Each reviewer ran its own seeded server and wrote its scripts under `build/ui-review-3/<area>/`.
- **13 sizes**, light and dark, on every screen of the area: 320×568, 360×740, 390×844, 430×932, 844×390 (phone landscape), 768×1024, 820×1180, 1024×768, 1180×820, 1280×800, 1440×900, 1920×1080 and 2560×1440. Below 768 px the reviewers used mobile emulation with touch. From 768 to 1180 px they used an iPad UA with touch.
- A continuous width walk (every 40 px from 320 to 1600) ran on the densest screens. WebKit was spot-checked on the screens with the most forms and the most sticky elements. The cross reviewer also ran Firefox, axe-core 4.13 on 35 routes, all 7 accents, forced colours, a 24 px browser text size and a 320 px reflow.
- **The workflow walk** (`build/ui-review-3/flows/findings.md`) covered eleven workflows, A to K, at phone (390×844, touch, Android UA), tablet (820×1180, iPad UA) and desktop (1440×900, keyboard). It ran on a seeded Household and on an empty one, and saved 213 screenshots. Each step was scored in taps, typed fields and scrolls.
- **165 findings** in all: SHELL 23, PLAN 19, RECIPES 25, SHOP 25, SETTINGS 22, CROSS 21, FLOW 30.

**Stage 2: ten design chapters.** [THEMES.md](../../build/ui-review-3/THEMES.md) assigned every stage-1 id to exactly one theme and named which theme owns each shared concern. Each chapter did the following:
- reproduced its findings on its own server (ports 18561–18570);
- merged them into designed items `KEY-NN` (Problem, Design, Alternatives, Build notes, Tests and guard, Depends on);
- drew HTML mocks, each with the proposed CSS in `<style data-proposed>` (296 mocks in [ui-review-3/mocks/](ui-review-3/mocks/)) and rendered them to WebP (759 renders in [ui-review-3/shots/](ui-review-3/shots/));
- proposed work packages.

The user then took **56 decisions** ([decisions.md](ui-review-3/decisions.md)) and chose differently from the recommendation nine times. Two mock-review rounds followed. In round 1 the user reviewed Plan and Cook first and sent back 11 of 16 items. In round 2, 12 of 16 were approved and the user commented on the other four. Each round produced shared rules (below), and all ten themes were brought up to them. The user approved the designs on **2026-11-14**. short.md and recipes.md received their final round-2 text last; the plan is built from that final text.

## The app today, in ten lines

1. The shell is solid. Nothing overflows sideways at any size, and text contrast passes for every accent in both schemes.
2. Shopping by scanning is the best workflow: known, off-list and unknown barcodes, live sync between Users, and Undo.
3. Trust is the weakest part. A Swap silently replans 2–9 other Planned Meals, and a wrong Cooked cannot be taken back.
4. Work is lost. A Recipe draft disappears on navigation or reload, and Settings deletes act in one tap.
5. A tick by hand records the Line's need, not the pack, so the list cannot say what reached Stock.
6. Short viewports are not designed for. In phone landscape, with the keyboard up or at 400 % zoom, the chrome leaves 34–80 px for content.
7. At 320 px the bottom bar's labels collide, and a Leftover row paints over its meta. On a phone the Leftover actions sheet has 0×0 targets.
8. Focus disappears on the accent hero and in forced colours. Field boundaries are 1.1–1.3:1, and route changes are silent.
9. Offline, Feeder cannot open, and unloaded data looks like "Nothing matches".
10. The Kitchen board has no way out, and Today on a desktop is a stretched single column.

## Root causes across the themes

1. **Actions without a shape.** Tertiary text buttons, pale buttons on tints, a squashed Close and one-sentence toasts carrying detail. One set of action primitives fixes these (DS-12, rules R-A, R-B, R-D).
2. **Writes that do not report or reverse.** The planner throws away the changes it computes, and Cooked, Regenerate, Remove Member, Throw out and Stock-take have no inverse. The fix is a change-feedback contract plus server-side Undo (PC-01, SAFE-02/03/07/09).
3. **Fixed chrome sized by width only.** Bars, sheets and Cook Mode ignore height, insets and the keyboard (SHORT).
4. **One focus and state system missing.** Box-shadow rings vanish in forced colours, nested controls fuse rings, and selected states are colour-only (A11Y-02, A11Y-04, A11Y-06).
5. **Type, breakpoints and tones as local choices.** px media queries, px type, spoil/danger used for "decide", opacity muting (DS-06 to DS-11).
6. **Rows and tiles with no room for long content.** Chips inside the text column, no `below`/`actions` slots, no grid rule for an orphan day (PC-06, PC-11, SET-03, SSP-05).
7. **Context lost between screens.** Sheets don't name the day, Cook Mode always returns to Today, timers vanish, and notifications land on Today (PC-02, PC-04, PC-09, TB-14).
8. **"Unknown" rendered as "empty".** No state model for data that has not arrived (RES-02).
9. **Quantities and money as data, not words.** Base Units unformatted, Restock said three ways, no estimate before a first purchase (SSP-05, SSP-13, SSP-16).

## The ten chapters

| Key | Chapter | Items | S1 | S2 | S3 | S4 | What it changes |
|---|---|---|---|---|---|---|---|
| PC | [plancook.md](ui-review-3/plancook.md) | 16 | 0 | 8 | 6 | 2 | "What changed" with Review and Undo, week grid option B, Away, Cook Mode layout, shell timers, Get ready, after-Cooked flow, Earliest start |
| SSP | [shopscan.md](ui-review-3/shopscan.md) | 20 | 0 | 8 | 9 | 3 | Tick by hand adds the pack, a tick covers an amount, Pantry by Storage Place, Put away, Scan without a camera, receipt review, kg/l display |
| TB | [today.md](ui-review-3/today.md) | 15 | 0 | 6 | 8 | 1 | Hero selection, Advance Steps in 24 h, Today's Bento, board at wall scale with a way out, first run as a flow, notification landings |
| RX | [recipes.md](ui-review-3/recipes.md) | 15 | 0 | 6 | 7 | 2 | Import Review shows Recipes, the editor as a faster flow, compact list cards, the Cook entry in reach, Step rows |
| SET | [settings.md](ui-review-3/settings.md) | 16 | 1 | 2 | 11 | 2 | Crafted Select, Prices by Shop, Allowlist rows and sign-in message, Product and Ingredient pages, Meal Slot editor, removed Meal Slots, Away on Members |
| SAFE | [safe.md](ui-review-3/safe.md) | 11 | 1 | 5 | 5 | 0 | Leave guard and reload draft, confirm and Undo patterns, Undo Cooked, Regenerate Undo, field errors, preferences with Save |
| SHORT | [short.md](ui-review-3/short.md) | 8 | 3 | 2 | 2 | 1 | Compact rail in landscape, bar hides with the keyboard, sheet layout on short screens, safe areas, Cook Mode and board by height |
| A11Y | [a11y.md](ui-review-3/a11y.md) | 12 | 0 | 6 | 5 | 1 | One focus ring (with nesting), forced colours, ruled fields, selected states, focus after actions, titles, targets, skip link |
| DS | [ds.md](ui-review-3/ds.md) | 12 | 1 | 5 | 5 | 1 | Action primitives and DetailList, R-F bottom bar, warn tone, type roles, rem type and em breakpoints, 320 px |
| RES | [res.md](ui-review-3/res.md) | 10 | 1 | 3 | 6 | 0 | Offline launch, "unknown is not empty", offline ticks, compression, boot, error boundaries, update prompt |
| | **Total** | **135** | **7** | **51** | **64** | **13** | |

## Index of items

Severity as decided after reproduction ("was" marks a regrade). Titles are the chapters' final headings.

### plancook.md (16)

| Item | Sev | Size | Title |
|---|---|---|---|
| [PC-01](ui-review-3/plancook.md#pc-01--plan-edits-change-other-meals-silently-show-what-changed-with-review-and-undo-and-hold-what-should-not-move) | S2 | L | Plan edits change other meals silently: show what changed, with Review and Undo, and hold what should not move |
| [PC-02](ui-review-3/plancook.md#pc-02--the-cooked-confirmation-and-stock-shortfalls-a-friendly-moment-one-notice-one-correct-stock-sheet-back-to-where-you-started) | S2 | M | The Cooked confirmation and Stock shortfalls: a friendly moment, one notice, one Correct Stock sheet, back to where you started |
| [PC-03](ui-review-3/plancook.md#pc-03--cook-mode-step-layout-capped-photo-long-step-text-timers-in-a-strip-or-rail-44-px-controls-safe-cancel) | S2 | M | Cook Mode Step layout: capped photo, long Step text, timers in a strip or rail, 44 px controls, safe Cancel |
| [PC-04](ui-review-3/plancook.md#pc-04--timers-outside-cook-mode-a-shell-timer-pill-an-in-app-finish-alert-resume-at-the-last-step) | S2 | M | Timers outside Cook Mode: a shell timer pill, an in-app finish alert, resume at the last Step |
| [PC-05](ui-review-3/plancook.md#pc-05--from-a-planned-meal-to-its-recipe-and-a-get-ready-ingredient-list-scaled-to-the-planned-portions) | S2 | M | From a Planned Meal to its Recipe, and a "Get ready" Ingredient list scaled to the planned portions |
| [PC-06](ui-review-3/plancook.md#pc-06--why-chips-cut-to-stubs-on-plan-rows) | S2 | S | Why chips cut to stubs on Plan rows |
| [PC-07](ui-review-3/plancook.md#pc-07--couldnt-plan-as-one-compact-tile-unfilled-course-rows-and-a-fix-that-stays-on-the-plan) | S2 | M | Couldn't plan as one compact tile, unfilled Course rows, and a fix that stays on the Plan |
| [PC-08](ui-review-3/plancook.md#pc-08--whos-eating-on-the-day-tile-and-an-away-record-for-a-member-who-is-away-for-days) | S2 | M | Who's eating on the day tile, and an Away record for a Member who is away for days |
| [PC-09](ui-review-3/plancook.md#pc-09--planned-meal-sheet-context-header-one-primary-and-one-secondary-open-recipe-leftovers-on-a-cooked-meal) | S3 | S | Planned Meal sheet: context header, one primary and one secondary, Open Recipe, Leftovers on a Cooked meal |
| [PC-10](ui-review-3/plancook.md#pc-10--swap-choose-a-recipe-and-whos-eating-name-the-day-meal-slot-and-course-real-chips-no-iso-dates) | S3 | S | Swap, Choose a Recipe and Who's eating name the day, Meal Slot and Course; real chips; no ISO dates |
| [PC-11](ui-review-3/plancook.md#pc-11--the-week-grid-at-every-size-auto-fill-by-day-with-an-incomplete-last-row-shared-by-its-days) | S3 | M | The week grid at every size: auto-fill by day, with an incomplete last row shared by its days |
| [PC-12](ui-review-3/plancook.md#pc-12--the-last-step-of-a-meal-on-a-future-date-is-a-dead-end) | S3 | S | The last Step of a meal on a future date is a dead end |
| [PC-13](ui-review-3/plancook.md#pc-13--leftover-defaults-strand-portions-leftovers-of-one-recipe-show-twice) | S3 | S | Leftover defaults strand portions; Leftovers of one Recipe show twice |
| [PC-14](ui-review-3/plancook.md#pc-14--the-planner-has-no-earliest-start-long-recipes-can-be-planned-for-an-early-meal-slot) | S3 | M | The planner has no earliest start: long Recipes can be planned for an early Meal Slot |
| [PC-15](ui-review-3/plancook.md#pc-15--reheat-30-s-buttons-wrap-raggedly-two-filled-primaries) | S4 | S | Reheat: ±30 s buttons wrap raggedly; two filled primaries |
| [PC-16](ui-review-3/plancook.md#pc-16--polish-in-the-plan-and-cook-mode) | S4 | XS–S | Polish in the Plan and Cook Mode |

### shopscan.md (20)

| Item | Sev | Size | Title |
|---|---|---|---|
| [SSP-01](ui-review-3/shopscan.md#ssp-01--tick-by-hand-what-it-adds-one-tap-with-undo--change-and-a-ticked-row-that-says-what-reached-stock) | S2 | M | Tick by hand: what it adds, one tap with Undo · Change, and a ticked row that says what reached Stock |
| [SSP-02](ui-review-3/shopscan.md#ssp-02--need-that-grows-after-a-tick-is-hidden) | S2 | M | Need that grows after a tick is hidden |
| [SSP-03](ui-review-3/shopscan.md#ssp-03--the-pantry-never-names-its-storage-places) | S2 | S | The Pantry never names its Storage Places |
| [SSP-04](ui-review-3/shopscan.md#ssp-04--the-shop-notice-cuts-its-own-verb-on-phones) | S2 | S | The Shop notice cuts its own verb on phones |
| [SSP-05](ui-review-3/shopscan.md#ssp-05--status-first-and-never-cut-the-restock-reason-said-one-way) | S2 | M | Status first and never cut; the Restock reason said one way |
| [SSP-06](ui-review-3/shopscan.md#ssp-06--scan-without-a-working-camera-and-the-tablet-split) | S2 | M | Scan without a working camera, and the tablet split |
| [SSP-07](ui-review-3/shopscan.md#ssp-07--weighed-barcodes-show-the-weight-price-per-kg) | S2 | S | Weighed barcodes: show the weight, price per kg |
| [SSP-08](ui-review-3/shopscan.md#ssp-08--receipt-review-add-with-receipt-context-matches-first-a-truthful-accept-all-no-duplicate-product) | S2 | M | Receipt review: Add… with receipt context, matches first, a truthful Accept all, no duplicate Product |
| [SSP-09](ui-review-3/shopscan.md#ssp-09--shopping-list-complete-offers-the-next-steps) | S3 | S | "Shopping List complete" offers the next steps |
| [SSP-10](ui-review-3/shopscan.md#ssp-10--put-away-a-whole-shop-at-once) | S3 | M | Put away a whole shop at once |
| [SSP-11](ui-review-3/shopscan.md#ssp-11--scans-to-get-leaves-out-manual-extras) | S3 | S | Scan's To get leaves out manual extras |
| [SSP-12](ui-review-3/shopscan.md#ssp-12--the-price-keypad-toasts-cover-the-row-being-priced) | S3 | S | The Price keypad: toasts cover the row being priced |
| [SSP-13](ui-review-3/shopscan.md#ssp-13--no-estimate-before-a-first-purchase-and-no-price-from-a-line) | S3 | M | No estimate before a first purchase, and no Price from a Line |
| [SSP-14](ui-review-3/shopscan.md#ssp-14--not-available-what-the-line-is-for-and-a-substitute) | S3 | M | "Not available": what the Line is for, and a substitute |
| [SSP-15](ui-review-3/shopscan.md#ssp-15--a-weight-style-code-with-no-weight-barcode-rule-silently-becomes-a-product) | S3 | S | A weight-style code with no Weight Barcode Rule silently becomes a Product |
| [SSP-16](ui-review-3/shopscan.md#ssp-16--big-quantities-in-the-base-unit-digits-ungrouped) | S3 | S | Big quantities in the Base Unit, digits ungrouped |
| [SSP-17](ui-review-3/shopscan.md#ssp-17--keep-moves-a-go-off-date-one-day-at-a-time) | S3 | S | Keep moves a go-off date one day at a time |
| [SSP-18](ui-review-3/shopscan.md#ssp-18--a-ticked-lines-sheet-is-a-dead-end) | S4 | XS | A ticked Line's sheet is a dead end |
| [SSP-19](ui-review-3/shopscan.md#ssp-19--receipt-photos-the-first-action-is-the-small-button) | S4 | XS | Receipt photos: the first action is the small button |
| [SSP-20](ui-review-3/shopscan.md#ssp-20--an-unknown-barcode-shows-14-digits-nobody-typed) | S4 | XS | An unknown barcode shows 14 digits nobody typed |

### today.md (15)

| Item | Sev | Size | Title |
|---|---|---|---|
| [TB-01](ui-review-3/today.md#tb-01--the-hero-shows-the-next-meal-slot-not-a-past-one-today-and-the-board-agree) | S2 | S | The hero shows the next Meal Slot, not a past one; Today and the board agree |
| [TB-02](ui-review-3/today.md#tb-02--advance-steps-due-in-the-next-24-h-with-done-from-one-marks-aware-source) | S2 | M | Advance Steps due in the next 24 h, with Done, from one marks-aware source |
| [TB-03](ui-review-3/today.md#tb-03--todays-bento-at-every-size-class) | S2 | M | Today's Bento at every size class |
| [TB-04](ui-review-3/today.md#tb-04--a-way-out-of-the-kitchen-board) | S2 | S | A way out of the Kitchen board |
| [TB-05](ui-review-3/today.md#tb-05--the-heros-dark-rule-lives-in-uitile-and-keys-on-data-scheme) | S2 | S | The hero's dark rule lives in `ui/Tile` and keys on `data-scheme` |
| [TB-06](ui-review-3/today.md#tb-06--first-run-as-a-flow-steps-open-the-action-time-zone-and-currency-confirmed-stays-until-done) | S2 | L | First run as a flow: steps open the action, time zone and currency confirmed, stays until done |
| [TB-07](ui-review-3/today.md#tb-07--kitchen-board-at-wall-scale-type-tomorrow-done-and-chips-portrait) | S3 | M | Kitchen board at wall scale: type, Tomorrow, Done and chips, portrait |
| [TB-08](ui-review-3/today.md#tb-08--one-vocabulary-on-today-and-the-board) | S3 | S | One vocabulary on Today and the board |
| [TB-09](ui-review-3/today.md#tb-09--one-tile-header-on-today) | S3 | S | One tile header on Today |
| [TB-10](ui-review-3/today.md#tb-10--the-heros-name-course-names-and-why-chips-open-the-planned-meal-sheet) | S3 | S | The hero's name, Course names and why chips open the Planned Meal sheet |
| [TB-11](ui-review-3/today.md#tb-11--use-soon-and-leftovers-lead-somewhere) | S3 | S | Use soon and Leftovers lead somewhere |
| [TB-12](ui-review-3/today.md#tb-12--the-scan-session-on-today) | S3 | S | The Scan session on Today |
| [TB-13](ui-review-3/today.md#tb-13--the-current-nav-item-on-sub-pages) | S3 | XS | The current nav item on sub-pages |
| [TB-14](ui-review-3/today.md#tb-14--where-each-notification-lands) | S3 | M | Where each notification lands |
| [TB-15](ui-review-3/today.md#tb-15--polish) | S4 | S | Polish |

### recipes.md (15)

| Item | Sev | Size | Title |
|---|---|---|---|
| [RX-01](ui-review-3/recipes.md#rx-01--import-review-shows-the-recipes-it-imports-open-questions-are-reachable-the-result-names-them) | S2 | L | Import Review shows the Recipes it imports; open questions are reachable; the result names them |
| [RX-02](ui-review-3/recipes.md#rx-02--the-recipe-editor-as-a-faster-flow) | S2 | L | The Recipe editor as a faster flow |
| [RX-03](ui-review-3/recipes.md#rx-03--recipes-list-a-compact-card-on-phones-new-recipe-on-the-title-row) | S2 | M | Recipes list: a compact card on phones, New Recipe on the title row |
| [RX-04](ui-review-3/recipes.md#rx-04--recipe-detail-layout-the-cook-entry-in-reach-and-the-hero-aligned-at-every-size) | S2 | M | Recipe detail layout: the Cook entry in reach and the hero aligned at every size |
| [RX-05](ui-review-3/recipes.md#rx-05--recipe-detail-shows-the-description-source-and-attribution) | S2 | S | Recipe detail shows the description, Source and Attribution |
| [RX-06](ui-review-3/recipes.md#rx-06--base-recipe-detail-states-its-yield-with-its-unit) | S2 | XS | Base recipe detail states its Yield with its unit |
| [RX-07](ui-review-3/recipes.md#rx-07--untimed-steps-are-not-no-steps) | S3 | S | Untimed Steps are not "No Steps" |
| [RX-08](ui-review-3/recipes.md#rx-08--focus-moves-to-quantity-after-a-pick-lead-time-and-duration-in-min-h-or-d-choose-a-recipe-says-6-h) | S3 | S | Focus moves to Quantity after a pick; Lead time and Duration in min, h or d; Choose a Recipe says "6 h" |
| [RX-09](ui-review-3/recipes.md#rx-09--tag-chooser-with-an-add-tag-row-that-opens-clear-of-the-sticky-bar) | S3 | M | Tag chooser with an Add Tag row that opens clear of the sticky bar |
| [RX-10](ui-review-3/recipes.md#rx-10--one-control-style-for-kind-and-flags-a-visible-optional-control) | S3 (was S4) | S | One control style for kind and flags; a visible Optional control |
| [RX-11](ui-review-3/recipes.md#rx-11--import-starts-with-a-choice-of-two-paths-not-four-numbered-steps) | S3 | S | Import starts with a choice of two paths, not four numbered steps |
| [RX-12](ui-review-3/recipes.md#rx-12--import-review-ingredient-matches-as-rows-with-their-answer) | S3 | S | Import Review: Ingredient matches as rows with their answer |
| [RX-13](ui-review-3/recipes.md#rx-13--detail-metric-tiles-on-surface-the-ready-meal-chip-moves-to-the-chip-line) | S3 | XS | Detail metric tiles on surface; the Ready Meal chip moves to the chip line |
| [RX-14](ui-review-3/recipes.md#rx-14--ingredient-line-actions-at-the-rows-end) | S4 | XS | Ingredient line actions at the row's end |
| [RX-15](ui-review-3/recipes.md#rx-15--no-result-and-export-give-a-next-step) | S4 | S | No-result and Export give a next step |

### settings.md (16)

| Item | Sev | Size | Title |
|---|---|---|---|
| [SET-01](ui-review-3/settings.md#set-01--add-shop-barcode-sheet-scrolled-sideways-rebuild-it-on-the-crafted-select) | S1 | S | Add Shop Barcode sheet scrolled sideways; rebuild it on the crafted Select |
| [SET-02](ui-review-3/settings.md#set-02--prices-known-here-is-wrong-read-prices-by-shop-price-rows-with-a-value-column) | S2 | M | "Prices known here" is wrong; read Prices by Shop; Price rows with a value column |
| [SET-03](ui-review-3/settings.md#set-03--allowlist-rows-keep-the-email-readable-copy-sign-in-message-and-share) | S2 | S + M | Allowlist rows keep the email readable; "Copy sign-in message" and Share |
| [SET-04](ui-review-3/settings.md#set-04--product-page-order-price-rows-history-save-beside-its-field-removable-barcode-chips-barcode-check) | S3 | M | Product page: order, Price rows, history, Save beside its field, removable barcode chips, barcode check |
| [SET-05](ui-review-3/settings.md#set-05--ingredient-and-supply-page-one-keeping-tile-rename-in-a-sheet-no-orphan-one-stepper) | S3 | M | Ingredient and Supply page: one "Keeping" tile, Rename in a sheet, no orphan, one Stepper |
| [SET-06](ui-review-3/settings.md#set-06--crafted-select-one-chip-line-two-line-options-homeend-that-show-the-option-focus-ring-not-cut) | S3 | M | Crafted Select: one chip line, two-line options, Home/End that show the option, focus ring not cut |
| [SET-07](ui-review-3/settings.md#set-07--household-searchable-time-zone-and-currency-selects-field-errors-as-wide-as-the-field) | S3 | M | Household: searchable Time zone and Currency Selects; field errors as wide as the field |
| [SET-08](ui-review-3/settings.md#set-08--meal-slot-cards-and-week-strip-from-320-to-wide) | S3 | S | Meal Slot cards and week strip from 320 to wide |
| [SET-09](ui-review-3/settings.md#set-09--meal-slot-editor-course-rows-as-one-anatomy) | S3 | S | Meal Slot editor: Course rows as one anatomy |
| [SET-10](ui-review-3/settings.md#set-10--meal-slot-sheet-attendance-rows-with-long-member-names) | S3 | XS–S | Meal Slot sheet: Attendance rows with long Member names |
| [SET-11](ui-review-3/settings.md#set-11--tags-rows-the-tag-is-the-title-the-count-is-the-value) | S3 | XS | Tags rows: the Tag is the title, the count is the value |
| [SET-12](ui-review-3/settings.md#set-12--sign-in-requests-rows-neutral-monogram-no-nested-tile-readable-at-320) | S3 | S | Sign-in requests rows: neutral monogram, no nested tile, readable at 320 |
| [SET-13](ui-review-3/settings.md#set-13--desktop-layout-of-narrow-settings-and-catalogue-pages) | S4 | XS | Desktop layout of narrow Settings and catalogue pages |
| [SET-14](ui-review-3/settings.md#set-14--small-consistency-and-copy-items) | S4 | S | Small consistency and copy items |
| [SET-15](ui-review-3/settings.md#set-15--removed-meal-slots-keep-their-cooked-history-where-it-shows) | S3 | S | Removed Meal Slots keep their Cooked history: where it shows |
| [SET-16](ui-review-3/settings.md#set-16--away-on-the-members-list-and-in-the-member-sheet) | S3 | S | "Away" on the Members list and in the Member sheet |

### safe.md (11)

| Item | Sev | Size | Title |
|---|---|---|---|
| [SAFE-01](ui-review-3/safe.md#safe-01--the-recipe-editor-loses-every-unsaved-change-on-navigation-or-reload) | S1 | M | The Recipe editor loses every unsaved change on navigation or reload |
| [SAFE-02](ui-review-3/safe.md#safe-02--destructive-settings-and-catalogue-actions-one-tap-deletes-and-five-confirm-patterns) | S2 | L | Destructive Settings and catalogue actions: one-tap deletes and five confirm patterns |
| [SAFE-03](ui-review-3/safe.md#safe-03--cooked-and-not-cooked-cannot-be-taken-back) | S2 | L | Cooked and Not cooked cannot be taken back |
| [SAFE-04](ui-review-3/safe.md#safe-04--one-field-error-pattern-message-at-the-field-focus-to-the-first-invalid-field) | S2 | M | One field-error pattern: message at the field, focus to the first invalid field |
| [SAFE-05](ui-review-3/safe.md#safe-05--delete-of-a-planned-recipe-promises-a-delete-then-refuses-it-off-screen) | S2 | S | Delete of a planned Recipe promises a delete, then refuses it off-screen |
| [SAFE-06](ui-review-3/safe.md#safe-06--editor-cancel-is-history-back-and-leaves-the-app-on-a-deep-link) | S2 | XS | Editor Cancel is history-back and leaves the app on a deep link |
| [SAFE-07](ui-review-3/safe.md#safe-07--regenerate-enter-commits-and-the-run-gives-no-count-and-no-undo) | S3 | M | Regenerate: Enter commits, and the run gives no count and no Undo |
| [SAFE-08](ui-review-3/safe.md#safe-08--your-preferences-no-live-effect-and-leaving-drops-the-choice) | S3 (was S2) | S | Your preferences: no live effect, and leaving drops the choice |
| [SAFE-09](ui-review-3/safe.md#safe-09--stock-actions-undo-and-feedback-differ-between-screens) | S3 | M | Stock actions: Undo and feedback differ between screens |
| [SAFE-10](ui-review-3/safe.md#safe-10--remove-step-line-or-ingredient-use-in-the-editor-is-instant-with-no-undo) | S3 | S | Remove Step, line or ingredient use in the editor is instant, with no Undo |
| [SAFE-11](ui-review-3/safe.md#safe-11--add-forms-start-with-an-arbitrary-ingredient-or-none-and-the-lot-sheet-always-shows-move) | S3 | S | Add forms start with an arbitrary Ingredient or none, and the Lot sheet always shows Move |

### short.md (8)

| Item | Sev | Size | Title |
|---|---|---|---|
| [SHORT-01](ui-review-3/short.md#short-01--cook-mode-on-a-short-viewport-hides-the-step-under-backnext) | S1 | M | Cook Mode on a short viewport hides the Step under Back/Next |
| [SHORT-02](ui-review-3/short.md#short-02--sheets-the-body-collapses-footers-stack-and-some-primaries-sit-below-the-fold) | S1 | M | Sheets: the body collapses, footers stack, and some primaries sit below the fold |
| [SHORT-03](ui-review-3/short.md#short-03--kitchen-board-clips-its-heros-cook-button-in-phone-landscape) | S1 | S | Kitchen board clips its hero's Cook button in phone landscape |
| [SHORT-04](ui-review-3/short.md#short-04--fixed-chrome-covers-short-viewports-navigation-in-landscape-bars-with-the-keyboard-and-at-zoom) | S2 | M | Fixed chrome covers short viewports: navigation in landscape, bars with the keyboard and at zoom |
| [SHORT-05](ui-review-3/short.md#short-05--safe-areas-page-gutters-and-the-top-bar-ignore-the-insets) | S2 | S | Safe areas: Page gutters and the top bar ignore the insets |
| [SHORT-06](ui-review-3/short.md#short-06--recipe-assistants-sticky-bar-floats-permanently-with-both-buttons-disabled) | S3 (was S2) | S | Recipe Assistant's sticky bar floats permanently with both buttons disabled |
| [SHORT-07](ui-review-3/short.md#short-07--pantry-filters-popover-is-cramped-on-a-short-viewport) | S3 | S | Pantry Filters popover is cramped on a short viewport |
| [SHORT-08](ui-review-3/short.md#short-08--recipe-editors-bar-is-wider-than-its-form-at-1440-a-24-px-strip-shows-under-it-at-820) | S4 | XS | Recipe editor's bar is wider than its form at 1440; a 24 px strip shows under it at 820 |

### a11y.md (12)

| Item | Sev | Size | Title |
|---|---|---|---|
| [A11Y-01](ui-review-3/a11y.md#a11y-01--page-title-and-focus-on-route-change) | S2 | S | Page title and focus on route change |
| [A11Y-02](ui-review-3/a11y.md#a11y-02--one-focus-ring-visible-on-every-container-never-clipped-overrun-or-fused) | S2 | M | One focus ring, visible on every container, never clipped, overrun or fused |
| [A11Y-03](ui-review-3/a11y.md#a11y-03--the-today-hero-follows-the-os-scheme-not-the-chosen-one-new-in-stage-2) | S2 | XS | The Today hero follows the OS scheme, not the chosen one (new in stage 2) |
| [A11Y-04](ui-review-3/a11y.md#a11y-04--forced-colours-layer-for-the-primitives) | S2 | M | Forced-colours layer for the primitives |
| [A11Y-05](ui-review-3/a11y.md#a11y-05--the-search-field-and-the-segmented-track-show-their-boundary-at-rest) | S3 (was S2) | S | The Search field and the Segmented track show their boundary at rest |
| [A11Y-06](ui-review-3/a11y.md#a11y-06--one-selected--pressed-state-at-31-with-a-non-colour-cue) | S2 | S | One selected / pressed state at 3:1, with a non-colour cue |
| [A11Y-07](ui-review-3/a11y.md#a11y-07--where-focus-goes-after-a-row-leaves-a-sheet-opens-or-a-sheet-changes-step) | S2 | M | Where focus goes after a row leaves, a sheet opens or a sheet changes step |
| [A11Y-08](ui-review-3/a11y.md#a11y-08--names-for-repeated-row-actions-and-for-rows-pin-as-one-toggle) | S3 | S | Names for repeated row actions and for rows; Pin as one toggle |
| [A11Y-09](ui-review-3/a11y.md#a11y-09--touch-targets-and-spacing-on-coarse-pointers) | S3 | S | Touch targets and spacing on coarse pointers |
| [A11Y-10](ui-review-3/a11y.md#a11y-10--skip-link) | S3 | XS | Skip link |
| [A11Y-11](ui-review-3/a11y.md#a11y-11--recipe-tiles-are-links) | S3 | XS | Recipe tiles are links |
| [A11Y-12](ui-review-3/a11y.md#a11y-12--smaller-items-board-h1-nav-and-menu-names-dark-danger-fill-textarea-grip-app-update) | S4 | S | Smaller items: board h1, nav and menu names, dark danger fill, textarea grip, app update |

### ds.md (12)

| Item | Sev | Size | Title |
|---|---|---|---|
| [DS-01](ui-review-3/ds.md#ds-01--a-menus-phone-sheet-inherits-its-row-leftover-actions-cannot-be-tapped) | S1 | S | A Menu's phone sheet inherits its row: Leftover actions cannot be tapped |
| [DS-02](ui-review-3/ds.md#ds-02--bottom-bar-at-320430-px-one-squircle-system-icons-only-below-360-px) | S2 | S | Bottom bar at 320–430 px: one squircle system, icons only below 360 px |
| [DS-03](ui-review-3/ds.md#ds-03--pageheader-actions-and-the-filterbar-at-320-px-pantry-scrolls-sideways) | S2 | S | PageHeader actions and the FilterBar at 320 px (Pantry scrolls sideways) |
| [DS-04](ui-review-3/ds.md#ds-04--a-chip-can-exceed-its-line-the-recipe-editors-tags-at-320-px) | S2 | XS | A Chip can exceed its line: the Recipe editor's Tags at 320 px |
| [DS-05](ui-review-3/ds.md#ds-05--leftovers-tile-on-today-the-recipe-name-paints-over-its-meta-line) | S2 | XS | Leftovers tile on Today: the Recipe name paints over its meta line |
| [DS-06](ui-review-3/ds.md#ds-06--a-real-warn-status-tone-spoil-and-danger-kept-for-food-and-destruction) | S3 | M | A real warn status tone; spoil and danger kept for food and destruction |
| [DS-07](ui-review-3/ds.md#ds-07--type-roles-body-role-base-headings-sectiontitletileheadermutedoverline-pg__-into-ui) | S3 | L | Type roles: body role, base headings, SectionTitle/TileHeader/Muted/Overline, `.pg__*` into `ui` |
| [DS-08](ui-review-3/ds.md#ds-08--type-tokens-in-rem-the-browser-text-size-scales-every-role) | S3 | S | Type tokens in rem: the browser text size scales every role |
| [DS-09](ui-review-3/ds.md#ds-09--one-breakpoint-table-em-min-width-only-and-the-1024-px-rail-handover-seam) | S3 | M | One breakpoint table (em, min-width only) and the 1024 px rail handover seam |
| [DS-10](ui-review-3/ds.md#ds-10--text-spacing-resilience-settings-descriptions-and-the-sort-value) | S3 | S | Text-spacing resilience: Settings descriptions and the Sort value |
| [DS-11](ui-review-3/ds.md#ds-11--opacity-muting-raw-radii-and-raw-spacing) | S4 | S | Opacity muting, raw radii and raw spacing |
| [DS-12](ui-review-3/ds.md#ds-12--actions-look-like-actions-button-iconbutton-close-toast-detail-rows-and-sheet-room-as-system-rules) | S2 | M | Actions look like actions: Button, IconButton, Close, Toast, detail rows and sheet room as system rules |

### res.md (10)

| Item | Sev | Size | Title |
|---|---|---|---|
| [RES-01](ui-review-3/res.md#res-01--feeder-cannot-open-offline-the-cached-page-is-a-redirect) | S1 | S | Feeder cannot open offline: the cached page is a redirect |
| [RES-02](ui-review-3/res.md#res-02--one-state-model-for-data-screens-unknown-is-not-empty) | S2 | M | One state model for data screens: unknown is not empty |
| [RES-03](ui-review-3/res.md#res-03--offline-shopping-queued-ticks-pending-and-failed-rows-lines-ticked-twice) | S2 | L | Offline shopping: queued Ticks, pending and failed rows, Lines ticked twice |
| [RES-04](ui-review-3/res.md#res-04--first-load-compress-and-cache-the-assets) | S2 | S (+M optional) | First load: compress and cache the assets |
| [RES-05](ui-review-3/res.md#res-05--today-while-loading-household-date-reserved-tiles-no-layout-shift) | S3 | M | Today while loading: household date, reserved tiles, no layout shift |
| [RES-06](ui-review-3/res.md#res-06--errors-in-about-1-s-failed-saves-say-what-failed) | S3 | S | Errors in about 1 s; failed saves say what failed |
| [RES-07](ui-review-3/res.md#res-07--offline-banner-sticky-in-the-gutter-beside-the-rail-household-time) | S3 | S | Offline banner: sticky, in the gutter, beside the rail, household time |
| [RES-08](ui-review-3/res.md#res-08--boot-the-users-theme-before-first-paint-and-a-shell-skeleton) | S3 | S | Boot: the User's theme before first paint, and a shell skeleton |
| [RES-09](ui-review-3/res.md#res-09--a-crashed-tile-or-page-per-tile-boundary-and-a-try-again-that-works) | S3 | S | A crashed tile or page: per-tile boundary and a Try again that works |
| [RES-10](ui-review-3/res.md#res-10--a-new-version-is-ready-the-update-prompt) | S3 | S | A new version is ready: the update prompt |

## The review rules

These came out of the user's mock reviews and apply to every screen. Their full text, tokens and contrast figures are in [plancook.md](ui-review-3/plancook.md) ("Review round 1/2"), [ds.md](ui-review-3/ds.md) DS-12 and [a11y.md](ui-review-3/a11y.md) A11Y-02. They go into system.md as shown.

| Rule | What it says | Owner (primitive) | system.md |
|---|---|---|---|
| R-A | Buttons look like buttons. Every action has a visible shape (a fill and a 1 px outline, or solid). On a tinted container the fill is `--color-surface`. A bare-text button is never an action in a tile, notice, toast, sheet footer or banner. | DS: `Button`, `IconButton`, `ui/lib/actionSurface` | §5 |
| R-B | Close is one control: a 40 px circular outline IconButton (52 px target) that never squashes. A sheet whose footer has Cancel shows no Close. The title is centred on it. | DS: `CloseButton`, `BottomSheet`, `Dialog` | §5 |
| R-C | Focus rings are never clipped or overrun. Sheet and dialog bodies keep 5 px of ring room and `scroll-padding` for a sticky footer. | A11Y (ring), DS (sheet room) | §15, §13 |
| R-C+ | A control nested in a container that has its own boundary and **less than 9 px of padding** draws a 2 px ring inside itself on a soft fill. The container's accent boundary steps back. Two rings never fuse. | A11Y (A11Y-02) | §15 |
| R-D | A toast with detail has a headline, a muted subline, optional body text, then real buttons. | DS: `Toast` | §5 |
| R-D+ | A plain success toast has no icon. An icon that carries a status sits in the headline line, left of the headline. | DS: `Toast` | §5 |
| R-E | Items with a key, a state and detail are set as rows, never as a bullet list of sentences. `DetailList`/`DetailRow` is for read-only rows, and `ListRow` for rows the person acts on. | DS: `DetailList` (DS-12), `ListRow` | §3 |
| R-F | Under 360 px the bottom bar is icons only. The current page and Scan are 40 px squircles (radius 12) fully inside the bar, and the link stays the whole track. | DS: shell bottom bar (DS-02) | §8 |

Two more rules from the round-2 answers apply everywhere. **Step text:** a Step's sentence is never set bold. Cook Mode's Step text is large at weight 500 (`--text-step-weight: 500`). On Recipe detail and in the Import preview, Step text is body weight (500), and only short keys (an Ingredient name, a day, a Shop) take `body-strong`. **Display text read at length is not extra-bold.**

## Reconciliations

Where chapters disagree, the theme that THEMES.md names as owner wins, unless a user decision says otherwise. The numbers below are final. The plan's tables list them in full.

**Numbering**
- **Migrations** run 1570–1577 and form one family under one snapshot, `feeder-pre-1570.db`, with `Pre1570Prefixes` listing all eight:
- 1570 meal_slot_removed
- 1571 member_removals
- 1572 stock_undo
- 1573 cooked_takes
- 1574 plan_snapshots
- 1575 household_b9 (`earliest_start`, `setup_hidden`)
- 1576 shopping_tick_additions (with `covers`)
- 1577 member_away (with `despite_away`)

SAFE's 1571/1572/1573/1574 and PC's unnumbered migrations are renumbered to fit.
- **ADRs** run 0020–0027:
- 0020 Undo of Cooked and Not cooked
- 0021 A removed Meal Slot keeps its history
- 0022 Plan edits replan only what they break and say what changed
- 0023 A Tick covers an amount
- 0024 A Line can be ticked more than once
- 0025 Away is kept on the Member
- 0026 Today composes its own grid (amends 0016)
- 0027 Sizes follow the browser's text size
- **system.md sections:**
- §11 Breakpoints (DS)
- §12 Short viewports and fixed chrome (SHORT, which wrote "§11")
- §13 Overlays (DS, which wrote "§12")
- §14 Safe editing (SAFE, which wrote "§12"; its R1–R5 become §14.1–§14.5, so they are not confused with R-A–R-F)
- §15 Focus and targets (A11Y, which wrote "§11")
- §16 Loading, empty, offline and error (RES)
- **Page-layout rules.** P1–P23 already exist in `scripts/lib/page-layout-rules.mjs` and keep their numbers. SHORT's and A11Y's "P17–P20" were new rules that collided with existing ones. The final new numbers are:
- DS: P24–P31 (P31 is the R-F squircle)
- SHORT: P32–P35
- A11Y: P36–P39
- SET's "ListRow title narrower than 120 px": P40 (it was P29, then P31)
- three unnumbered probes from SSP and RES: P41–P43
- **check-ui rules.** Rules 1–12 exist. The new ones are 13–26 (DS's "rule 15 media-width" and "rule 16 status-tone" become 19 and 20).

**Design conflicts**
- (a) **Focus rings.** A11Y-02 is final. Only containers with under 9 px of padding nest: field frames, timer pills, rail timer tiles, chips and pills that hold buttons. A control in a tile or a row (16 px padding) takes the normal outer ring. Six places drew an inner ring and follow A11Y-02 instead:
- TB-02's Done on the Advance Steps tile;
- SET-06's chips in the Select strip and SET-09's Course row ↑ ↓ ×;
- RX-02 and RX-14's Ingredient line ⋮, Step drag handle and Tag chip remove (a removable chip is one button);
- SSP-12's keypad keys (siblings 8 px apart, not nested);
- SAFE-08's Segmented option (the ring goes round the whole track);
- PC's R-C+ example of "a status tile".

The timer pill's Pause and "+N" (PC-03, SHORT-01) and the stepper's − and + do nest.
- (b) **The board's Next Advance Step** is always an info tile (TB-07, approved mocks), not a surface tile while not overdue (DS-06).
- (c) **R-F:** DS-02's inner-span squircle, with the link as the whole track, is final. PC's variant that shrinks the link is superseded.
- (d) **Removed Meal Slots:** SAFE-02 defines the data (soft removal, partial unique index, restore). SET-15 shows it.
- (e) **Cook Step text** is weight 500 everywhere. SHORT's round-1 "600" and RX's "Step text at weight 600" (RX-01, RX-04) are superseded.
- (f) **Contrast:** A11Y's and DS's re-measurements win. The inner ring on the soft fill is 4.35–4.73:1 in light and 6.17–6.42:1 in dark across all accents, not PC's and RX's 3.4/3.6.
- (g) **Other conflicts found:**
- PC-01's `undoToken` restore and SAFE-07's Regenerate Undo become one mechanism: `plan_snapshots` and `POST /api/plan/restore`. Regenerate returns `{changed, undoToken}`, and `/regenerate/{token}/undo` is not built.
- PC-11's summary row still says "7 columns": the decision is option B.
- DS-06's text that still gives Advance Steps the warn tone is superseded by DS 3 (info).
- A11Y-12's and RES-10's update prompts are one toast with Reload.
- TB's "no `data-theme` selector" rule is A11Y's `scheme-attr`.
- The IconSet gap is 8 px (fine pointer) or 12 px (coarse), not 4 px.
- `--text-step-weight` was claimed by PC, SHORT and DS. It has one owner.
- (h) **P31:** DS-02's bottom-bar squircle keeps P31. SET's rule becomes P40.
- (i) **Step text weight:** see "The review rules" above.
- (j) **DetailList:** `ui/DetailList`/`DetailRow` (DS-12) is built by the action-primitives package. Every theme's read-only "ListRow-style rows" in notices, dialogs, toasts and previews use it. `ListRow` is only for rows the person acts on.

**Shared primitives.** One package owns each shared file in each wave: Button, IconButton, CloseButton, DetailList, Toast, BottomSheet, Dialog, FormActions, StickyActionBar, ListRow, Select, Tile, Chip, Segmented, the focus layer, `shell.css` and the tokens in `styles.css`. The plan's "Shared files" table gives the order. For example, `ui/BottomSheet.*` goes DS-R, then the focus sweep, then one overlays package that merges DS-A, SHORT P2, SAFE `confirmDismiss`, SET-A's body padding and PC's `context` prop. `ui/ListRow.*` goes to one row package that merges DS-A, DS-E, A11Y-P5, SET-B, SSP P1, PC P2 and RES P5's slots.

## What was not checked, and what release QA must cover

The reviews ran in headless Chromium (WebKit and Firefox spot checks), with fake cameras and a fake Recipe Assistant. They did not reach:
- real iOS Safari and Android Chrome devices: the on-screen keyboard and `visualViewport`, real notches and safe-area insets, rotation as an event, Add to Home Screen;
- Web Push delivery and the notification landings (these were read from code), the alarm sound, haptics and the scan beep;
- camera, torch, live barcode reading and receipt photos from a camera;
- voice commands and Wake Lock;
- WebKit gaps: the full matrix was not run in WebKit, and WebKit was not run below 390 px or in landscape;
- forced colours on Windows, and real screen readers (VoiceOver, TalkBack, NVDA);
- real 200–400 % zoom (only approximated by a 320 px reflow);
- pointer drag-sorting of Steps;
- Sign-in requests with a pending request (Google sign-in);
- a real Recipe Assistant read of a web page or photo;
- Reheat with a Leftover meal due today;
- receipt review sections beyond "Not scanned".

Release QA therefore does three things before the tag:
1. Re-walks workflows A–K against the built binary at phone, tablet and desktop, plus 320×568, 844×390 and dark.
2. Upgrades a real beta.8 database copy, and a beta.7 one.
3. Hands the user a short real-device list to check after the tag: iPhone Safari (keyboard, notch, landscape rail, push landing, camera), an Android phone (camera, torch, haptics, offline ticks), an iPad on the Kitchen board, and Windows high contrast. Any defect found there goes to a beta.9.x fix release.

The checklist is in [ui-remediation-plan-3.md](ui-remediation-plan-3.md#release).
