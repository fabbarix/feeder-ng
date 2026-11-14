# UI review 3: decisions

The user took these 56 decisions on 2026-11-14, after the ten chapters were written. Each chapter's "Decisions for the user"
section lists the options and mocks; this file records the choice. **Changed** marks the nine places where the user chose
something other than the chapter's recommendation; those chapter items were revised to match.

## Shopping and stock ([shopscan.md](shopscan.md))

| # | Decision | Choice |
|---|---|---|
| SSP 1 | What a tick by hand adds to Stock | The last-bought pack; the Line's need when no pack is known |
| SSP 2 | Ticking on Shop | One tap, with Undo and Change in the toast |
| SSP 3 | Need that grows after a tick | A tick covers an amount; the extra reappears in To get. New ADR, spec §9 amended |
| SSP 4 | Restock wording | "Below 4 · 2 in Stock", compact "2 in Stock", everywhere |
| SSP 5 | A Product's Price before a first purchase | Used for the estimate. Spec §9 amended |
| SSP 6 | "Not available" | No new Line state; the Line sheet lists the Planned Meals and offers "Get something else…" |
| SSP 7 | Big quantities | kg and l from 1000 g / 1000 ml; the Base Unit stays the stored unit. Spec §9 display rule amended |
| SSP 8 | Keep | One tap makes the Stock Lot "Good until today"; Change offers other dates. GLOSSARY and spec §6 change |

## Planning the week and cooking ([plancook.md](plancook.md))

| # | Decision | Choice |
|---|---|---|
| PC 1 | How far an edit may change the week | Replan only what the edit breaks; a Bought meal never moves as a side effect; "What changed" toast, Review and Undo. The "hold the next days" setting is not built (confirmed in round 1; its mock was only tidied) |
| PC 2 | Week grid on wide screens | **Changed after the mock review (round 1):** auto-fill by minimum day width at every size, with the orphan day spanning the rest of its row (option B). The 7-column grid is not built |
| PC 3 | A Member away for several days | **Changed:** an "Away" record on the Member with a date range, which also covers dates past the Planning Horizon (not the bulk Attendance sheet) |
| PC 4 | Marking a future meal Cooked | Not before its date |
| PC 5 | Earliest start | A Household setting "Earliest start", default 06:30; a Pinned meal is only flagged |
| PC 6 | How Cook Mode opens | On a "Get ready" tile with the scaled Ingredient list |
| PC 7 | Leftovers of one Recipe with the same Use-by | Shown as one row |
| PC 8 | Undo after Cooked | See SAFE 2 |

## Shell, Today, Kitchen board ([today.md](today.md))

| # | Decision | Choice |
|---|---|---|
| TB 1 | Today on a desktop | Hero on two of three tracks with an aside (L-01, L-07); one sentence added to system.md §4 |
| TB 2 | When the hero moves on | At the slot time; the past meal goes to the top of To confirm |
| TB 3 | Zero-waste streak at 0 | Hidden on Today, "0 days" on the board |
| TB 4 | Leaving the Kitchen board | A visible Close control that dims after 10 s |
| TB 5 | Scan session on Today | A "Shopping at <Shop>" tile with Back to Scan; the ux-brief line is reworded |
| TB 6 | First-run checklist | Recipes step completes at 5; the checklist stays until done or hidden |
| TB 7 | Board hero heading | The same eyebrow as Today's hero |
| TB 8 | Start cooking notification | Lands in Cook Mode for that slot |

## Short viewports ([short.md](short.md))

| # | Decision | Choice |
|---|---|---|
| SHORT 1 | Navigation in phone landscape | A 64 px compact rail |
| SHORT 2 | Bottom bar while a text field has focus | It hides |
| SHORT 3 | Cook Mode tap zones | On phones too, at every width. Spec §11 amended |

## Design system ([ds.md](ds.md))

| # | Decision | Choice |
|---|---|---|
| DS 1 | Bottom bar below 360 px | Icons only |
| DS 2 | Breakpoints | em everywhere; type tokens in rem |
| DS 3 | Warn tone | **Changed:** the mustard warn tone as proposed, except that Advance Steps tiles (Today, Cook Mode, the board) use **info** (blue), not warn |
| DS 4 | Settings hub descriptions | Two lines allowed on navigation rows |
| DS 5 | Leftover meta order | "Use by Tue · 1.25 portions" |
| DS 6 | Pantry Sort chip when it cannot show its value | **Changed:** it does not wrap; it becomes icon-only with its value in the accessible name. pantry-filter.md §3 "one line" stands |

## Accessibility foundations ([a11y.md](a11y.md))

