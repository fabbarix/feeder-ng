# R15: Meal Slots (multi-day edit, WeekdayPicker, attendee pills)

Team R15, pipeline step 1 (design and red tests). Spec: functional-spec §3 (Editing a Meal Slot on several days; The overview shows who attends), decision 25. Glossary: **Matching Meal Slot**, **Meal Slot**, **Attendance**. Decisions: ui-review-2 §3.7 (matching by name; WeekdayPicker; pills). Items R15 folds in: see section 9.

## 1. What changes for the user

1. Editing a Meal Slot asks "Apply to" which weekdays (chips). Default: the day being edited. The same name on the other chosen days gets the same change; days without one are skipped and reported. One save, all or nothing.
2. Weekdays are chosen with seven toggle chips everywhere (no dropdown).
3. The overview shows who attends each Meal Slot as pills; below 1024 px a list, from 1024 px a week table. "Nobody attending" is a warning pill that leads to the fix. Each Meal Slot has an anchor.

## 2. API

`PATCH /api/meal-slots/batch` (Admin; CSRF guard as every write). Go 1.22 mux: the literal `batch` is more specific than `PATCH /api/meal-slots/{id}`, which stays as is.

Request:

```json
{ "match": "Dinner", "weekdays": [1, 2, 3, 4], "set": { "name": "Supper", "time": "19:45", "attendance": [{ "memberId": 1, "portionFactorOverride": null }] } }
```

- `match`: the Meal Slot name before the edit (case and edge spaces ignored, same as the `UNIQUE (weekday, name) NOCASE` rule).
- `weekdays`: ISO 1..7, at least one; duplicates are dropped; the response is ascending.
- `set`: only the fields present change. `attendance` replaces the usual Attendance of every matched slot (`[]` = nobody; absent = untouched). The client sends only fields the Admin changed, so a time edit never overwrites Attendance that differs between days.

Response `200`:

```json
{ "match": "Dinner", "updated": [ /* slotBody, weekday order */ ], "skipped": [ { "weekday": 4, "reason": "no_slot" } ] }
```

Errors (nothing is changed in any of them):

| Case | Status / code |
|---|---|
| `match` blank, `weekdays` empty or outside 1..7, `set` empty, bad `time`, blank `name`, bad Attendance | 422 `validation_failed` (message names the field) |
| unknown Member / Member twice in `attendance` | 422 `unknown_member` / `duplicate_attendee` |
| no chosen weekday has a Meal Slot of that name | 422 `no_matching_slot` |
| a rename clashes with a Meal Slot already on a chosen weekday | 409 `duplicate_slot` |
| User / anonymous | 403 / 401 |

Atomic: `Store.UpdateSlotsBatch` runs matching and all updates in one `inTx`; any error rolls everything back. It publishes one household event `changed: mealSlots` (handler, after commit). Date Attendance overrides are untouched, as in `UpdateSlot`. The per-slot `PATCH /api/meal-slots/{id}` stays (it can still change the weekday); the UI no longer calls it for editing.

Backend layout: `household.MatchSlots`, `BatchInput.Normalized/Validate` (pure, in `internal/household/batch.go`, unit-tested without SQL); `store.UpdateSlotsBatch`; `httpapi` handler is thin (decode, `Normalized`, `Validate`, store, respond). `ErrNoMatchingSlot` maps in `writeErr`.

## 3. `ui/WeekdayPicker` (shared primitive, `web/src/ui/WeekdayPicker/`)

`<WeekdayPicker label value onChange weekStart? locale? disabled? helper? error? />`; value is ISO 1..7; `onChange` always ascending.

- DOM: `role="group"` named by `label` (visible label above), seven `<button type="button" aria-pressed>` chips. Visible text is the short name ("Mon"), the accessible name the full name ("Monday"), both from `Intl.DateTimeFormat(locale)` (`weekdays.ts`, tested with `it`).
- Order: Monday first by default; `weekStart` 1, 6 or 7. **No household week-start setting exists today**; the prop is the hook for it (question 3).
- Keyboard: every chip is a tab stop; Space/Enter toggle; ArrowLeft/Right move focus (wrapping), Home/End jump. Arrows never change the selection.
- Selected is not colour alone: filled accent, bolder text and a 12 px `tick` glyph (existing icon) in the chip corner. Focus ring from the single R2-F focus ring.
- Size: `display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px`, chips `min-block-size: 44px`. A 326 px sheet interior gives (326 − 12) / 7 = 44.9 px, so all seven fit at 390 with 44 px targets; nothing scrolls sideways. Developer verifies in a browser at 360 and 390 (the CSS test pins gap ≤ 2 px and 44 px).
- `error` renders `role="alert"`, linked with `aria-describedby` on the group.
- Tokens only; `font-size` from the type scale.

Reuse: Meal Slot add (label "Days") and edit ("Apply to"). **Slot Rules and Date Attendance do not pick weekdays** (Slot Rules pick a Meal Slot through `MealSlotSelect`, Date Attendance a date), so there is no other call site today; the primitive is ready for the next screen that needs it.

