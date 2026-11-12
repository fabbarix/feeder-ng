# Hotfix 1.0.0-beta.4.2: root causes

Two bugs in the released photo read (Android Chrome, dark mode, portrait, about 412 CSS px).

## 1. Crop handles scattered

The crop rectangle and its percentages are right (`rectToPercent`, `useImageEditor`, `useViewWidth` are not at fault, and the editor
alone puts all eight handles on the crop box, which `ImageEditor.handles.test.tsx` pins). The cause is CSS specificity.

The Photo tab lives inside the Read step's `Tile`. `ui/Tile.css` has

    .tile :is(button, a):not(.tile__stretch):not(.list-row__target) { position: relative; z-index: 1 }   /* 0,3,1 */

The editor's box and handles are `<button>`s whose own rules are `.crop-editor__handle { position: absolute }` and
`.crop-editor__box { position: absolute }` (0,1,0). The Tile rule wins, so inside a Tile every handle is `position: relative`:

- the handles take part in normal flow, one 44 px tile after another (the box too, with no height);
- `inset-inline-start` / `inset-block-start` then shift each one relative to its flow position by a percentage of the crop rectangle.

Hence x looks right (every handle starts at the left edge, then moves by 0, 50 or 100% of the width) and y is the flow offset (0, 44, 88,
... px) plus 0, 50 or 100% of the height: top-middle about 44 px down, right-middle about 132 px down plus half the height, the lower
handles below the editor on the controls. `nw` (inset 0) is the only one on its corner. Measured in Chrome at 390 and 412 px the handles
are 19, 63, 107, ... 327 px off, exactly 44 px apart. Only the Photo tab is affected because it is the only editor inside a Tile.

Fix direction (for the developer): make the editor's positioning win over host rules, never by source order: either wrap the Tile rule's
selector in `:where(...)` for the inner part so it drops below 0,1,0, or give the editor's box and handle position rules a selector above
0,3,1. Check that the Tile's "inner controls above the stretched target" intent still holds for ordinary buttons.

Guards: `ui/ImageEditor/ImageEditor.cascade.test.ts` (specificity against Tile.css), `ImageEditor.handles.test.tsx` (geometry), and rule 15 of
`scripts/check-shell-layout.mjs` (real Chrome, 390 and 412 px, dev-only route `/_editor-fixture`, handles within 3 px of the crop box and
none on the controls below).

## 2. Photos stay after a successful read

`finished()` (empties the list and the device store) is called by `usePhotoReadEnd`, an effect of `ReadRecipeStep`, when `outcome`
becomes `'done'` while the step is still mounted. In the real flow it never is: `useRecipeRead.finish()` sets `outcome = 'done'`, goes
idle and calls `onDone` (= `useImportReview.adopt`, which sets `phase = 'reviewing'`) in one batched update, and `ImportScreen` renders
`ReadRecipeStep` only while `phase === 'source'`. The step unmounts in the same commit, so the effect never sees `busy = false` and
`outcome = 'done'` together. The unit tests mock `useRecipeRead` and rerender the step, which is why they pass.

Unmounting the step is a plain unmount, which by design keeps the photos on the device (`usePhotoPages`: only a changed address clears).
So the photos stay in IndexedDB, and Start over, a reload or coming back to the page restores them ("photos from before").

Also found: `clearAll` removes the listed photos only; files still queued for intake (a pick of several files) are not dropped and the next
one opens in the editor after the clear.

Fix direction: the owner of the clearing must outlive the step: call the photo clearing when the read reaches review at the screen level
(e.g. `ImportScreen` owns `usePhotoPages` or hands `onDone` a wrapper that clears the store), and make `finished()` drop the queue and
the editor as well.

Guards: `screens/ImportScreen.photoFinished.test.tsx` (real hooks, fake server, memory store), `hooks/usePhotoPages.finished.test.tsx`.
