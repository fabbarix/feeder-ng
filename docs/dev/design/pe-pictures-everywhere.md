# PE: Pictures everywhere

IM2 gave Ingredients a **Picture** and Members a **Photo**, PP gave Products a **Picture**. PE shows them **everywhere** in beta.1, through two shared primitives and no per-screen markup. Inputs: [im2-image-fields.md](im2-image-fields.md), [pp-product-pictures.md](pp-product-pictures.md), [ip1-imagepicker.md](ip1-imagepicker.md), GLOSSARY (**Photo** for a Member, **Picture** for an Ingredient or Product).

Pipeline step 1 (this commit): this note, **red tests**, and type-only stubs so `go vet` and `typecheck` stay green. No behaviour is implemented.

## The two primitives
- **`ui/Avatar`** (exists): a **Member**. Photo, else emoji (`glyph`), else initials; `colour` is the ring; a Photo that fails falls back, a new address retries. `MemberPill` gains `photoUrl` and passes it on. Every Member avatar in the app is an `Avatar` (directly or through `MemberPill`/`MemberAvatar`/`memberOptions`).
- **`ui/Thumb`** (new, stub added): an **Ingredient or Product**. `{ imageUrl?: string; size?: 40 | 48 | 72 | 'hero' (default 40); label?: string }`, `Thumb.css`, exported from `ui/index.ts` with `ThumbProps`/`ThumbSize`.
  - With `imageUrl`: `<span class="thumb" data-size={size}><img src alt={label ?? ''} onError></span>`, `object-fit: cover`, rounded as `RecipeThumb` (72/hero use the large radius). Decorative unless `label`.
  - Without it or after a load error (the failed address is remembered, a different one retries): `<span class="thumb" data-size={size} aria-hidden="true">`, an **empty slot** of the same box, soft fill, no icon, no initial.
  - The DOM contract tests read: root class `thumb`, `data-size`, `img` with `alt=""`, `aria-hidden="true"` on the slot.
- **Migrate and delete**: `features/products/components/PictureThumb.{tsx,css}` (and its TODO) and the `ingredient-row__no-picture` span/CSS in `IngredientList` move onto `Thumb`. `RecipeThumb name=""` is no longer used for an Ingredient.
- **Guard**: `web/src/features/pictures.guard.test.ts` (vitest, not `check-ui.sh`: that would fail the first step of `check.sh` and hide every other result). In `access ingredients plan products scan settings shop shops stock today`: no `<img`, no `PictureThumb`/`ingredient-row__no-picture` anywhere, no `<RecipeThumb name="">`. Cook step photos and the import review's pages are not entity pictures and stay out of scope.