After R2-L merges: add `export { WeekdayPicker } from './WeekdayPicker/WeekdayPicker'` and `export type { WeekdayPickerProps } from './WeekdayPicker/WeekdayPicker'` (and `MemberPill`) to `web/src/ui/index.ts`, and a Gallery section "WeekdayPicker" (empty, two selected, weekStart 7, error) plus "MemberPill" (initials, emoji, long name) in `Gallery.tsx` and its section list test. Until then screens import by path (`../../../ui/WeekdayPicker/WeekdayPicker`).

## 4. `ui/MemberPill` (shared primitive)

`<MemberPill name colour glyph? />`: `Avatar` (size sm, ring in the Member colour, emoji or initials) plus the first name (first word of `name`), in a pill (`border-radius: var(--radius-pill)` token, neutral surface so the Member colour is the ring and a 3 px start accent). The wrapper carries `data-member-colour` and `--member-colour`, like `MemberAvatar`, so `memberAvatar.css.test.ts`-style guards apply. Contrast comes from the neutral surface, never from the Member colour.

## 5. Settings feature structure

Libs (plain TS, unit-tested, no React):

| File | Functions |
|---|---|
| `lib/multiDay.ts` | `matchingSlots`, `quickPicks`, `sameDays`, `changedFields`, `hasChanges`, `batchRequest`, `summaryLines`, `resultMessage` |
| `lib/attendeePills.ts` | `attendeePills(attendance, members, max = 4)` → `{ state, shown, more }` |
| `lib/weekGrid.ts` | `weekGrid(slots, weekStart)` → `{ days, rows: { name, cells } }` |
| `lib/slotAnchor.ts` | `slotAnchorId`, `slotHash`, `slotIdFromHash` |

Strings (all in `strings.ts`): "Apply to", "Days", "All days with {name}", "Every day", "Weekdays", "Weekend", "What will change" (summary list label), "Nothing to change.", "Nobody attending", "Meal Slots by weekday", "and {n} more: {names}", "Attending {slot} on {weekday}", "Updated {name} on {days}." and the skipped sentences (section 6 of the tests give the exact text).

Hooks: `useMealSlots` gains `batchUpdate(request)` (mutation, invalidates the list). `useMealSlotsPage` : `save` for editing builds `batchRequest` and calls it, then toasts `resultMessage` (success; also when days were skipped) and closes the sheet; on error the sheet stays open with the message and nothing was saved. Adding is unchanged (sequential `POST`s with the partial-save message). New `useSlotAnchor(slots)`: reads `useLocation().hash` (and `window.location.hash`), when the slot exists calls `scrollIntoView({ block: 'center' })` and focuses the element (`tabIndex={-1}`), once per hash. Viewport: `useMediaQuery('(min-width: 1024px)')` (existing, `ui/lib`) chooses `MealSlotGrid` or `MealSlotWeek`; the page does not render both.

Components (thin; they render and wire events):

- `AttendeePills`: `role="list"` named "Attending {slot} on {weekday}" of `MemberPill`s as `listitem`s, a `+N` listitem with `aria-label="and N more: names"`; or, for nobody, a pill with `data-tone="warn"`. With `onFix` it is a button named "Nobody attending. Choose who attends {slot} on {weekday}"; without it, plain text. Warn tone reuses R13's `warn` tokens (`--status-spoil-*` as `toneStyle` does), icon `warning`/`attendance` from `ui/icons.ts` (both exist; no new glyph, no icon budget used).
- `MealSlotWeek` (mobile/tablet list): each slot gets a wrapper `id={slotAnchorId(slot.id)}` (`tabIndex={-1}`) holding the chip and `AttendeePills`.
- `MealSlotGrid` (>= 1024): `<table aria-label="Meal Slots by weekday">`; `th scope="col"` short day names, `th scope="row"` Meal Slot names; each cell has the anchored slot button "Dinner 19:30" plus pills, or for an Admin an add `IconButton` "Add {name} on {weekday}" (starts an add with that weekday and name). Accessible cell name "{Name} on {Weekday}".
- `MealSlotEditor`: edit mode shows `WeekdayPicker` "Apply to", the quick-pick `Chip`s (kind filter, `selected` when the selection equals the pick), Name, Usual time, Attendance, then the summary list ("What will change", `aria-live="polite"`) built from `matchingSlots` + `summaryLines`, then `FormActions`. Add mode shows `WeekdayPicker` "Days" with "Every day / Weekdays / Weekend". The old `Select`/`MultiSelect` for weekdays go. New props: `slots`, `onApply`, `weekStart`, `locale`.

Layout uses `FieldRow`/`FormActions` and the R2-F field sizes (time field `size="sm"`).

## 6. Edit flow in detail

