# Recipe Assistant core: WP-A (pure backend) and WP-B (safehttp)

Status: tests written first (red), stubs compile. Pipeline step 1 of WP-A/WP-B of [ai-recipe-import.md](ai-recipe-import.md) (plan v2) and [ADR 0006](../../adr/0006-recipe-assistant-calls-anthropic-from-the-server.md). Branch `team/ra-ab-core`.

Out of this round (still WP-A in the plan, own pipeline later): `recipeassistant.PreparePhotos` and `imaging.PrepareForModel` (2,576 px, JPEG q90, auto-orient), `internal/config` `FEEDER_SECRET_KEY`, the catalogue/status files (`catalogue.go`, `models.go`). No SDK, store, routes, migration or UI (WP-C/D/E).

## Package layout

| Path | Role | Files here |
|---|---|---|
| `internal/secretbox` | AES-256-GCM, HKDF subkey; no IO, no logging | `secretbox.go`, `secretbox_test.go` |
| `internal/recipeassistant` | pure domain: errors, settings, limiter, prompt wrapper, output schema, finisher | `errors.go settings.go limiter.go prompt.go outputschema.go finish.go` + `*_test.go`, `testdata/output-schema.golden.json` (generate with `-update`) |
| `internal/recipeassistant/source` | HTML to text, JSON-LD Recipe nodes, image URLs | `extract.go`, `extract_test.go`, `testdata/pages/*.html` |
| `internal/recipefile` | + `CheckFile` | `check.go`, `check_test.go` |
| `internal/safehttp` | SSRF-guarded client extracted from imagefetch | `safehttp.go`, `safehttp_test.go` |
| `internal/recipefile/imagefetch` | thin wrapper, API unchanged | existing tests untouched; `wrapper_test.go` added |

Pure packages import no `net/http`, `database/sql` or SDK. `recipeassistant` imports `recipefile` and `docs/spec` only. Developer notes: add `golang.org/x/net` (html, `html/charset`) to `go.mod` (module cache has v0.62.0); `crypto/hkdf` is stdlib (Go 1.24+).

## Signatures

`secretbox`: `ParseMasterKey(string) (MasterKey, error)` (base64 std/URL, padding optional, exactly 32 bytes, `ErrMasterKeyMalformed`, never echoes the input); `MasterKey.ID()` (first 8 bytes of HMAC-SHA256(master, "feeder key id"), hex); `New(MasterKey) (*Box, error)`; `Box.Seal/Open` (nonce(12) || ciphertext || tag, AAD `recipe_assistant_settings.api_key.v1`, subkey HKDF-SHA256(info `feeder/recipe-assistant/api-key/v1`)); `SealAAD/OpenAAD`; `ErrDecrypt` for every failure, no bytes returned. `MasterKey` and `Box` print `[redacted]` under every `fmt` verb and in `slog`.

`safehttp`: `Blocked(netip.Addr) bool`; `New(Options{LookupIP, Allow, TLSConfig}) *Client`; `Client.Fetch(ctx, url, Policy{AllowedTypes, MaxBytes, Timeout, Header}) (Response{Body, ContentType, FinalURL}, error)`; `PagePolicy()` (text/html, application/xhtml+xml, text/plain; 3 MB; 15 s; `User-Agent: Feeder (+recipe import)`; `Accept-Language: en`); `Client.FetchPage(ctx, url) (Page{Body (UTF-8), ContentType, FinalURL}, error)`; errors `ErrNotHTTPS ErrBlocked ErrTooLarge ErrContentType ErrStatus ErrTooManyRedirects ErrCredentials`; `MaxRedirects = 3`. `imagefetch` keeps `New/Fetch/Blocked/Options/Err*/MaxBytes/Timeout/MaxRedirects`; its `Err*` are the safehttp values.

`recipeassistant` (all expected failures are `*Error{Code, Message, RetryAfterSeconds, Model, Paths}`; `CodeOf(err)`):
- `ValidateBaseURL(raw) (normalised, error)`, `OriginOf`, `OriginChanged`, `ValidateModelID`, `Last4`, `Secret` (redacting string), `DefaultSettings()`.
- `ApplyUpdate(cur Settings, in Update, secretKeyAvailable bool) (Applied{Settings, NewKey, Changes}, error)`, `ApplyKeyRemoval(cur) Applied`.
- `NewLimiter(now) *Limiter`, `Limiter.Acquire(Caller{UserID, HouseholdID, Admin}) (release func(), error)`.
- `ClassifyAPIFailure(APIFailure) *Error`, `ClassifyStopReason(stop, model) *Error`, `RetryWithinBudget(retryAfter, remaining) bool`. `APIFailure{Status, Type, Message, RetryAfterSeconds, Transport}` is plain data; the SDK adapter (WP-C) fills it from `*anthropic.Error`.
- `Addendum`, `SystemPrompt(agent)`, `ValidateText`, `Neutralise`, `BuildSourceText(Source) (string, error)`.
- `OutputSchema(canonical []byte) ([]byte, error)`.
- `Finish(raw, FinishInput) (Finished{File, Warnings}, error)`, `RepairPrompt([]PathError) string`, `TextImageURLs(text) []string`.