## `ImagePicker onBusyChange`
`onBusyChange?: (busy: boolean) => void` on the picker (type stub added). It is called with `true` when the picker starts working and `false` when it stops, **in the same moments as `aria-busy`** (`useImagePicker`'s `busy`: preparing, uploading, converting, downloading, crop loading), only on change (no repeated `true`), and **with `false` on unmount while busy** so a host never stays locked. Not called with `true` while idle. Implement as an effect in `useImagePicker`/`ImagePicker` on `busy` with a cleanup.

Hosts disable their Save while busy (`FakeImagePicker` in `ui/ImagePicker/fake.test-helper.tsx` now has "start upload X"/"finish upload X" buttons that call it):
- `NewIngredientSheet`: `pictureBusy` state, OR-ed into the Create button's `disabled` (the existing `busy` there is the save/lookup flag, not a workaround for uploads; keep both).
- `ProductForm` (`useProductForm`): disable Save Product.
- `MemberEditor`: disable Save Member (in `MemberForm`, next to `loading={saving}`).
- Recipe editor: **deferred, SORT owns `features/recipes`**. `PhotoPicker` and `StepPhoto` take `onBusyChange`; `RecipeEditorScreen` keeps a **count/set** of busy pickers (Recipe photo + one per Step key) and disables both Save buttons while any is busy (test: both must finish).

## Where each picture appears
| Surface | Picture | How |
|---|---|---|
| Shopping List lines and Ingredient extras | Ingredient | `ShoppingBody` passes `lead={<Thumb imageUrl size={40} />}` to `LineTile` (it already has the `lead` slot, `.line-tile__lead`) for lines and Ingredient extras, always (empty slot when none); free-text extras get no lead. `ListEntry` gains `imageUrl?`, set by `lineEntry`/`extraEntry`. |
| Stock rows | Ingredient | `StockRow` renders `leading={lead ?? <Thumb imageUrl={item.imageUrl} />}`. |
| Scan feedback | Product, else Ingredient | `useScanFlow`: `imageUrl = scan.productImageUrl \|\| scan.ingredientImageUrl`; queued: offline Product `imageUrl \|\| ingredientImageUrl`. `ScanFeedback` draws `Thumb` (only when a url, as PP). |
| "What is this?" Ingredient picker, Shopping List Extra sheet | Ingredient | `ingredientPickerOptions` (rename `.ts` to `.tsx`) puts `<Thumb size={40}>` in `leading`; `IngredientChoice.imageUrl`. |
| `IngredientSelect` (Recipe editor, Add Stock Lot) | Ingredient | `ingredientOptions` (ui/Select/options.tsx) puts `<Thumb size={40}>` in `leading`; `useIngredientChoices` passes `imageUrl`. Recipes: see deferred. |
| `MemberSelect` | Member | `memberOptions` -> `<Avatar size="sm" imageUrl={photoUrl ?? imageUrl} glyph={avatar} colour={colour} />`. `MemberChoice` gains `photoUrl`, `avatar`, `colour` (`imageUrl` kept so old callers compile). |
| Meal Slot attendee pills (`AttendeePills`, week and grid) | Member | pass `photoUrl={m.photoUrl}` to `MemberPill`. |
| Settings Members list, Attendance editor | Member | already `MemberAvatar` (photo then emoji then initials); unchanged. |
| Access Approve sheet | Member | the options pass `m.avatar` (an **emoji**) as an image address: replace with `<Avatar name imageUrl={m.photoUrl} glyph={m.avatar} size="sm">`; `AccessMember` gains `photoUrl?`. |
| Planned Meal sheet attendees | Member | deferred, see below. |
| `YourMenu`, `RequestAvatar` | the signed-in User's / requester's picture (Google), not a Member | unchanged, already `Avatar`. |

## Backend (wire keys)
| Endpoint | Field |
|---|---|
| `GET /api/plan` etc. (`attendeeOut`, `internal/plan/httpapi`) | `photoUrl` (`"/api/images/<id>"`) and `avatar` (emoji), both `omitempty`. `names.load` fills them from the Members it already reads (`photoURL()` exists). The web `AttendanceMember.imageUrl` is replaced by `photoUrl`/`avatar`. |
| `GET /api/shopping/list` lines and extras | `imageUrl`, **always sent**, `""` without a Picture. `shopping.IngredientInfo` gains `ImageURL`; the `ingredients` port in `wiring.go` fills it from `ing.Image`. |
| `GET /api/stock` rows (`ingredientStockJSON`) | `imageUrl`, always sent. `service.IngredientStock` gains it (the stock wiring reads Ingredients). |
| Scan result `scan.ingredientImageUrl` and offline `products[].ingredientImageUrl` | `omitempty`. |
| `GET /api/ingredients/search`, `GET /api/ingredients`, `GET /api/members` | already send `imageUrl` / `photoUrl` and `avatar`; pinned by a test (search) so the pickers can rely on them. |

## Tests
Go (all red but the search pin): `internal/plan/httpapi/pe_attendance_test.go`, `internal/shopping/httpapi/pe_pictures_test.go` (plans a real meal), `internal/stock/httpapi/pe_pictures_test.go`, `internal/scan/httpapi/pe_pictures_test.go` (3), `internal/ingredient/httpapi/pe_search_test.go` (green).

Web: `ui/Thumb.test.tsx`, `ui/MemberPill/MemberPill.photo.test.tsx`, `ui/Select/options.pictures.test.tsx`, `ui/ImagePicker/ImagePicker.busy.test.tsx`, `features/pictures.guard.test.ts`; consumers `IngredientList.thumb`, `ProductList.thumb`, `ScanFeedback.thumb`, `useScanFlow.ingredientPicture`, `StockRow.picture`, `ShoppingBody.pictures`, `ingredientOptions.pictures`, `useIngredientChoices.picture`, `AttendeePills.photo`, `ApproveSheet.avatar`; busy: `NewIngredientSheet.busy`, `ProductForm.busy`, `MemberEditor.busy`, `RecipeEditorScreen.busy`; plan: `PlannedMealSheet.attendees`.

No new BDD feature: the behaviour is display-only and covered by the API and component tests above.

## Deferred production edits (files owned by other teams right now)
**After R2-2 (Today/Plan) merges** (test already written in a new file, `features/plan/components/PlannedMealSheet.attendees.test.tsx`, red now):
- `web/src/features/plan/types.ts`: `AttendanceMember`: drop `imageUrl`, add `photoUrl?: string` and `avatar?: string`.
- `web/src/features/plan/components/PlannedMealSheet.tsx` (the `plan-sheet__attendance` map): `<Avatar key name imageUrl={a.photoUrl} glyph={a.avatar} colour={a.colour} size="sm" />`. If R2-2 adds attendee avatars to `MealTile`/`TonightHero`/Today tiles, they use the same `Avatar` call.
- `web/src/features/plan/test-utils.ts` (if it builds attendance fixtures): add the new fields.

**After team SORT (`features/recipes`)**:
- `features/recipes/hooks/useMemberPicker.ts`: `settings.members.map((m) => ({ id, name, photoUrl: m.photoUrl, avatar: m.avatar, colour: m.colour }))` (today only `id`, `name`: the `MemberSelect` in the Recipe detail shows initials for everyone).
- `features/recipes/components/IngredientLineRow.tsx` / `StepsEditor.tsx` / `useIngredientRefs`: the `ingredients` given to `IngredientSelect` must carry `imageUrl` (from `Ingredient.imageUrl`).
- `PhotoPicker`, `StepPhoto`, `RecipeEditorScreen`: `onBusyChange` as above (test `RecipeEditorScreen.busy.test.tsx` is red now).