1. Admin taps "Dinner 19:30" on Tuesday; the sheet opens with Tuesday pressed.
2. The Admin presses "All days with Dinner" (Mon, Tue, Wed, Thu if those have a Dinner) or toggles chips.
3. They change the time. Summary: "Update Dinner on Mon, Tue, Wed, Thu"; if Friday is also pressed: "Fri skipped: no Dinner".
4. Save: nothing changed → alert "Nothing to change."; no weekday → "Choose at least one weekday."; else one `PATCH /api/meal-slots/batch` with `{ match: <original name>, weekdays, set: <changed fields> }`.
5. Toast "Updated Dinner on Mon, Tue, Wed, Thu." (skipped: "Updated Dinner on Mon, Tue, Thu. Wed has no Dinner, so it was skipped."; two or more: "Wed and Fri have no Dinner, so they were skipped.").
6. A rename that clashes (409) keeps the sheet open with the server message; nothing changed.

The summary is computed from the loaded list; the server is the authority (a slot added meanwhile by another Admin is matched, the toast comes from the response).

## 7. R13 deep link

`slotHash(id)` gives `#meal-slot-<id>`. R13's `nobody_attending` fix becomes `to: '/settings/meal-slots' + slotHash(firstAffectedSlot.mealSlotId)` (the group's slots are sorted by date and time, so the first is the earliest). `groupByCause` already has the slots; `META[cause].fix(label)` needs the group (test: `plan/lib/couldntGroups.anchor.test.ts`). The Meal Slots page scrolls to and focuses it (section 5). This is a small change in R13-owned `plan/lib/couldntGroups.ts`; R2-2 is editing `plan/plan.css` only, so no file clash.

## 8. Tests (all red now, written first)

Go: `internal/household/batch_test.go` (MatchSlots, validation), `internal/household/store/store_test.go` (atomic), `internal/household/httpapi/slots_batch_test.go` (matching by name, skipped days, only sent fields, nobody, case-insensitive, atomic on clash and unknown Member, validation table, Admin-only, CSRF, event). BDD: `bdd/features/household/meal_slots_multi_day.feature` + `bdd/steps_r15_test.go` (edit Dinner on Mon, Tue, Wed; skipped Thursday; Attendance; clash rolls back).

Web: `ui/WeekdayPicker/{weekdays,WeekdayPicker}.test.ts(x)`, `WeekdayPicker.css.test.ts`, `ui/MemberPill/MemberPill.test.tsx`; `settings/lib/{multiDay,attendeePills,weekGrid,slotAnchor}.test.ts`; `settings/components/{AttendeePills,MealSlotGrid,MealSlotWeek.pills,MealSlotEditor.multiday}.test.tsx`; `settings/screens/MealSlotsPage.r15.test.tsx`; `plan/lib/couldntGroups.anchor.test.ts`. Stubs (throw "not implemented" or render null) keep `typecheck` green so only these fail.

Existing tests that describe the replaced behaviour and must be rewritten or removed by the Developer in the same commit that makes the new ones pass (they pass today): `MealSlotEditor.test.tsx` (weekday `MultiSelect` / `Select` cases: "adds a Meal Slot for several weekdays", "starts with the weekday...", "needs at least one weekday", "needs a name and a time", "edits one existing slot with a single-choice Weekday"), `SettingsPages.test.tsx` (MealSlotsPage: "adds one Meal Slot on several weekdays", "when one weekday fails", "edits the weekday of an existing slot"), and anything asserting `getByRole('status')` uniqueness in the editor (the summary is a list, so none expected). Their add-mode intent is covered by `MealSlotEditor.multiday.test.tsx`; Developer ports the partial-save page test to chips.

## 9. ui-review-2 items for these screens

- 3.7 decisions: all three implemented above.
- F-04 (action placement): the sheet uses `FormActions` (Save right-aligned, Remove danger-tertiary on the other side), as R2-F made available.
- F-01/K1(c): the Usual time uses `size="sm"`.
- F-09 (single focus ring): chips and pills use the shared ring; no third style.
- K3: pills use the avatar (emoji or initials) from R11a.
- R2-3 owns other settings files; Meal Slots files are serialised with it by the PM.

## 10. Product questions

1. Editing can no longer move a Meal Slot to another weekday (the chips mean "apply to"). Recommend: accept; move = add + remove. (The per-slot PATCH still allows it for API users.)
2. The edited day may be deselected (the change then skips the slot being edited). Recommend: allow, the summary makes it visible; require at least one day.
3. There is no household week-start setting or locale; `weekStart` defaults to Monday and names use the browser/document language (`document.documentElement.lang`, fallback `en`). Recommend: add a "Week starts on" setting in R2-3 later; the prop is ready.
4. "Nobody attending" tone: warn (as asked), whereas R13's Couldn't plan tile for the same cause is info. Recommend: keep warn on the overview (it is the place to fix it) and leave R13's tile alone.
5. Attendance in a multi-day edit overwrites the full usual list on every matched day when changed. Recommend: accept (the summary names the days).
6. Slot Rules and Date Attendance pick no weekdays today, so WeekdayPicker has one family of call sites (Meal Slots add/edit).