| # | Decision | Choice |
|---|---|---|
| A11Y 1 | Boundary of the Search field and the Segmented track | **Changed:** a stronger fill plus a 2 px bottom rule (option B), not the 1.5 px outline |
| A11Y 2 | Selected and pressed states | Accent container, accent ring, plus a check or filled icon |
| A11Y 3 | Exclusions tile | Titled "Exclusions", with a summary line and a per-Member note |
| A11Y 4 | A new version while the app is open | A toast with Reload (same as RES 3) |

## Recipes ([recipes.md](recipes.md))

| # | Decision | Choice |
|---|---|---|
| RX 1 | Recipes list on a phone | The compact card |
| RX 2 | Cook entry on wide screens | A Cook tile under the hero from 1024 px; the sticky bar below |
| RX 3 | Correcting a misread import | Read-only review; Edit on each imported Recipe afterwards |
| RX 4 | Recipe kind | One Segmented control; Whole meal stays a Switch |
| RX 5 | Editor sections | "Description and source" and "Planning" collapsed for new and saved Recipes |
| RX 6 | Tag field | Removable chips plus "Add Tag" opening the shared Tag list |

## Settings and catalogue ([settings.md](settings.md))

| # | Decision | Choice |
|---|---|---|
| SET 1 | Typed Product barcodes | An all-digit code needs a valid length and check digit; codes with letters stay accepted |
| SET 2 | Desktop width of catalogue detail pages | The narrow column, cards two-up |
| SET 3 | Allowlist invite | **Changed:** "Copy sign-in message" plus a Share item where the device has a share sheet |
| SET 4 | "New Product" on the Products list | Added |
| SET 5 | Edit from an "Every day" Meal Slot card | Starts with all days of that name |

## Resilience ([res.md](res.md))

| # | Decision | Choice |
|---|---|---|
| RES 1 | Hand ticks offline | Queued, like Scans |
| RES 2 | An offline tick that syncs after someone else ticked the Line | **Changed:** always add the Stock Lot (both people bought it); the row says so |
| RES 3 | A new version while the app is open | A toast with Reload |

## Safe editing ([safe.md](safe.md))

| # | Decision | Choice |
|---|---|---|
| SAFE 1 | Unsaved changes in the Recipe editor | **Changed:** a blocking "Leave without saving?" dialog (Keep editing / Discard changes); a draft is kept only across a reload or a crash (option B) |
| SAFE 2 | Undo for Cooked and Not cooked | From the toast and from the Planned Meal sheet until the end of the household day |
| SAFE 3 | Regenerate | A real Undo from a server snapshot |
| SAFE 4 | Remove Member | Confirm, then an Undo toast |
| SAFE 5 | Undo toast duration | 8 s, pausing on hover, focus and while hidden; Scan's 5 s stays |
| SAFE 6 | Your preferences | **Changed:** an explicit Save with a live whole-app preview and a "Discard changes?" guard (option B) |
| SAFE 7 | Removing a Meal Slot with Cooked history | **Changed:** removal keeps the Cooked history (option B), designed in this plan rather than left as a follow-up |

## Mock review, round 1 (2026-11-14)

The user reviewed the Plan and Cook mocks first: 5 items approved, 11 sent back. Four rules came out of the comments and
apply to every theme; their text, tokens and contrast numbers are in [plancook.md](plancook.md), "Review round 1":

| Rule | What it says |
|---|---|
| R-A | Buttons look like buttons: every action has a visible shape; a bare-text button is never an action in a tile, notice, toast, sheet footer or banner |
| R-B | Close is one control: a 40 px circular outline icon button that never squashes; a sheet whose footer has Cancel shows no Close |
| R-C | Focus rings are never clipped or overrun |
| R-D | A toast with detail has a headline, a muted subline, optional body text, then real buttons |

The user also asked that the other nine themes be brought up to these rules before reviewing them.

## Mock review, round 2 (2026-11-14)

After the round-1 rework the user approved 12 of the 16 Plan and Cook items and commented on the other four. Four more
rules came out of it; their text is in [plancook.md](plancook.md), "Review round 2", and every theme applies them:

| Rule | What it says |
|---|---|
| R-C+ | A control nested in a container with its own boundary draws its focus ring inside itself, and the container's accent boundary steps back: never two rings fused |
| R-D+ | A plain success toast has no icon; an icon that carries a status sits in the headline line, left of the headline |
| R-E | Items with a key, a state and detail are set as rows, never as a bullet list of sentences |
| R-F | Under 360 px the bottom bar is icons only; the current page and Scan are 40 px squircles fully inside the bar |

The user also chose the Cook Mode Step text weight: **Medium (500)**; the size stays large.

## Approval (2026-11-14)

After the second round and the nine-theme sweep, the user approved the mocks of all ten chapters and asked for planning
and development to start, with Opus agents as developers, and for 1.0.0-beta.9 to be tagged and released when the work is
done. The build plan is [../ui-remediation-plan-3.md](../ui-remediation-plan-3.md).
