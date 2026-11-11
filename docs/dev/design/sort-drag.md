# SORT: a shared sortable primitive and drag handles in the Recipe editor (beta.1)

Source: the user requirement "drag handles for Ingredient lines and Steps in the Recipe editor", and `docs/dev/design/r2-1-recipes.md` section 1 (question 2 there said "no drag and drop"; this package reverses that for the editor). Not an ADR matter: no ADR covers drag and drop.
Tests first and red. Production code in this commit is type-only stubs: `ui/Sortable/{reorder.ts,strings.ts,useSortable.ts,Sortable.tsx,index.ts}`, the `ui/index.ts` exports, `lib/draft.moveLine`, `useRecipeEditor.moveLine`, three optional props of `IngredientLineRow`. The one real production change is the `drag` icon (section 7).

## Scope and ownership

In: `ui/Sortable/**` (new), `ui/index.ts`, `ui/icons.ts`, `features/recipes/{components/IngredientLineRow.tsx,components/StepsEditor.tsx,screens/RecipeEditorScreen.tsx,hooks/useRecipeEditor.ts,lib/draft.ts,strings.ts,recipes.css}`, and the Gallery (a "Sortable" group, optional).
Not in: any other list (Plan, Shopping List, Stock). The primitive is built so they can adopt it later. No new dependency; plain pointer events (no HTML5 drag and drop: it has no touch support on iPad Safari for custom handles and cannot be tested or announced properly).

## 1. API

