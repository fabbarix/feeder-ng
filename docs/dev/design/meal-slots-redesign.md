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
