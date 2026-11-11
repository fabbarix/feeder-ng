# IM2: Ingredient pictures, Member photos, and one image picker everywhere

IP1 built the shared `ImagePicker` and one server ingest path. IM2 puts every image field on it, adds two new fields (an Ingredient **Picture**, a Member **Photo**)
and adds a guard so no screen builds its own image input again. Inputs: [ip1-imagepicker.md](ip1-imagepicker.md), [ui-review-2.md](../../design/ui-review-2.md) (F-09, K3),
[functional-spec.md](../../spec/functional-spec.md) (§3 Members, §5 Ingredients, §13 Import and export), [recipe-file.md](../../spec/recipe-file.md).

Pipeline step 1 (this commit): this note, the spec/GLOSSARY edits, **red tests**, and type-only stubs so `typecheck` and `go vet` stay green. No behaviour is implemented.

## Decisions (user, recorded)
- One shared `ImagePicker` for every image field. A Member's avatar is a **photo OR an emoji OR initials** (K3). Ingredient picture aspect is **4:3**, Member photo **1:1**.
- Migration number for the Ingredient picture is **1310**; the Member photo is **1311** (both are plain `ALTER TABLE ... ADD COLUMN`, so an old database upgrades with no data change).

## Inventory: every image input found, and what happens to it

| # | Where | Today | After IM2 |
|---|---|---|---|
| 1 | Recipe photo, `recipes/components/PhotoPicker.tsx` (used by `RecipeEditorScreen`) | `FileDrop accept="image/*"` + `usePhotoUpload` + `recipesApi.uploadImage` (JSON `{dataUrl}`, `readDataUrl`) + `lib/photo.ts` error mapping + `RecipeThumb` + Remove | `PhotoPicker({ value, onChange })` = a Tile around `<ImagePicker label={recipeStrings.photo} value onChange aspect={CROP_ASPECTS.landscape} />` (size `hero`). `usePhotoUpload`, `recipesApi.uploadImage`, `readDataUrl`, `lib/photo.ts`, `photoErrors`, `fields.addPhoto/replacePhoto/removePhoto/uploading` strings are deleted. |
| 2 | Step photo, `recipes/components/StepPhoto.tsx` (used by `StepsEditor`) | same, 72 px thumb | `StepPhoto({ imageId, onChange })` = `<ImagePicker label={recipeStrings.steps.image} size={72} aspect={landscape} />`. Own upload state is now the picker's, so one Step never affects another. `steps.addImage/removeImage` strings go. |
| 3 | Member avatar, `settings/components/MemberEditor.tsx` | `EmojiPicker` with an "Initials" none-choice | a `Segmented` "Avatar": Initials · Emoji · Photo. Emoji shows the `EmojiPicker` (label "Emoji"); Photo shows `<ImagePicker label="Member photo" size={72} aspect={CROP_ASPECTS.square} />`. New. |
| 4 | Ingredient (New Ingredient sheet, Ingredient page) | none (F-09 left room) | new field, see below |
| 5 | Request avatar, `access/components/RequestAvatar.tsx` | no input; draws the Google photo with a local load-failure fallback (A8) | not an input. The fallback moves into `ui/Avatar` and `RequestAvatar` becomes a thin `Avatar` wrapper. |
| 6 | Product, Shop (`features/products`, `features/shops`, `internal/product`) | **no image field** (grep for image/photo/picture/accept/capture finds none, nor a column in `0400_products_shops.sql`) | nothing to migrate. A Product picture is a possible later field (product question 3). |
| 7 | Import Review (`features/import`) | **no image input**: `ImageWarningsTile` only lists `image_failed` warnings; `ImportSource`'s `FileDrop accept=".json"` is a JSON file, not an image | **deferred** (WP-E owns `features/import`), see "Deferred: Import Review". |
| 8 | Recipe Assistant "Read from a photo" | already `ImagePicker mode="raw"` (IP1/WP-D) | unchanged. |
| 9 | Barcode scanner, `ui/ViewfinderStrip` | camera for barcodes, not an image field | unchanged; the guard does not touch `getUserMedia`. |

