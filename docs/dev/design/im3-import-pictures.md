# IM3: existing Ingredients adopt a Recipe File picture

IM2 made a Recipe File carry an Ingredient **Picture** but used it only for Ingredients the import creates (IM2 product question 1). IM3 changes that one rule.
Inputs: [im2-image-fields.md](im2-image-fields.md), [functional-spec.md](../../spec/functional-spec.md) §13, [recipe-file.md](../../spec/recipe-file.md).

Pipeline step 1 (this commit): this note, the spec edits, **red tests**, and type-only stubs. No behaviour is implemented.

## Decision (user)
On Recipe File import, an **existing** Ingredient with **no Picture** adopts the file's Picture. An existing Picture is **never replaced**. Import Review shows it: **"Adds a picture to Garlic"**.
Spec text amended: functional-spec §13 (the sentence "it never changes an Ingredient the Household already has" is gone) and recipe-file.md (`image` row of the Ingredient table). The IM2 note points here.

## Rules
1. A row of the review resolves to a **target**: an existing Ingredient (matched by name, or the one the User chose with "Use X"), or an Ingredient to create.
2. The row **adds a picture** when all hold: the target is existing; the file defines the Ingredient (`row.def != nil`) and its `image` resolved (`ImageSet.Images["$.ingredients[i].image"]`); the existing Ingredient's `Image == ""` in `Existing`.
   The flag follows the *chosen* target, so choosing "Use Yellow onion" flags that one, choosing "Create new" clears it (the new Ingredient takes the picture the IM2 way: `NewIngredient.ImagePath`, not flagged).
3. Only Ingredients used by a kept Recipe have a row, so a skipped Recipe's Ingredients gain nothing.
4. If two rows resolve to the same existing Ingredient and both have pictures, the **first definition in file order** wins; one `AddedImage` per Ingredient.
5. A picture that could not be fetched adds nothing (the `image_failed` warning already says so).

## Go changes (the Developer's work)
- `recipefile.IngredientMatch.AddsImage bool` (`json:"addsImage"`, always present). Stub added; set in `review.plan()` from the row's target (rule 2).
- `recipefile.AddedImage{IngredientID int64, ImagePath string}` and `Commit.AddedImages []AddedImage` (stubs added). `review.commit()` appends one per existing Ingredient that adopts (rules 2 and 4) and puts the image in `Commit.Images[path]`. An existing Ingredient that already has a picture contributes **nothing** to `Commit.Images` (no orphan file is saved).
- `ResolveImages` keeps its signature. It cannot know the User's choices (they come after it runs), so it resolves every definition's picture as today; IM3 adds no filter there. Fetch cost stays bounded by `MaxImagesFetched` (50), and Recipe photos and Step photos are resolved before Ingredient pictures, so Ingredient pictures never starve them.
- `recipefile/store.Apply`: `saveImages` saves the file for each `AddedImage` as for a new Ingredient. In the same transaction, for each `AddedImage`:
  `UPDATE ingredients SET image = ? WHERE id = ? AND image = ''`.
  - `RowsAffected == 1`: adopted; `Result.PicturesAdded++` (stub field added).
  - `RowsAffected == 0`: a Picture was set after the review (or the Ingredient is gone) and **wins**; this is not an error. The just-saved file is an orphan and is deleted after the transaction commits, **through `images.Guarded.Delete`** (`imgs.NewGuarded(images, refs.New(db))`), which refuses a file any record still references and so can never remove the winner's file.
  - On any error the transaction rolls back and `removeImages` deletes every saved file, as today.
  An Ingredient that no longer exists is not `ErrStale`: the picture is just dropped (the Recipes themselves still fail as stale if they need it).
- `refs.Default` already keeps `ingredients.image`; the nightly sweep needs no change.
- `recipefile/httpapi`: no change; it serialises `Plan` and calls `Apply`, so the new field and the commit flow through.

## Frontend (the Developer's work)
- `IngredientMatch.addsImage?: boolean` in `features/import/types.ts` (stub added; optional so old fixtures compile).
- `IngredientMatchTile` shows, when `match.addsImage`, the plain text **"Adds a picture to <name>"** (strings key `addsPicture: (name) => ...`), using `displayName` on the name of the Ingredient that receives it:
  the chosen suggestion when `effective` is `use` of a suggestion id, otherwise `match.match.name`. It is not a control. No change to the hook or the decisions: the server recomputes the flag with every plan.

## Tests (red unless noted)
Go, `internal/recipefile` (`im3_import_pictures_test.go`):
- red: `TestReviewFlagsAnExistingIngredientWithoutAPictureThatTheFilePicturesAndNoOtherRow`, `TestReviewFlagsTheIngredientTheUserChoseNotTheOneWithTheSameName`, `TestCommitAdoptsThePictureForAnExistingIngredientWithoutOne`, `TestOnlyOneFileDefinitionGivesAnExistingIngredientItsPicture`.
- green guards: `TestReviewDoesNotFlagWhenTheExistingIngredientHasAPicture`, `...FilePictureCouldNotBeFetched`, `TestCommitNeverReplacesAnExistingPicture`, `TestAnExistingIngredientNoKeptRecipeUsesGainsNothing`, `TestResolveImagesKeepsThePictureOfADefinitionThatMatchesAnExistingIngredient`, `TestIngredientPicturesDoNotStarveRecipePhotosWithinTheFetchBudget` (ResolveImages already behaves so; they pin it).
- changed: `ingredient_image_test.go` `TestNewIngredientsCarryTheirImagePathAndExistingOnesWithAPictureAreLeftAlone` (its old lemon had no picture, which now adopts).

Go, `internal/recipefile/store` (`im3_import_pictures_test.go`):
- red: `TestApplyGivesAnExistingIngredientWithoutAPictureTheFilesPicture` (end to end from the review), `TestApplyKeepsAPictureSetAfterTheReviewAndRemovesTheOrphanFile` (conditional UPDATE; the winner's file survives, the orphan goes).
- green guards: `TestApplyNeverReplacesAnExistingPicture`, `TestApplyRollsBackAnAdoptedPictureWhenTheImportFails` (a stale Recipe rolls back the adoption and leaves no file).

BDD, `bdd/features/images/ingredient_pictures.feature` + `bdd/steps_im3_test.go` (4 scenarios):
- red: "...gives an existing Ingredient without a picture the file's picture", "A picture set while the review is open wins...".
- green guards: "...never replaces the picture an Ingredient has", "A new Ingredient with a picture is not described as adding a picture".

Web (vitest): `features/import/components/IngredientMatchTile.addsImage.test.tsx` and `screens/ImportScreen.addsImage.test.tsx` (red: text "Adds a picture to Garlic" is not rendered yet; the "says nothing" cases pass today).

## Order of work
1. `review.go`: flag and `AddedImages`; plan/commit tests green.
2. `store.Apply`: conditional UPDATE, orphan removal via `Guarded`; store and BDD tests green.
3. Web: string and `IngredientMatchTile` line.
4. Run `scripts/check.sh`.
