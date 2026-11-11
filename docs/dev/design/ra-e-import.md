# Recipe Assistant WP-E and WP-G: "Read a recipe" in Import, "Read from a photo", the photo choice

Status: tests written first (red), stubs compile. Pipeline step 1 for WP-E and WP-G of [ai-recipe-import.md](ai-recipe-import.md) (plan v3, sections 1.4, 1.5, 3.5, 5.2, 7, 9), built on the server contract of [ra-c-service.md](ra-c-service.md) (branch `team/ra-c-service`) and the shared ImagePicker (IP1, merged on main). Branch `team/ra-e-import` (from main b35765d). One team, one branch: WP-G only adds the Photo tab and the photo choice on top of WP-E, and both touch the same files.

## 1. Scope and ownership

Owns `web/src/features/import/**` only. No `ui/` edit (ImagePicker is used as it is), no `strings.ts` of another feature, no settings code. The Recipe Assistant settings page (WP-D, `features/recipe-assistant`) is untouched; the Admin links point at its routes (`/settings/recipe-assistant`, `#model`).

New files (stubs exist, tests are red against them): `lib/{readRequest,readProgress,readErrors,readAvailability,photoChoice,photoSlots}.ts`, `hooks/{useRecipeRead,useReadAvailability}.ts`, `components/{ReadRecipeStep,ReadProgress,ReadErrorTile,ReadPhotoPanel,ReviewPhotoChoice,ReadNote}.tsx`, `fakeImagePicker.test-helper.tsx` (test only). Changed: `types.ts` (wire types, final), `api.ts` (4 new calls, `confirm(id, decisions, photo?)`), `hooks/useImportReview.ts` (`adopt`, photos, photo choice), `screens/ImportScreen.tsx`, `components/RecipeFileActions.tsx`, `components/AgentPromptStep.tsx` and `components/ImportSource.tsx` (step numbers), `strings.ts`, `import.css`.

Not needed: a route (`/recipes/import#read` is the same route; the route table already gives Recipes > Import Recipes, tested by the existing breadcrumbs test, which keeps passing), a nav item, a new icon.

## 2. Decisions made while writing the tests