`web/src/ui/native-controls.test.ts` and the `native-ui` rule already keep a bare `<input type=file>` out of features; they do not stop `FileDrop accept="image/*"` (which is how #1 and #2 got around them). The `image-input` rule below closes that gap.

## Data model and API

### Ingredient picture
- Migration `1310_ingredient_image.sql`: `ALTER TABLE ingredients ADD COLUMN image TEXT NOT NULL DEFAULT ''`. (Same convention as `recipes.image`.)
- `ingredient.Ingredient.Image` and `ingredient.Input.Image` (stubs added). `Input.Validate` trims it and accepts `""` or a well-formed id (`imaging.ValidID`: 32 lower-case hex); anything else is a `*ValidationError{Field: "image"}`.
- `store.WithImages(Images)` (`Exists`, `Delete`; the same two methods as `recipe/store.Images`; stub added, no-op). With it: `Create`/`Update` refuse an id that was never uploaded (`ValidationError` field `image`);
  after an update, delete, or merge, a file that no Ingredient uses any more is deleted (`dropUnreferenced`, best effort, only ids that were this Ingredient's, so a file still used elsewhere is safe because ids are unique per upload).
  `Patch.Image *string`: nil unchanged, `&""` remove, `&id` set (stub added). Merge: the target keeps its own picture; if it has none it adopts the source's; the source's picture is deleted otherwise.
- `internal/ingredient/httpapi`: mounts `imaging.NewStore(<data>/images)` like the Recipe module and passes it to the store. JSON: every Ingredient (list, search, detail, merge preview) carries `"image": "<id>"` and `"imageUrl": "/api/images/<id>"`, both `""` when there is none.
  `POST /api/ingredients` takes `image`; `PATCH /api/ingredients/{id}` takes `image` presence-aware (absent = keep, `""` = remove). Errors map as today: field `image` -> 400 `invalid_ingredient`.
  The Ingredient detail screen stays editable for an Ingredient in use (only the Base Unit locks).
- `refs.Default` gains `{"ingredients","image"}` so the nightly sweep keeps the file.

### Member photo
- Migration `1311_member_photo.sql`: `ALTER TABLE members ADD COLUMN photo TEXT NOT NULL DEFAULT ''`.
- `household.Member.Photo`, `MemberInput.Photo` (stubs added). `MemberInput.Validate`: `""` or a well-formed id, else `ValidationError{Field:"photo"}` (422 `validation_failed`). The emoji (`avatar`, <= 4 chars) and the photo may both be stored; the **screen** draws photo > emoji > initials, so an emoji stays as the load-failure fallback.
  The Member sheet saves exactly one of them (it clears the other when the mode changes).
- `internal/household/httpapi`: members JSON gains `"photo"` and `"photoUrl"` (both `""` when none). Create/PATCH take `photo` (a PATCH replaces the Member, so leaving it out removes the photo, as for `email`). An unknown or never-uploaded id is 422 `validation_failed`, field `photo`.
  The module checks existence with an `imaging.Store` and deletes the old file when the photo is replaced or removed and when the Member is deleted. Only an Admin writes Members, so only an Admin sets a photo (any User reads it).
- `refs.Default` gains `{"members","photo"}`.

### Recipe File (schema stays version 1, backward compatible)
- `docs/spec/recipe-file-v1.schema.json`: the `ingredient` definition gets an optional `"image": { "$ref": "#/$defs/image" }` (same data-URL/https rule as a Recipe's). **The schema file is left for the Developer** so that `TestSchemaAcceptsAnOptionalIngredientImage...` is honestly red; `recipe-file.md` and the spec already describe it.
- `recipefile.Ingredient.Image` (stub added). `ResolveImages` also resolves `$.ingredients[i].image` (same limits, same `image_failed` warning at that path; counts towards `MaxImagesFetched`).
- `recipefile.NewIngredient.ImagePath` (stub added) is set for each **new** Ingredient whose picture resolved; `Commit.Images` holds that image; `Input.Image` stays empty and `recipefile/store.Apply` saves the file, sets `ingredients.image` (via `CreateTx` with the id) and removes the file again if the transaction fails (the existing `removeImages`).
  **Superseded by IM3** ([im3-import-pictures.md](im3-import-pictures.md)): an existing Ingredient *with* a picture keeps it (the file's is dropped, no warning); one *without* adopts the file's. A definition no kept Recipe uses is not created, so its picture is not saved.
- Export: `ExportInput.Image` already turns an id into a data URL; `Build` also embeds each used Ingredient's picture (`Ingredient.Image`) and, when `Image()` fails, leaves it out and adds a `WarnImageFailed` at `$.ingredients[i].image` (`i` = index in the sorted `ingredients` array). `recipefile/store.Exportable` needs nothing: `ingredient.Ingredient.Image` rides along.
- `recipefile/httpapi` is not touched (WP-C owns it): export/import there already pass `Exportable`, `ResolveImages` and `Apply`, so the pictures flow through. `TestFeatures` "An Ingredient picture travels in a Recipe File" and "Importing a Recipe File creates the Ingredient with its picture" prove it end to end; if they need a change in `recipefile/httpapi`, WP-C's branch must carry it (flag in the merge).
- Member photos are **not** in a Recipe File (a Recipe File is about Recipes and their Ingredients).

## Frontend

### `ui/Avatar` owns the fallback (A1's `RequestAvatar` logic moves here)
`Avatar({ name, imageUrl, glyph, size, colour })`: when `imageUrl` fails to load (`onError`), it renders what it would without a picture: the `glyph` if any, else the initials, as the same single element (no wrapper), keeping `role="img"`, name, size and ring.
The failed address is remembered (`useState<string>`): the same address does not retry, a different `imageUrl` gets a new try. `RequestAvatar` becomes `<Avatar name imageUrl={picture} size />`; its `.access__photo` wrapper and CSS rule go (its own test still passes unchanged; `access.css.test.ts` may need its wrapper assertion removed).
`ui/index.ts` is R2-L's and is not touched: `Avatar`, `ImagePicker`, `CROP_ASPECTS` are already exported.

### Member avatar
- `settings/lib/memberAvatar.ts` (stub added, pure): `avatarMode({avatar, photo}) -> 'photo' | 'emoji' | 'initials'`, `withAvatarMode(draft, mode)` (exactly one of avatar/photo survives).
- `MemberAvatar({ name, colour, avatar, photo, size })` passes `imageUrl={photo ? '/api/images/'+photo : undefined}` and `glyph={avatar}` to `Avatar`. Callers: `MemberList` and `AttendanceEditor` pass `photo` (the `memberAvatarUse` test fails the build if one does not). Other places that draw a Member by name only (`PlannedMealSheet` attendee avatars take `imageUrl`, `ui/Select` `MemberOption.imageUrl`, `YourMenu` uses the signed-in User) are fed from APIs that do not carry the Member photo yet: product question 2.
- `MemberEditor`: `Segmented` (label `member.avatar`, options Initials/Emoji/Photo, helper `avatarHelper`), mode from `avatarMode(member)` (new Member: Initials). `memberFromDraft` **omits `photo` when empty** (so the existing exact-match `onSave` tests keep passing and a PATCH clears the photo). Photo mode: `<ImagePicker label={member.photoLabel} helper={member.photoHelper} size={72} aspect={CROP_ASPECTS.square} listenOn="dialog" value onChange />`.
  Types: `Member.photo?/photoUrl?`, `MemberInput.photo?` (optional only so existing fixtures compile; the server always sends them).

### Ingredient
- `NewIngredientSheet`: after Shelf Life and before the action bar, `<ImagePicker label={strings.sheet.pictureLabel} value onChange aspect={CROP_ASPECTS.landscape} listenOn="dialog" />`; the body adds `image` only when set. The picker stays enabled while the name check runs; Create is not blocked by a picture that is still uploading (the picker reports busy through its own status; the Developer disables Create while `busy`).
  Cancelling after an upload leaves an unsaved file; the nightly sweep removes it after 24 h (the picker deletes only what the user removes or replaces in it; the Developer checks whether it should also discard on unmount).
- `IngredientScreen`: a new `Tile as="section" aria-label={strings.pictureLabel}` (span full, before Unit Conversions) with `<ImagePicker label={strings.pictureLabel} value={ingredient.image ?? ''} onChange={(id) => attempt(() => ing.setImage(id))} aspect={landscape} />`. Not locked by references. A failure shows through the screen's existing `role="alert"`.
- `useIngredient.setImage(id)` -> `PATCH { image: id }` (stub added). `IngredientList` rows get `leading={<RecipeThumb name="" photoUrl size={40} />}` **only** when `imageUrl` is non-empty (rows without a picture are unchanged).
- All hosts import `ImagePicker` and `CROP_ASPECTS` from the `ui` barrel (host tests replace the barrel's `ImagePicker` with `ui/ImagePicker/fake.test-helper.tsx`).

### Guard: `image-input` in `scripts/check-ui.sh`
New rule, listed in `RULE_NAMES`, documented in the header, set to `image-input=fail` (all paths) in `check-ui.rules` once the migration is done. It scans non-test `.ts/.tsx` under `web/src`, **excluding `web/src/ui/ImagePicker/`**, and flags per line: `accept=` with an image media type or an image extension (`image/`, `.png .jpg .jpeg .webp .heic .heif .gif .avif`), `capture=`, and the string literals `'/api/images'` / `'/api/images/from-url'` (uploads; display URLs like `` `/api/images/${id}` `` are fine).
`accept=".json"` (Import) stays legal. Fixtures: `scripts/test/fixtures/check-ui/image-input/{pass,fail}`; the test requires 6 violations in `fail`, 0 in `pass`, and 0 in the real tree. `scripts/test/check-ui_test.sh` also requires `image-input=fail` in `check-ui.rules` and the rule in `check-ui.sh`. (`RULES` in that test is the legacy list; `image-input` is tested in its own block like `back-link`.)

## Deferred: Import Review image choices (WP-E owns `features/import`; not edited here)
Today Import Review only lists failed images (`ImageWarningsTile`: "These images could not be fetched and are left out."). IM2 changes nothing there. The follow-up, **after WP-E merges**, so the user can fix a dropped picture instead of losing it:
1. `ImageWarningsTile` rows for `$.recipes[i].image`, `$.recipes[i].steps[j].image` and `$.ingredients[i].image` get an `<ImagePicker>` ("Add a photo instead") for the item;
2. the confirm body carries `images: { "<json path>": "<image id>" }` (ids from `/api/images`), `recipefile.Decisions` gains them, and `BuildCommit` uses the id instead of a resolved WebP (so `recipefile/httpapi` and `recipefile/store` change too: **WP-C's** files);
3. the page itself must not hold its own `FileDrop accept="image/*"`: the `image-input` guard enforces that.
Also needed from WP-E at merge time: nothing blocks IM2; the `ImageWarning` path now can read `$.ingredients[i].image`, which the tile already prints as a path (`warning.path`).

## Tests (all red unless noted)

Go: `internal/ingredient/image_test.go`; `internal/ingredient/store/image_test.go` (fake `Images`); `internal/ingredient/httpapi/image_test.go`; `internal/household/photo_test.go`, `.../store/store_test.go` (`TestMemberPhotoRoundTripsAndCanBeCleared`), `.../httpapi/photo_test.go`;
`internal/images/refs/refs_test.go` (`TestDefaultKeepsIngredientPicturesAndMemberPhotos`); `internal/recipefile/ingredient_image_test.go` and `internal/recipefile/store/ingredient_image_test.go` (schema, `ResolveImages` paths and warnings, `BuildCommit` image paths and "existing Ingredients are left alone", export embed and warning, Apply, Exportable, full round trip).
BDD (Gherkin + `bdd/steps_im2_test.go`): `bdd/features/images/ingredient_pictures.feature` (10 scenarios: add with a picture, none, replace/remove deleting old files, rename keeps it, never-uploaded refused, in-use discard refused, nightly sweep keeps it, merge, Recipe File export and import) and `bdd/features/household/member_photos.feature` (7 scenarios: give a photo, fallbacks, replace, switch to emoji/initials, refused, sweep, delete Member).
Web (vitest): `ui/Avatar.image.test.tsx`; `settings/components/MemberAvatar.photo.test.tsx`, `MemberEditor.photo.test.tsx`, `MemberList.photo.test.tsx`, `settings/lib/memberAvatar.test.ts`, `settings/memberAvatarUse.test.ts`; `ingredients/components/NewIngredientSheet.picture.test.tsx`, `IngredientList.picture.test.tsx`, `screens/IngredientScreen.picture.test.tsx`, `api.test.ts` (contract, already green);
`recipes/components/PhotoPicker.test.tsx` and `StepsEditor.test.tsx` (Step photo block) and `screens/RecipeEditorScreen.photos.test.tsx` (**rewritten** for the picker). Shell: `scripts/test/check-ui_test.sh` (+6 cases) and the `image-input` fixtures.
Host tests use `ui/ImagePicker/fake.test-helper.tsx` (`FakeImagePicker`: group named by `label`, `data-value/aspect/size/mode`, buttons "pick <label>" -> `onChange(PICKED_ID)` and "remove <label>" -> `onChange('')`); the real picker keeps its own IP1 suites.

**Existing tests I changed** (their old behaviour is the thing being replaced): `NewIngredientSheet.test.tsx` ("leaves room for the later picture field" now expects the Picture group), `MemberEditor.fields.test.tsx` (the "MemberEditor: Avatar" block: Initials/Emoji/Photo Segmented instead of the single emoji radiogroup), `PhotoPicker.test.tsx`, `StepsEditor.test.tsx` (Step photo block), `RecipeEditorScreen.photos.test.tsx`.
**Tests the Developer must also touch**: `RecipeEditorScreen.test.tsx`, `.quickCreate.test.tsx`, `RecipeScreens.breadcrumbs.test.tsx` mock `../hooks/usePhotoUpload` (delete those lines with the hook; `RecipeEditorScreen.test.tsx` has `h.upload` and an "a photo zone for the Recipe and one for each Step" case to retarget to the picker groups); `recipes/native-controls.test.ts` and `ui/native-controls.test.ts` should still pass; `access.css.test.ts` if it asserts `.access__photo`.

### Red list and what stays green
Red now: every test above except the contract test in `ingredients/api.test.ts`, `TestSchemaRefusesABadIngredientImage` (green only because the schema refuses every `image` today), `TestAnIngredientNoRecipeUsesIsNotCreated...`, `TestMemberPhotoAndEmojiMayBeStored`, `TestOnlyAnAdminSetsAMemberPhoto`, `TestAnIngredientWithoutAPictureHasNone`. These pass today and must keep passing; they pin behaviour that must not regress while implementing.
Pre-existing tests are all green (`go test ./...` red set is only the new tests; vitest red set is only the new/changed files).

## Order of work for the Developer
1. Migrations 1310/1311, `refs.Default`, `ingredient.Validate`, store (`WithImages`, `Patch.Image`, scan/insert/update/merge/delete), httpapi (Ingredient + Member), then `recipefile` (schema, `ResolveImages`, `NewIngredient.ImagePath`, `Build`, store `Apply`).
2. `ui/Avatar` fallback and `RequestAvatar` slim-down, `MemberAvatar`, `memberAvatar.ts`, `MemberEditor`, `MemberList`/`AttendanceEditor`.
3. Ingredient sheet, page, list thumbs, `useIngredient.setImage`.
4. Recipes: `PhotoPicker`, `StepPhoto`; delete the old upload code; update the three screen tests that mock `usePhotoUpload`.
5. `image-input` rule in `check-ui.sh` + `check-ui.rules` (`fail`), run `scripts/check.sh`.

## Product questions
1. **Import and existing Ingredients.** A Recipe File's picture is used only for Ingredients the import creates. Should an existing Ingredient **without** a picture adopt the file's (like missing Unit Conversions are added)? Easy to add (`AddedImage` in the `Commit`); left out because it is the only import path that would change something the household already has.
2. **Member photo elsewhere.** The planner shows attendee avatars from `PlannedMealSheet` (`imageUrl`), the Meal Slot attendance pills (R15) and `MemberSelect` options. Their APIs do not send a photo yet. OK to add `photoUrl`/`emoji` to the plan attendee JSON and the Meal Slot attendance rows in a follow-up, or should IM2 do it now (touches `internal/plan`, R15's files)?
3. **Product / Shop pictures** (Product packs are the most recognisable thing in a shop). Out of scope here (no field exists); say if you want a Product picture next, it is the same pattern (`products.image`, `refs.Default`, picker 4:3).
4. **Photo and emoji together.** Stored together but the sheet saves one; old clients that PATCH only `avatar` clear the photo (a PATCH replaces the Member). Fine?
5. **Ingredient picture in Shopping List / Stock / Scan rows.** Only the Ingredients list shows it in this change; other lists keep their current rows. Which should follow?
