# Recipe Assistant WP-D: Settings page (design note and test plan)

Status: red tests written (2026-11-10), branch `team/ra-d-settings`. Spec: [ai-recipe-import.md](ai-recipe-import.md) 5.1, 7 (API contract, frozen), 1.4, 1.7, 2, ADR 0006. Terms: GLOSSARY (Admin, Household, Recipe Assistant). Nothing here changes the API.

## Scope
Page `RecipeAssistantSettingsPage` in `web/src/features/recipe-assistant/` (Admin only). The Settings index row and the route registration are WP-F (team A1 is editing settings): the feature `index.ts` exports `routes = []` (so auto-discovery registers nothing), `RecipeAssistantSettingsPage`, and `recipeAssistantSettingsRoute: RouteObject` (`/settings/recipe-assistant`). WP-F adds the route object to the settings routes.

## Layout (all pieces are small; a component renders and wires events only)
```
types.ts                      wire types (done, type-only)
api.ts                        recipeAssistantApi: getSettings, saveSettings (PUT), removeKey (DELETE .../api-key), listModels (POST /models), testConnection (POST /test)
strings.ts                    all copy (tests pin the approved copy)
lib/baseUrl.ts                validateBaseUrl, isLocalHost, originOf, sameOrigin           (mirrors Go ValidateBaseURL / OriginOf / KeyFor)
lib/settingsForm.ts           form state machine, see below
lib/modelOptions.ts           toModelOptions, metaLine, isValidModelId, createModelLabel
lib/errors.ts                 fieldMessage, mapSaveError, warningCopy, checkCopy, testErrorCopy, mapTestError
lib/changes.ts                changeRow, agoCopy
hooks/useRecipeAssistantSettings.ts   (enabled) -> {settings,isPending,isError,save,saving,removeKey,removing}
hooks/useModelChoices.ts      ({enabled,baseUrl?,apiKey?}) -> {models,source,notice,isPending,failed,errorCode,refresh,refreshing}
hooks/useTestConnection.ts    () -> {run,running,result,error,reset}
hooks/useRecipeAssistantPage.ts   composes the above with the form (and useMe for isAdmin); the only hook the screen calls
components/SecretKeyMissingTile, AssistantToggleTile, ConnectionTile (base URL + ApiKeyRow), ApiKeyRow, ModelTile,
           TestResultTile, RecentChangesTile, SettingsActions
screens/RecipeAssistantSettingsPage.tsx
index.ts
```
Shared primitives only: `Tile`/`BentoGrid`, `Switch`, `TextField`, `Select`, `ListRow`, `Button`, `IconButton`, `Chip`, `Icon`, `useConfirm`, `PageHeader` (Breadcrumbs through `useBreadcrumbs()`, as `SettingsHeader` does). No native controls, no native dialog. Tile ids/labels: regions "Recipe Assistant", "Connection", "Model" (`id="model"`, the refusal link target), "Test connection", "Recent changes"; the secret-key tile is a `status` tile.

## Form state (lib/settingsForm.ts, pure)
`SettingsForm = {enabled, baseUrl, model, apiKey, replacing}`.
- `formFromSettings(s)`: key empty, `replacing: false`. `withBaseUrl`, `withReplacing` return new forms. The typed key text is kept while the address is edited.
- `originChanged(form, saved)` = not `sameOrigin(saved.baseUrl, form.baseUrl)`; an unparseable address counts as changed. `sameOrigin` compares scheme, host, port with the default port dropped, path ignored (same as `recipeassistant.OriginOf`, so the UI and `KeyFor` agree; path-only changes keep the key).
- `keyRowState(form, saved)` -> `{mode: 'saved'|'entry', canKeepSaved, required, unreadable}`: `saved` only with a readable saved key, same origin, not replacing; origin changed -> entry, required, no Keep; no key or unreadable -> entry, nothing to keep.
- `toPutBody`: trims; **`apiKey` is omitted unless non-empty after trim** (an empty field keeps the saved key). It never contains the saved key (the client never has it).
- `validateForm` -> `{baseUrl?, model?, apiKey?}` with API codes: base URL codes live, key errors after Save is pressed: `api_key_required` (enabled and no typed key and no readable saved key), `key_required_for_new_base_url` (origin changed, no typed key). Model: `model_required`, `model_id_invalid` (`^[A-Za-z0-9._:@/-]{1,128}$`).
- `canCallWithUnsavedValues` gates **Refresh models and Test connection**: secret key configured, address valid, and a key available (typed, or saved+readable on the same origin). When the origin changed, both stay unavailable until a key is typed, with text saying so ("Type the API key for the new address to test it." / "Type the API key to test the connection."). `modelsRequest`/`testRequest` send `baseUrl` only when the text differs from the saved one and `apiKey` only when typed.
- `isDirty`, `statusOf(settings)` -> Chip label/status by first match: Needs a secret key, Needs a key, Key can't be read, Model unavailable, On, Off.

