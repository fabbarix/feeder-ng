# Settings > Meal Slots redesign (beta.5): options

The current page shows a jumble of chips for each day, the same Attendance pills repeated, tiny Course text, and a + stranded at the end of each row (user's iPad screenshot, 1024 px portrait). There are three Bento options, rendered with the app's real tokens and primitives:

- **A: Week grid.** Meal Slot names are rows and weekdays are columns. Cells show the time plus only what differs, and the selected cell has a detail tile.
- **B: Slot cards** (recommended). One tile per Meal Slot shows the usual time, the Courses, the Attendance stack, a 7-day strip and a "Differs on" list.
- **C: Day tiles.** One tile per weekday, built like Plan's day tiles, with aligned slot rows. Chips appear only for differences and beta.5 date changes.

Shared rules:
- Attendance is shown once for the Household. A slot shows it only where it differs.
- There is one header **Add Meal Slot**.
- Every tap target has a chevron, a dashed "+" or a real button (**Edit**, **Change a date**).

Mockups, screenshots (390 and 1024 px, plus a dark render at 1024) and the full comparison are in the session scratchpad: `/tmp/claude-1000/-opt-mrwho-Projects-feeder-ng/d50f583b-f8d6-4db2-be9c-007a20ecf13a/scratchpad/ms-options/` (README.md, option-{A,B,C}-{390,1024}.png, option-{A,B,C}-1024-dark.png).

Open questions before implementation:
1. Should Settings show beta.5 date changes read-only? beta5-plan §2.1 currently says it shows none.
2. B and A summarise "usual" values by majority across Matching Meal Slots. What is the tie rule?
3. What can a plain User tap?

## Decision: option B, and the build (test-first)

The user chose **B: one Bento card per Meal Slot name**. The answers to the three open questions:
1. "Dates that differ" stays, read-only.
2. "Usual" is the most common value across the card's days; a tie goes to the earliest weekday (Monday first, ISO order, whatever the week start).
3. A plain User sees the cards read-only, except **Change a date** (and the "Nobody attending" button, which leads to the one-date Attendance, as today).

### Page anatomy

- **Header:** the Settings breadcrumbs, the h1 "Meal Slots" and one primary **Add Meal Slot** button (an Admin only; disabled until the Members have loaded). `SettingsHeader` gains an optional `actions` slot for it (already added).
- **Household line**, once: "Everyone eats unless a Meal Slot says otherwise". Not shown with no Meal Slot (an EmptyState "No Meal Slots yet" instead).
- **One card per name** in a `BentoGrid`, ordered by usual time then name. A name that runs all 7 days spans the full row (`data-span="full"`), the others take one column (two per row on a tablet).
- **"Dates that differ"** tile last, read-only, built from `DateException`s. Main has no list endpoint for date exceptions (Date Attendance is read one slot and date at a time), so `useDateExceptions` returns `[]` until beta.5's per-date backend (SD/F1) swaps in a real list; the tile then reads "No upcoming date differs from the usual." F1 widens `DateException`/`DatePart` with Guests (the word is not in the GLOSSARY yet, so no Guests string is added now).
- The overview is the same on phone and tablet: `MealSlotWeek`, `MealSlotGrid`, `weekGrid`, `slotGroups` and their tests go away if nothing else uses them (the developer checks with grep).

### Card anatomy (`MealSlotCard`, a `Tile as="section" aria-label={name}`)

1. Icon (`mealSlotIcon(name)`), the name as an `h2`, the days (`daysLabel`), and the **usual time** in tabular numerals (`data-testid="usual-time"`).
2. **Courses** as a `ul[aria-label="Courses"]` of pills ("Main", "Dessert (optional)", optional ones outlined). A Course some attendees opt out of gets a line "Dessert: Mia only".
3. **Attendance only where it differs**: `AttendanceStack` (an Avatar stack of up to 4, then "+N", with the text "Fabio only") when the usual Attendance is some of the Members; a warning button "Nobody attending" (`aria-label` = `nobodyAttendingFix(name, weekday of editSlot)`) when nobody; nothing when everyone.
4. **The 7-day strip** (`MealSlotWeekStrip`, `role=group`, "<name> by weekday"): a day the name runs shows its short name and time; an Admin gets a button "Dinner on Wednesday" that edits that weekday's slot; a day that differs has a dot and an accessible description containing "differs"; a free day is a dashed "+" button "Add Dinner on Friday" (Admin only, disabled while the Members load). A plain User gets no buttons in the strip. The element of a run day has `id="meal-slot-<id>"` and `tabIndex=-1` for the deep link (`slotAnchorId`).
5. **"Differs on"** (`MealSlotDifferences`): a `ul[aria-label="Differs on"]`, one row per differing weekday, "Fri · 20:00 · Main only" (`differenceParts`); an Admin row is a button "Edit Dinner on Friday" with a chevron.
6. **Footer:** "Edit Dinner" (Admin, edits `card.editSlot`) and "Change a date" (everyone; `aria-label` "Change a date for Dinner"; opens the one-date Attendance of `card.next`).

### Lib: `settings/lib/mealSlotCards.ts` (pure, no React)

- `pickUsual(entries)`: most common by key; ties to the earliest ISO weekday.
- `buildMealSlotCards(slots, members, { today, weekStart })`: group by name (trim, case-insensitive); per card `days`, `usualTime`, `usualAttendance` (`everyone | nobody | some`, Members order, gone Members ignored), `usualCourses` (`CourseChip` with `eaters`), `week` (7 cells in week order), `differences` (week order, only the fields that differ: time, Attendance, Courses by id/order/optional/opt-outs), `span`, `editSlot` (earliest weekday holding all usual values, else the earliest weekday) and `next` (the soonest upcoming run, today counts).
- `daysLabel`, `attendanceText`, `differenceParts`, `datesThatDiffer`, `datePartText`: the words and rows.

### Hook

`useMealSlotsPage` (existing) gains `cards`, `dateRows`, `editCard(card)` (opens the sheet on `card.editSlot`) and `changeDateOf(card)` (opens the one-date Attendance on `card.next`, for an Admin too, closing the sheet). `cards` is empty until the Meal Slots and Members have loaded. `useDateExceptions` is the seam for the per-date list.

### Components (all new, `settings/components/`, own CSS `settings/mealSlotCards.css`, not `settings.css`)

`MealSlotCards` (household line, grid, empty state, dates tile), `MealSlotCard`, `MealSlotWeekStrip`, `MealSlotDifferences`, `AttendanceStack`, `DatesThatDiffer`. They render and wire events; shared primitives only (`Tile`, `BentoGrid`, `Avatar`, `Chip`, `Button`, `IconButton`, `Icon`). `MealSlotEditor`, multi-day editing and `DateAttendancePanel` are reused unchanged.

### Tests (red)

`lib/mealSlotCards.test.ts` (grouping, usual values and the tie rule, differences, strip, edit/next slot, 5 names, 6 Members), `hooks/useMealSlotsPage.cards.test.tsx`, component tests beside each new component (fixtures in `components/mealSlotCardFixtures.ts`), `screens/MealSlotsPage.cards.test.tsx`, the existing page tests migrated to the card selectors (`MealSlotsPage.r15/.courses`, `SettingsPages`), and `failRoutes.test.ts` expects `/settings/meal-slots` to be a **fail** route (the developer adds it to `scripts/check-page-layout.modes`; the route's width stays `default`). The layout guard's own visual check at 390 and 1024 is the developer's to run once (`PAGE_LAYOUT=quick` is the runner's).

### Open for the PM

- Course eaters read "Dessert: Anna, Marco only" (the mockup's wording); with six Members that is long. Alternative: "Dessert: without Sam".
- `Edit <name>` opens the usual slot; the multi-day editor starts with that one weekday selected (its "All days with <name>" quick pick is one tap away).