1. **The photo input is one ImagePicker per photo.** The shipped ImagePicker holds one picture (`RawImagePickerProps.value: RawImage | null`, no `multiple`). The plan says "multiple"; the picker was built without it. We do not edit `ui/` (WP-G rule), so the Photo tab shows `Photo 1`, `Photo 2`… pickers, one filled picture opens the next empty one, at most 4 (`lib/photoSlots.ts`, order kept, removing closes the gap). Each is `mode="raw" output="dataUrl" maxSide={2576} aspect="free"` with the default sources (camera, upload, paste, link). If IP1 later adds `multiple`, only `ReadPhotoPanel` changes. Flagged to the PM as a primitive request (wp3b-primitive-requests.md) only if the one-picker-per-photo look is not acceptable on a phone.
2. **Steps renumber 1-4** (plan 5.2): Read a recipe is Step 1, the Agent Prompt 2, the Recipe File 3, Review 4. Existing tests for the numbers were updated (they are red): `ImportScreen.test.tsx`, `ImportSource.test.tsx`. Existing tests that mock `useImportReview` got `reviewExtras()` (fixtures) so they keep compiling; they and the breadcrumbs test also mock the two new hooks.
3. **`useRecipeRead` is separate from `useImportReview`.** The read hook owns start/poll/cancel; on `done` it calls `onDone(AdoptedRead)`, which the screen wires to `useImportReview.adopt`. `adopt` opens the review the server already opened (no request), keeps the candidate photos list, the photo choice and a `readNote`. One hook per concern, no hook calls the other.
4. **Single call to start; the first poll after 500 ms.** `POST` answers `{id, state}` (the job is already in its first state). Poll pace 500, 500, 1000, 1000, 1500, then 2000 ms. A failed poll backs off 1 s, 2 s, 4 s, 8 s (cap 8 s); 5 failures in a row, or 200 s since the start (server cap 180 s + margin), end the read locally (`network` or `assistant_unreachable`) and send one best-effort `DELETE` so the User's running slot is freed (otherwise the next start is `409 read_in_progress`). `404` on a poll is `expired` at once (server restarted or the job was dropped).
5. **Copy comes from `lib/` by code, never from the server's `message`.** Unknown codes get one generic retryable line. This keeps provider text (request ids, model names, internal detail) out of the UI. `assistant_request_rejected` has two causes in plan 1.4 (400 refused, 404 wrong address) but one code; the tile says "The request was refused." and the Admin hint "Check the base URL in Settings." covers both (confirm with WP-C that no separate code is wanted).
6. **Retry rules** (`ReadErrorCopy.retryable`): busy, unreachable, rate limited, invalid output, network, timeout, expired, unknown can be tried again with the same input ("Try again"). Refusal, bad key, forbidden, billing, model unavailable, request rejected, too long, no recipe, all input errors and the Household limit cannot: Admins get a link (Settings, or Settings at `#model`), Users get "Ask an Admin." (declined: "Ask an Admin to try another model."). The refusal has **no Try again**: no automatic retry or fallback (plan 1.4).
7. **The text counter and limit use code points** after trimming, as the server counts runes (`[...trimmed].length`), so 50,000 emoji pass and 50,001 do not.
8. **A bare address gets `https://`.** `example.com/soup` is sent as `https://example.com/soup`; anything else that is not http(s) with a host is `url_invalid` locally. (Plan 7 says the server answers `url_invalid` too; the check only saves a round trip.)
9. **Limit and availability come from `GET /status` only.** `limit` is absent for Admins, so an Admin is never limited even if a limit were sent. `remaining 0` disables Read and says when to try again (rounded up to minutes); 5 or fewer left shows "N reads left this hour." The status is refetched when a read starts and ends (the count changed).
10. **Photos not supported by the model**: the Photo option is disabled with "This model can't read photos." (Admins: "... Pick another model in Settings."); pages and text still work. If the model changed between the status fetch and the start, `422 photos_not_supported_by_model` is shown with the same words.
11. **Photo choice is normalised in `lib`** (`normaliseChoice`): the photo and Recipe stay valid when the User skips a Recipe in a conflict tile; with no Recipe left the switch is off and disabled ("Every Recipe is skipped, so there is nothing to give the photo to."). Confirm sends `photo` only when `confirmPhoto` returns a valid value; indexes are 0-based on the wire (ra-c-service.md section 3).
12. **Focus.** `#read` moves focus to the Read heading; a finished read moves focus to the Review heading (a file does not), because the review appears below the fold on a phone and a screen reader would not know.
13. **Live region.** `ReadProgress` renders one `role=status aria-live=polite` element that holds only the stage text; the stage list, "Still working… N s" (ticks every second) and Cancel sit outside it so nothing chatters. Errors are one `role=alert` tile; there is no `aria-live=assertive` anywhere else.

## 3. API assumptions to confirm with WP-C (ra-c-service)