`source`: `Extract(body, finalURL) Page{Title, Text, Recipes []json.RawMessage, ImageURLs, CanonicalURL}`, `IsComplete(node) bool`, `MaxImages = 20`.

`recipefile`: `CheckFile(File) []PathError`.

## Decisions made while writing the tests (the plan left them open)

- `CheckFile` rules: `schedule.Validate` per Recipe (paths: `...steps[i].durationMinutes` / `.leadTimeMinutes` / `.kind` / `.after[j]`), an Advance Step with `after` (`...steps[i].after`), **fractional minutes are errors** (BuildPlan would round up silently; for a model answer we want a repair turn), Ready Meal needs exactly one line (`...ingredients`), duplicate Recipe names by normalised name (second spelling is the error, `...recipes[i].name`). Paths are more precise than BuildPlan's (`...steps[i].after[j]` vs `...steps[i]`).
- A rejected `Acquire` counts nothing and holds nothing; `read_in_progress` is reported before `too_many_reads`; `retryAfterSeconds` rounds up; a read leaves the window exactly one hour after it was accepted.
- `ApplyUpdate` check order: field syntax, then `secret_key_missing`, then `key_required_for_new_base_url` (only when a key is saved), then `api_key_required`. Origin = scheme, host, port with default port dropped. Empty or whitespace API key keeps the saved key. An API key is trimmed, at most 512 characters, no whitespace or control characters inside (`api_key_invalid`). Changes are one row per changed field; a no-op writes none. `Last4` shows nothing for keys under 8 characters.
- Model/URL "empty" is invalid, not "keep".
- `BuildSourceText` page format: `<source kind="web page" url="...">`, optional `<structured_data>` (JSON array of nodes, cap 30,000 characters by dropping later nodes; a node alone over the cap is dropped), optional `<page_title>`, `<page_text>` (omitted only when text exceeds 60,000 characters and a kept node is complete), `</source>`. Characters means runes. `url` attribute is escaped (`"`, `<`, `>`).
- `Finish` works on generic JSON so it can force and remove fields before `recipefile.Parse`; the first Recipe gets `FallbackImage` only on page reads and only if it still has no image after filtering; photo reads never keep images.
- `FetchPage` returns UTF-8 (header charset, then `<meta charset>`, via `x/net/html/charset`).

## Test list

secretbox (12): key parsing (4 encodings; malformed table, no echo), key ID, round trip, stored format re-derived with stdlib (HKDF, AES-GCM, AAD, not the raw master), 2,000 unique nonces, wrong master, tamper every byte and truncations, AAD binding, redaction under every verb and slog, errors free of secrets, no file created.

safehttp (21): `Blocked` table; policy content types, byte cap declared and streamed (and exactly at the cap), non-200, timeout for stuck server and slow body, headers and no cookies/credentials, no proxy; http and other schemes and credentials refused, private literals refused under the default policy, resolved addresses (one bad among good, mapped metadata), single lookup, every redirect hop (blocked server, metadata, private literal, http, credentials), redirect limit and final URL; page policy constants, html/xhtml/plain accepted, other types refused, 3 MB cap, headers, charset to UTF-8, https/redirect guard.

imagefetch (4 new, existing unchanged): sentinel errors are the shared ones, `Blocked` agrees, limits unchanged, credentials error.

recipefile (8): `CheckFile` example clean, step timing table, valid timing, fractional minutes, Ready Meal, duplicate names, document order, agreement with `BuildPlan`.

recipeassistant (about 45): code table and constants; base URL (accepted/normalised, rejected, 2048 boundary); origin; model ID; `Last4`; `Secret` redaction; `ApplyUpdate` (empty keeps, replace, first key, bad key, origin change with and without key, path-only change, no saved key, enable needs key, no server secret key, validation first, one change per field); `ApplyKeyRemoval`; limiter (one running per User incl. Admin, other users, idempotent release, 30/hour rolling and shared by Household, retry rounding, Admin exempt and uncounted, role at request time, Households separate, refusals free, in-progress first, concurrency); API failure and stop-reason mapping, `RetryWithinBudget`; addendum content, system prompt bytes, `ValidateText`, `Neutralise`, `BuildSourceText` (text exact, injection, page order, omissions, url attribute, over-limit rule, cap, photo); output schema (keywords, dropped keywords, structure, nullable integers, image, determinism, garbage, golden, spec example validates, `noRecipe`, closed objects); `Finish` (valid, forced fields, source URL, images, photo reads, fallback image, tags, no recipe, too many, invalid JSON, schema paths, `CheckFile`, injection); `RepairPrompt`; `TextImageURLs`.

source (about 25): text of a real page, skipped elements, article/main/body preference, block vs inline breaks, whitespace, list dashes, entities and broken markup, no panic and no truncation, 3 MB and 50,000-deep input; JSON-LD shapes table (15), cooking-field whitelist, script content not in text, `IsComplete`; images (order, absolute, https only, dedupe, skipped regions, cap 20), canonical URL, title.

## Acceptance (from the plan)

All §6.2 pure tests green; golden output schema committed; `go vet` clean; pure packages import no `net/http`/`database/sql`; `CheckFile` agrees with `BuildPlan` on shared fixtures; secretbox creates no files; every existing imagefetch test passes unchanged; T12 BDD green.