```ts
// ui/Sortable (barrel: ui/index.ts)
<Sortable<T>
  items={T[]}  getKey={(t) => string}  getLabel={(t, index) => string}   // "garlic", "Step 2"
  onReorder={(from, to) => void}                                          // once, on drop; never on cancel
  renderItem={(t, ctx) => <li {...ctx.itemProps}>{ctx.handle}…</li>}
  as="ul" | "ol"  className  aria-label  disabled  strings />

interface SortableRenderContext { index; position; state: 'idle'|'lifted'|'dragging'; handle: ReactNode; itemProps: SortableItemProps }
useSortable({ count, labelOf, onReorder, strings?, disabled?, getScrollParent? }) =>
  { state, order, announcement, instructionsId, instructions, getHandleProps(i), getItemProps(i) }
```
- `Sortable` is a thin component over `useSortable`: it renders the list element, one hidden instructions paragraph (`.sortable__instructions`, the target of every handle's `aria-describedby`), one live region (`.sortable__live`, `role="status"`, `aria-live="polite"`, `aria-atomic="true"`), and calls `renderItem` in **display order** (`order`). `ctx.index` is the original index (what callbacks use), `ctx.position` where it is shown now.
- The item element stays the caller's (`IngredientLineRow` renders its own `<li>`): it spreads `itemProps` on it (`ref`, `data-sortable-item`, `data-sortable-index`, `data-state`, `style` with `--sortable-dy`). The handle is `ctx.handle`, a `<button type="button" class="sortable-handle">` holding `<Icon name="drag"/>`, which the caller places where it wants.
- `ui/Sortable/reorder.ts` is plain TypeScript, no React, no DOM: `moveItem`, `displayOrder`, `slotAt`, `autoScrollDelta`, `exceedsThreshold`, `keyTarget`, and the constants `DRAG_THRESHOLD`, `AUTO_SCROLL_EDGE`, `AUTO_SCROLL_MAX_STEP`. `useSortable.ts` owns the state machine and effects; `Sortable.tsx` only renders.
- **The primitive never reorders anything itself.** While lifted or dragged it only previews the order; `onReorder(from, to)` runs once on drop, and the owner computes the new list (Steps via `lib/steps.moveStep`, which remaps `after`; lines via `lib/draft.moveLine`). A cancel therefore needs no undo, and nothing that is not reversible (the `after` remap drops entries) is ever applied part way.

## 2. Interaction model

### 2.1 Pointer (mouse, pen, touch)
- Only the handle starts a drag. `pointerdown` on the handle (mouse: primary button only) records the start point and the pointer type, calls `setPointerCapture(pointerId)` (guarded: absent in jsdom), and snapshots the `getBoundingClientRect()` of every `[data-sortable-item]` as the slot list.
- **Threshold**: the drag starts when the pointer has travelled more than **4 px** (mouse) or **8 px** (touch, pen) from the start, in any direction (`exceedsThreshold`, Euclidean). Below it a press and release is a no-op, so a tap on the handle or a small finger wobble never reorders. Starting a drag announces the pick up (pointer wording, no key hint).
- While dragging: the item gets `data-state="dragging"` and `--sortable-dy` = pointer Y minus start Y (CSS translates it, so it follows the finger without a re-layout); the target slot is `slotAt(snapshot, pointerY + scrolledSoFar)`; when it changes the siblings preview the new order (the owner list is untouched) and the move is announced once.
- `pointerup` commits (`onReorder` if `from !== to`, else "unchanged"), releases the capture, stops the scroll loop. `pointercancel` and `lostpointercapture` without an up (the system took the touch) cancel. **Escape** (a `document` keydown listener, only while a pointer drag is live) cancels; the later `pointerup` is ignored. Only one pointer drives a drag; others are ignored.

### 2.2 Keyboard
Focus is on the handle button. State machine `idle -> lifted(from,to) -> idle`:
| In | Key | Effect |
|---|---|---|
| idle | Space | lift: `data-state="lifted"`, `aria-pressed="true"`, announce `liftedKeyboard`; `preventDefault` |
| idle | any other key | ignored, **no** `preventDefault` (Tab, Enter and the arrows keep their meaning) |
| lifted | ArrowUp / ArrowDown | `to` -1 / +1 (preview), announce `moved`; at an end: announce `atEdge`, state unchanged |
| lifted | Home / End | `to` = first / last |
| lifted | Space | drop: `onReorder(from,to)` if different, announce `dropped` or `droppedUnchanged` |
| lifted | Escape | cancel: restore order, announce `cancelled`; `stopPropagation` so a Dialog or Menu around the editor does not close |
| lifted | blur / Tab | cancel, as Escape |
| lifted | ArrowLeft/Right, others | ignored (the list is vertical) |
After every preview change the hook refocuses the handle (React moves the keyed node, which can drop focus in some browsers). Enter does not lift: the handle is a button and Enter activating nothing is the least surprising.

### 2.3 Touch on iPad: `touch-action` and long-press versus scroll
- **`touch-action: none` on the handle only** (`.sortable-handle`), never on the row or the list. A finger that starts on the 44 px handle never scrolls the page, so the browser does not steal the gesture with a `pointercancel`; a finger anywhere else on the row scrolls the page as usual. This is why **no long-press delay is needed**: the handle is already an unambiguous drag zone, and the 8 px touch threshold absorbs a tap.
- iPadOS: `-webkit-touch-callout: none; user-select: none` on the handle, and `onContextMenu` calls `preventDefault`, so a press-and-hold on the handle does not open the callout or the text selection loupe.
- The dragged item moves with `transform` (compositor), not layout, so iPad stays at 60 fps. The page is not locked (`overflow` untouched); auto-scroll (below) moves it.

### 2.4 Auto-scroll near the edges
While a pointer drag is live a `requestAnimationFrame` loop runs: `autoScrollDelta(pointerY, bounds)` gives a signed step. `bounds` is the scroll parent's rect (`getScrollParent`, default the nearest ancestor whose `overflow-y` scrolls, else the viewport `0..innerHeight`). Within **48 px** of an edge the step ramps linearly from 0 to **20 px per frame** at the edge and stays 20 beyond it (top is negative). The loop calls `scrollBy(0, step)` (`element.scrollBy` or `window.scrollBy`), adds the step to `scrolledSoFar` so `slotAt` stays right against the start snapshot, and re-evaluates the target each frame. It stops on drop, cancel and unmount (`cancelAnimationFrame`). The sticky action bar covers the bottom of the viewport; the loop uses the full viewport, so the lowest 48 px zone sits under the bar, which is intended (the user drags there to scroll).

### 2.5 Fallback: the actions menu (not removable)
Move up / Move down stay in a `ui/Menu`, the accessible route for switch users and screen readers that do not forward Space/arrows to a button. Steps already have "Step actions" (Move Step up / down, unchanged). **Ingredient lines gain a Menu** "Actions for <name>" with "Move ingredient up" / "Move ingredient down" (first/last disabled), placed with Remove in the last cell. `IngredientLineRow` takes `handle`, `itemProps`, `count`, `onMove(delta)`.

## 3. Pure maths (`reorder.ts`)
- `moveItem(list, from, to)`: new array, `to` clamped, `from` outside the list = a copy; never mutates. `displayOrder(count, from, to)` = `moveItem` of `0..count-1`.
- `slotAt(slots, y)`: the slot containing `y` (a shared edge belongs to the lower slot); above the first = 0, below the last = last; in a gap the nearer edge wins, a tie goes to the following slot; empty = 0.
- `autoScrollDelta(y, {top,bottom}, edge = 48, max = 20)`, `exceedsThreshold(dx, dy, kind)`, `keyTarget(key, to, count)` (null for non-move keys; returns `to` unchanged at an edge).
- Recipes: `lib/draft.moveLine(draft, from, to)` (keeps line objects, touches nothing else, out-of-range = equal draft) and `useRecipeEditor.moveLine`; Steps use the existing `moveStep`.

## 4. Announcements (strings.ts, GLOSSARY wording)
`SortableStrings`, with `label` = `getLabel(item)` ("garlic", "Step 2"; the Ingredient keeps its stored name as in "Remove ingredient garlic"):
| Key | Text |
|---|---|
| `instructions` | Press Space to pick up, the arrow keys to move, Space to drop and Escape to cancel. |
| `handleLabel(l)` | Reorder {l} |
| `liftedKeyboard(l,p,n)` | Picked up {l}. Position {p} of {n}. Use the arrow keys to move, Space to drop, Escape to cancel. |
| `liftedPointer(l,p,n)` | Picked up {l}. Position {p} of {n}. |
| `moved(l,p,n)` | {l} moved to position {p} of {n}. |
| `atEdge(l,'first'/'last')` | {l} is already first. / {l} is already last. |
| `dropped(l,p,n)` | Dropped {l} at position {p} of {n}. |
| `droppedUnchanged(l,p,n)` | Dropped {l}. Position unchanged, {p} of {n}. |
| `cancelled(l,p,n)` | Reordering cancelled. {l} stays at position {p} of {n}. |
The live region is polite and atomic; each state change replaces its text (an identical consecutive sentence is re-announced by clearing then setting on the next frame). Pointer drags announce the pick up, each change of slot (never twice for the same slot) and the drop. "Step" and "Ingredient" are glossary terms; no "drag and drop", "re-order" or "grab" in UI copy. Recipes strings to add to `recipes/strings.ts`: `lines.actions(who) = Actions for ${who}`, `lines.up = 'Move ingredient up'`, `lines.down = 'Move ingredient down'`, `steps.reorder(n) = Step ${n}` (the label passed to `Sortable`; the verb "Reorder" comes from `handleLabel`). The existing `steps.up/down/actions` stay.

## 5. Look, states, reduced motion
- `.sortable-handle`: 44 x 44 px, `touch-action: none`, `cursor: grab`, muted until hovered/pressed, `:focus-visible` ring `3px solid var(--color-accent)` like `IconButton`. The glyph is 20 px.
- `[data-state='lifted']` (keyboard): accent outline. `[data-state='dragging']`: `position: relative; z-index: 1; transform: translateY(var(--sortable-dy, 0px)); box-shadow: var(--elev-2); cursor: grabbing; transition: none`, plus an opaque background. Siblings ease into the previewed slot with `transition: transform var(--dur-1) var(--ease-out)` (FLIP is not needed because the preview reorders the DOM; the transition covers only the dragged item's release).
- **Reduced motion** (`@media (prefers-reduced-motion: reduce)`): the sibling transition is `none`, there is no scale/lift animation (the dragged item is still translated because it is the pointer's own movement, not decoration), the shadow/outline carry the "lifted" cue, auto-scroll uses plain `scrollBy` (no `behavior: 'smooth'` anywhere). The live region is unaffected.
- Recipe lines: the hairline row has no background from 720, so `.line-row[data-state='dragging'|'lifted']` get `background: var(--color-surface)` and a token radius. Step cards are already surfaces.

## 6. Recipe editor integration
1. **Ingredient line.** The handle goes **inside** `.line-row__ingredient` (a flex row: `.line-row__handle` first, `flex: none`, then the picker), so the grid tracks, the header row and every existing layout test stay valid. `.line-row__remove` becomes a flex row with a gap holding the actions Menu and Remove; its fixed track grows from 40 px to **88 px** (two 40 px buttons + `--space-2`), identically in `.line-row` and `.recipe-editor__lines-head` (the header must keep the same columns). The pending Ready Meal line gets the handle too. The screen wraps `<ul className="recipe-editor__lines">` in `<Sortable as="ul" …>`; `onReorder = editor.moveLine`; `getLabel` = ingredient name or `line N`.
2. **Step card.** `.step-card__head` becomes: `.step-card__lead` (flex, gap: number badge then handle) on the left, actions Menu + Remove on the right; `align-items: center`. `StepsEditor` wraps its `<ol class="steps-editor__list">` in `<Sortable as="ol">`, label `Step N`, `onReorder = (from,to) => onChange(moveStep(steps, from, to))`.
3. Two separate `Sortable`s, so two live regions and two instruction paragraphs; no cross-list dragging.
4. While a Step is lifted the number badges follow `position`, not `index`, so the user sees the numbers they will get.

## 7. Icon choice and budget
`ui/icons.ts` gains `drag: DotsSixVerticalIcon` (Phosphor **DotsSixVertical**: the 2x3 dots, the widely understood grip glyph; it differs from `more` = DotsThreeVertical, which is the Menu trigger beside it, so the two are never confused). Measured with `scripts/test/icons-bundle_test.sh`: **42,657 B -> 42,918 B gz (+261 B; +265 B when measured alone)**, against the 43,008 B budget. Headroom after: **90 B**, i.e. **zero further glyphs fit**. No budget change is made here (the budget exists to be a decision, and this fits), but the next package that needs an icon must raise `BUDGET` by about 1 kB in the same change. Alternatives rejected: `List` (hamburger, reads as a menu), `ArrowsDownUp` (reads as a sort control, ~0.45 kB, would not fit), reusing `moveUp`/`moveDown` (two arrows are the Menu items, not a grip). The icon is already added in this commit, with the `['drag','DotsSixVertical']` registry row and `ui/icons.drag.test.tsx`, because `IconName` must contain it for the tests to typecheck.

## 8. Tests (all red except where noted)
| File | Covers |
|---|---|
| `ui/Sortable/reorder.test.ts` | pure maths |
| `ui/Sortable/strings.test.ts` | the words |
| `ui/Sortable/useSortable.keyboard.test.tsx` | keyboard state machine, announcements, handle props |
| `ui/Sortable/Sortable.pointer.test.tsx` | threshold, preview, drop, cancel, Escape, context menu, auto-scroll (stubbed `requestAnimationFrame`) |
| `ui/Sortable/Sortable.a11y.test.tsx` | handle name/role/describedby, list, live region, focus kept, keyboard through the DOM |
| `ui/Sortable/Sortable.css.test.ts` | touch-action none on the handle only, 44 px, states, reduced motion, tokens |
| `ui/icons.drag.test.tsx` | passes (the icon is added here) |
| `features/recipes/lib/draft.moveLine.test.ts`, `hooks/useRecipeEditor.moveLine.test.tsx` | draft maths and the hook |
| `components/IngredientLineRow.sort.test.tsx`, `StepsEditor.sort.test.tsx` | handle slot, actions menu, Steps reorder with `after` remap, pointer, Menu fallback |
| `screens/RecipeEditorScreen.sort.test.tsx` | the editor wires lines and Steps |
| `recipes.sort.css.test.ts` | the layout contract of section 6 |
Test helper: `ui/Sortable/sortable.test-helper.tsx` (rows 50 px tall at their original index, `pointer()`, a `Demo`).