| # | Assumption | Where it matters |
|---|---|---|
| A1 | `GET /api/recipe-assistant/status` exists for any signed-in User with exactly the plan 7 shape (`available`, `reason`, `model {id,name}`, `photos`, `limit {remaining, resetsInSeconds}`; `limit` absent for Admins). ra-c-service.md lists `status` under the `recipeassistant` module (done on the settings side), so this is only a shape check. | `useReadAvailability` |
| A2 | `error` objects flatten into `ApiError.details` as `retryAfterSeconds`, `errors` (`[{path,message}]`), `model` (the model's **display name**, "Claude Haiku 5.5", not the id) for start refusals; the same keys sit inside `ReadView.error` for failed reads. ra-c-service.md's `readErrorJSON` has `model` as a string: if it is the id, the refusal copy would say `claude-haiku-5-5`. Please confirm name, or add `modelName`. | `errorFromApi`, refusal copy |
| A3 | `429 too_many_reads` carries `retryAfterSeconds`; `409 read_in_progress` has no body fields we need. | start errors |
| A4 | `page_unavailable` (generic, no cause) is the code for a page that cannot be fetched (ra-c-service.md: "generic `page_unavailable`"). The plan's 4xx list for reads does not name it; the tile's copy is "That page could not be opened." | page reads |
| A5 | A finished read's `review.photos` lists `{index,width,height}`, 0-based, matching `GET /api/imports/{id}/photos/{index}`; `source.structuredData` is a boolean. | `adopt`, thumbnails, read note |
| A6 | `ReadView` stays readable for 10 min after finishing; a poll after that is `404` (we treat 404 as `expired`). A User who reloads the page mid-read cannot resume: we do not list reads (no `GET /reads`). If WP-C wants resume, it needs a list route; out of scope. | `useRecipeRead` |
| A7 | `confirm` with `photo: {index, recipe}` for an index/recipe pair that is not valid answers `422 validation_failed`, `field: "photo"`, leaving the Review and its photos so the retry works (ra-c-service.md section 3). The client maps this to a form-level error; it normally cannot happen because `confirmPhoto` validates. | `useImportReview.confirm` |
| A8 | The client sends `{photos: [...]}` as a single-key object so `photos` is the first key (the server raises its body cap to 45 MiB only then). A page of 4 photos at 8 MB is 43 MB of base64; nginx/Caddy `client_max_body_size` is WP-F's. | `readRequest` |
| A9 | Photo `url` photos (picker link mode) are sent as `{url}`; only https is accepted client-side (the picker already refuses http). | `readRequest` |
| A10 | `DELETE /reads/{id}` on a finished or unknown read: 404 is harmless (the client ignores any DELETE failure and goes idle). | cancel, give-up |

## 4. Pure logic (`lib/`, no React; the Developer writes these first)

### 4.1 `readRequest.ts`
`READ_LIMITS = {textChars: 50_000, photos: 4, photoBytes: 8 MiB}`. `buildReadRequest(input): {ok:true, body} | {ok:false, problem, index?}` with problems `url_invalid | text_empty | text_too_long | photos_empty | too_many_photos | photo_too_large | photo_unsupported` (the server's codes; `index` is the 0-based photo). Bodies: `{url}`, `{text}` (trimmed, inner breaks kept), `{photos:[{dataUrl}|{url}]}` in order. A blob picture without `dataUrl` or with a data URL that is not jpeg/png/gif/webp, or an http link, is `photo_unsupported`; `blob.size > 8 MiB` is `photo_too_large`. `textCounter(text) -> {label: "1,234 / 50,000", over}`.

### 4.2 `readProgress.ts`
`isTerminal`, `stageCopy` ("Opening the page…", "Preparing the photos…", "Reading the recipe…", "Checking the result…", "Fetching photos…"; empty for final states), `stagesFor(kind)` (url: fetching, reading, checking, images; text: reading, checking, images; photo: preparing, reading, checking), `elapsedNote(s)` ("Still working… 25 s" from 20 s, "1 min 15 s" over a minute), `pollDelay(attempt)`, `errorBackoff(failures)`, `shouldGiveUp({failures, elapsedMs})`, constants `POLL_DEADLINE_MS = 200_000`, `MAX_POLL_FAILURES = 5`.

### 4.3 `readErrors.ts`
`readErrorCopy(error, {isAdmin}) -> {message, hint?, action: retry|settings|chooseModel|none, retryable, details}` for every code of plan 1.4 plus the start refusals (`url_invalid`, `text_empty`, `text_too_long`, `photos_empty`, `too_many_photos`, `photo_too_large`, `photo_unsupported`, `photo_unavailable`, `photos_not_supported_by_model`, `request_too_large`, `assistant_off`, `read_in_progress`, `too_many_reads`), `page_unavailable`, and the client-side `network`, `timeout`, `expired`, `unknown`. `waitText(seconds)`: under a minute "N s", else minutes rounded up. `errorFromApi(err)`: `ApiError` to `{code, retryAfterSeconds?, errors?, model?}`; status 0 keeps `network`/`timeout`; 404 on a poll is `expired`; anything else `unknown`. The exact copy is pinned in `readErrors.test.ts`.

### 4.4 `readAvailability.ts`
`availabilityOf(status, {isAdmin, failed}) -> ReadAvailability` (`loading`, `enabled`, `isAdmin`, `statusFailed`, `message`, `settingsLink`, `photos`, `photosMessage`, `limitMessage`, `limitHint`, `modelName`). Reasons `off`, `no_secret_key`, `no_key`, `key_unreadable`, `model_unavailable`: Admins get the fix and `settingsLink`; Users get "Ask an Admin". Copy pinned in the test.

### 4.5 `photoChoice.ts`
`PhotoChoice {enabled, photo, recipe}`, `initialPhotoChoice()` (off, 0, 0), `photoRecipes(plan, decisions)` (all Recipes except those whose effective action is skip; a decision beats the plan's action), `normaliseChoice`, `confirmPhoto(choice, photoCount, recipes) -> ConfirmPhoto | undefined`, `photoUrl(importId, index)` (`/api/imports/{id}/photos/{n}`, id encoded).

### 4.6 `photoSlots.ts`
`emptySlots()`, `setSlot(slots, i, image|null)`, `filledPhotos(slots)` (see decision 1).

## 5. Hooks

### 5.1 `useRecipeRead({onDone}) -> UseRecipeRead`
`phase: idle | starting | running | failed`, `busy`, `kind`, `state`, `error`, `elapsedSeconds`, `start(input)`, `cancel()`, `reset()`. `start`: ignored while busy; `buildReadRequest` first (a problem is `failed` with that code, nothing sent); `importApi.startRead`; refusals (`ApiError`) are `failed` with `errorFromApi`; success is `running` in the answered state; polling with `getRead(id, {signal})` on the policy of 4.2, a single in-flight timer, aborted on cancel, unmount and finish. `done` with a review calls `onDone({id: review.id, plan, photos, source, model})` once and goes idle; `done` without a review is `failed unknown`; `failed` shows the read's `error`; `cancelled` goes idle without an error. `cancel`: aborts the poll in flight, ignores its late answer, sends `DELETE` (failure ignored), goes idle. Unmount stops everything and never calls `onDone`. Elapsed seconds tick once a second while running.

### 5.2 `useImportReview` additions
`reviewId`, `adopt(read)`, `photos`, `photoRecipes`, `photoChoice`, `setPhotoEnabled`, `choosePhoto`, `choosePhotoRecipe`, `readNote {modelName?, structuredData}`. `adopt` sets the phase to reviewing with empty decisions and a fresh choice (off); `open` and `reset` clear photos, choice and note; recipe actions re-normalise the choice; `confirm` passes `confirmPhoto(...)` as the third argument of `importApi.confirm` (absent key when undefined), and an `import_not_ready` answer keeps the choice.

### 5.3 `useReadAvailability()`
React-query on `importApi.assistantStatus` (key `['recipe-assistant','status']`, stale after 30 s, refetched on window focus and invalidated when a read starts or ends) plus `useMe().data?.isAdmin`, through `availabilityOf`; `retry()` refetches. A failed fetch is `failed: true`.

## 6. Components and screens

All are Bento primitives from `ui/` (Tile, Segmented, TextField, TextArea, Button, Chip, Switch, Select, ProgressTile is not used: the bar is indeterminate), `ui/ImagePicker`; no native controls, no copied markup.

1. **`ReadRecipeStep`** (`Tile as="section"`, overline "Step 1", `h2` "Read a recipe", tabIndex -1 for the `#read` focus): `Segmented` "Read from": Web page, Text, Photo (Photo disabled and described by `photosMessage` when the model cannot read photos). Panels: "Page address" (`TextField type="url"`, Enter reads), "Recipe text" (`TextArea`, counter `n / 50,000` in the helper/description, over-limit error "That text is over 50,000 characters. Paste a shorter part." which also sets the field invalid), or `ReadPhotoPanel`. Inputs per tab are kept when switching. `Button icon="assistant"` "Read recipe": disabled for blank input, over-limit text, no photo, while busy (then replaced by progress), when not `enabled`, or loading. The reason (`availability.message`) is shown as muted text and is the accessible description of the fields and the button; Admins get a link "Open Recipe Assistant settings" when `settingsLink`; a failed status shows "Check again". `limitHint` is a muted line. Typing clears a failure (`read.reset`). Try again re-sends the last input.
2. **`ReadProgress`**: indeterminate `role=progressbar`, the polite status region, the stage list ("Steps", `aria-current="step"` on the current one), "Still working… N s" from 20 s, tertiary "Cancel".
3. **`ReadErrorTile`**: `Tile variant="status" status="danger" role="alert"`, message, hint, details list, and per `action`: "Try again" (`retry`), link "Open Recipe Assistant settings" (`/settings/recipe-assistant`, Admin), link "Choose another model" (`/settings/recipe-assistant#model`, Admin). Users never see a Settings link.
4. **`ReadPhotoPanel`**: the pickers (decision 1), helper "A cookbook page or a handwritten card. Up to 4 photos, in page order.", the approved privacy note "Photos are sent to Anthropic to read the recipe. They are only kept if you choose to use one for the Recipe.", an optional error as an alert.
5. **`ReviewPhotoChoice`** (Import Review, between the Recipe tiles and the Confirm bar; renders nothing without candidate photos): `Tile` "Photo for the Recipe", `Switch` "Use this photo for the Recipe" (off by default; disabled with the reason when no Recipe can take it). Off: the line "Photos are only kept if you choose to use one for the Recipe." On: one photo shows its thumbnail (`img alt="Photo 1"`, `src` = the review photo endpoint, never a data URL); several show a `radiogroup` "Photo to keep" of thumbnail radios (roving tabindex, arrow keys, like Segmented/RadioCards, no native radio); several Recipes add a `Select` "Recipe" (value = the Recipe's index); helper "Only the chosen photo is kept. The others are discarded."
6. **`ReadNote`**: `Chip`s "Read by Claude Haiku 5.5" (or "Read by the Recipe Assistant") and "The page's recipe data was used as a hint".
7. **`ImportScreen`**: Step 1 `ReadRecipeStep` wired to `useRecipeRead({onDone: review.adopt})` and `useReadAvailability()`; Steps 2-4 as before, renumbered; in the review: `ReadNote` (when `readNote`), `ReviewPhotoChoice` before `ConfirmTile`. The hash and finish focus (decision 12). **`RecipeFileActions`**: a first row `ListRow title="Read a recipe" icon="assistant" href="/recipes/import#read" chevron`.

## 7. Icons

No new glyph. `assistant` (Robot) is already in `ui/icons.ts` from WP-D; `key`, `refresh` and `link` exist too. The Photo tab's camera, upload and link icons belong to ImagePicker. The icon budget (about 760 B of headroom) is untouched.

## 8. Strings and the glossary guard

Copy goes in `features/import/strings.ts` (the Developer moves the literals pinned in the tests; tests use literals on purpose, so a rename shows up as a red test). `check-ui` rule `glossary` looks at `strings.ts` for GLOSSARY `_Avoid_` words. Known hits to allowlist in `scripts/check-ui.allow-glossary` with a reason if the guard flags them (approved or plan copy): "account" ("The Anthropic account has a billing problem": Anthropic's own account, not a User), "discarded" ("The others are discarded": photos, not Stock), "never"/"wait" if used. Otherwise avoid the words ("Let it finish" instead of "wait"). The guard entries are the only change outside `features/import/` and are listed in the PR.

## 9. Tests (all new unless noted; "red" = fails against the stubs)

| File | Tests | Pins |
|---|---|---|
| `lib/readRequest.test.ts` | 29 | limits, url/text/photo bodies, trimming, rune counting, bare address, 4 photos / 8 MB, data URL kinds, single-key body, counter |
| `lib/readProgress.test.ts` | 25 | final states, stage copy, stages per kind, elapsed note, poll delays, back-off, give-up |
| `lib/readErrors.test.ts` | 47 | every code for Admin and User, refusal with model, retry rules, 5 detail paths, `waitText`, no server text, `errorFromApi` |
| `lib/readAvailability.test.ts` | 19 | loading, failed, five reasons x Admin/User, photos, Household limit |
| `lib/photoChoice.test.ts`, `lib/photoSlots.test.ts` | 14 + 8 | defaults, skipped Recipes, normalising, confirm photo, URL, slot ordering and cap |
| `api.reads.test.ts` | 6 | status, start, get with signal, cancel, confirm with and without `photo` |
| `hooks/useRecipeRead.test.tsx` | 27 | start, refusals, poll pace, states, done hand-off once, failed, cancelled, 404, back-off, give up with DELETE, deadline, unmount, cancel (abort, late answer, DELETE failure), reset |
| `hooks/useReadAvailability.test.tsx` | 5 | loading, Admin, User, failed status + retry, limit |
| `hooks/useImportReview.photos.test.tsx` | 13 | adopt, no requests, read note, photo choice defaults and confirm argument, several photos / Recipes, skip, retry after `import_not_ready`, reset |
| `components/ReadRecipeStep.test.tsx` | 33 | three inputs, counter, photo slots, running, errors, retry, disabled states |
| `components/ReadRecipeStep.a11y.test.tsx` | 11 | radiogroup keys, one polite status region, one alert, names, descriptions, Tab order |
| `components/ReadProgress`, `ReadErrorTile`, `ReadPhotoPanel`, `ReviewPhotoChoice`, `ReadNote` | 14 + 12 + 11 + 14 + 3 | live region, stages, Cancel; error variants; ImagePicker props; photo choice; note |
| `screens/ImportScreen.read.test.tsx` | 20 | step order, hand-off wiring, hash focus, review tiles, focus after a read |
| Changed existing: `ImportScreen.test.tsx` (2), `ImportSource.test.tsx` (1), `RecipeFileActions.test.tsx` (1) | | step numbers 1-4, four rows |

Browser acceptance for the Developer/Reviewer (not unit tests): with `cmd/fakeanthropic` (WP-C) at 390, 820 and 1280 px, light and dark: paste text -> review -> Confirm saves; a page read; a phone-width photo read of two photos -> review -> keep photo 2 -> Confirm -> the Recipe shows it; again without keeping -> no image; Cancel mid-read; each error tile; the Recipe Assistant off as Admin and as User.

## 10. Developer notes

- Order: `lib/` first (they are plain), then `useRecipeRead` and `useReadAvailability`, `useImportReview` additions, the small components, `ReadRecipeStep`, `ImportScreen`. Replace every `TODO(ra-e developer)`; `notImplemented` in `api.ts` goes away.
- No business logic in components: input validation, copy, retry rules, choice normalising and slot handling are in `lib/` already; fetching and timers are in the hooks. The status/limit rules are not recomputed in the step.
- Timers: one `setTimeout` chain per read, cleared on cancel, finish and unmount; ignore answers of a poll that was aborted or belongs to an older read (use a read token).
- Do not log or keep data URLs in React Query caches or `console`; the photos live in component state and in the request only. Revoke nothing the picker owns.
- Do not call `useMe()` inside components; the step gets `isAdmin` through `availability`.