## Behaviour notes
- **Save** is enabled when dirty. Pressing it validates; on errors it shows them and sends nothing. 422 `invalid_settings` errors map onto fields (`lib/errors.ts`); other failures show one general line and never the server text. Success warnings (`not_verified`, `no_photos`) show as a polite status line. The PUT answer is the new cache value; the typed key is cleared and never enters a query key, cache, storage or log.
- **Remove**: `useConfirm().choose` "Remove the API key?" (danger); on confirm DELETE, the form takes the answer (off, no key) and focus moves to the API key field. **Replace** focuses the field; **Keep saved key** returns to the row and discards the typed text.
- **Models**: loads on mount through `useModelChoices` (1 h cache per address, `refresh: true` bypasses). With a typed key (new address) nothing is fetched until **Refresh models** is pressed; the key is in the request body only. `source: "catalogue"` shows the server notice. A failed load shows "Couldn't load the model list. The saved model is still used." and the Select still has the current model as its only option. Options: API order (Haiku 5.5 first), groups Recommended, Other models, Older models, meta "$ · Fastest · description", deprecated -> "Retires 12 Mar 2027" with a warning flag; a current model not in the list is appended as group Custom. The component adds the price `Chip` as `leading`. Create row: `Use model ID “…”`; an invalid ID is refused with a message.
- **Retired model** (`modelStatus: unavailable`): status "Model unavailable" and the line "The chosen model is no longer available. Pick another model." on the picker (also from a 422 `model_unavailable`); picking another clears it.
- **Test connection** uses the unsaved values; shows "Testing the connection…", then the checks (key, model, output) with text ("Failed" is a word, not only a colour) and mapped reasons from 1.4, "Connected to <model>" and latency. Editing any field clears the old result.
- **Admin only**: `useMe().isAdmin`; a plain User sees "Only an Admin can change the Recipe Assistant." and nothing is fetched.
- **Interim action bar**: `SettingsActions` (one local component, group "Settings actions", Cancel tertiary + Save primary, "Saving…" while busy). It swaps for `ui/StickyActionBar` (R2-L, L-03) in a one-line follow-up; no copied bar markup.

## Assumptions to confirm with WP-C (the contract is frozen, these are its gaps)
1. `priceTier` is `"$"`..`"$$$$"` or `""`, `speedTier` is `Fastest|Quick|Steady|Slow` or `""` (the catalogue's words).
2. `changes[].detail`: for `model_changed` and `base_url_changed` it is `"old -> new"` (model IDs, not names; the page shows the new one as a name when the model list is loaded, else the ID); last four for key events; empty for on/off. `actorName` is the actor's email.
3. `TestResult.checks[].code` uses the read error codes of 1.4 (`assistant_bad_key`, ...).
4. A 422 on `/models` and `/test` has the code at `error.code` (`key_required_for_new_base_url`, `base_url_*`), as the table says.
5. SSE topic `recipeAssistant` is not wired here (a second Admin's change shows on reload); a follow-up can reuse the household live-updates pattern.

## Icons and primitives needed
- Icons: R14 added `key`, `assistant` and `refresh` to `ui/icons.ts`; `link` already existed and `connect` was not added. `recipe-assistant/icons.ts` maps the page's local names to them: `key`->`key`, `assistant`->`assistant`, `refresh`->`refresh`, `connect`->`link`.
- `scripts/check-ui.rules`: add `web/src/features/recipe-assistant` to the `fail_paths` of every rule (developer task; the rules file is not a test).
- No new shared primitive. `ui/StickyActionBar` is not required (interim `SettingsActions`).

## Tests (all red until implemented)
| File | Covers |
|---|---|
| `lib/baseUrl.test.ts` | https/localhost rules, `/v1`, userinfo/query, length, origin and `sameOrigin` (KeyFor cases) |
| `lib/settingsForm.test.ts` | form <-> body, empty key omitted, key row states, validation, unsaved-call gating, request bodies, status chip |
| `lib/errors.test.ts` | code -> copy, save error mapping, warnings, test check copy |
| `lib/modelOptions.test.ts`, `lib/changes.test.ts` | options/groups/meta/custom, change history wording and "ago" |
| `hooks/hooks.test.tsx` | settings GET/PUT/DELETE semantics, no key in any cache, models cache/refresh/fallback/failure, test connection |
| `components/*.test.tsx` | ApiKeyRow, SettingsActions, TestResultTile, RecentChangesTile, SecretKeyMissingTile |
| `screens/RecipeAssistantSettingsPage.test.tsx` | access, unavailable/off/on/replace/remove/unreadable, base URL hints, origin change, model picker, retired model, save results, Test connection, a11y |
| `index.test.ts` | exports, no registered route |
| `features/native-controls.test.ts` | folder joins the guard; components never call the API; lib has no React; no storage or console |
| `ui/icons.test.tsx` | the five icon names |

## Server code differences (found at review against WP-C)
- `model_invalid` is a server code for a refused model ID; it has its own copy ("This model ID can't be used. Pick another model.") beside `model_id_invalid`.
- `base_url_invalid` also covers plain http to a non-local host (the client pre-checks it as `base_url_not_https`, so a server answer with `base_url_invalid` for that case shows the generic address copy).
- `actorName` is the actor's email address.
- `model_changed` detail is `"old -> new"` model IDs.
- A refused key on **Refresh models** (`api_key_refused`, read from `errorCode`) shows "Anthropic refused this API key. Check it and try again." instead of the general list notice.
- A successful save that changes the address origin invalidates the saved-address model list.
- The page no longer waits for the model list: it renders as soon as the settings arrive; the Model trigger shows the saved ID until the list loads.
- The "deploy guide" in the secret-key tile is plain text (the `/docs/deploy` link was dead); WP-F restores the link (TODO in `SecretKeyMissingTile.tsx`).
