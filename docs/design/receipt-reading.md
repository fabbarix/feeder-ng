# Receipt reading

Status: **decided** (2026-11-13; the user's answers are in §13). Ships in 1.0.0-beta.7 (§12). Base: team/design-shop-scan (1.0.0-beta.6.5 with beta7 merged). No code changes yet.
It builds on the chosen Scan design ([shop-scan-proposals.md §13](shop-scan-proposals.md#13-the-chosen-design-final-spec)) and on
the Recipe Assistant (`internal/recipeassistant`, [ai-recipe-import.md](../dev/design/ai-recipe-import.md),
[photo-read.md](../dev/design/photo-read.md)).

**The user:** "allow the user to take a picture of the receipt and sent it to the configured assistant with the scan contents to
fill prices, weights and corrections to the products."

## 1. Goal and scope

At the end of a shop, the User photographs the till receipt. Feeder sends the photos and the Scanned list to the assistant the
Admin configured for the Recipe Assistant (same provider, key, model and limits). The assistant reads the receipt and matches its
lines to the Scanned rows. Feeder then shows a **review** of proposed changes; nothing is written until the User applies them.

**In:** Prices per row (per pack, or per kg / per l); the weights of weighed Products; quantities that differ from the scans;
receipt lines that were not scanned (**Add**); scanned rows that are not on the receipt (flagged, **Remove** offered); corrections
to a Product's pack size and name; the Shop and the date of the session.

**Out:** keeping the receipt photo (it is discarded after the read and never stored, §4.3, Q4); receipts of an earlier session (another Shop, another
day; Q5); whole-receipt discounts and loyalty points spread over lines (shown as a note only); spend reports; a receipt read without
a Scan session (a later feature could create one from the receipt alone).

## 2. Language

GLOSSARY entry (added by RR0), under "Food and shopping":

**Receipt**:
The paper (or printed) record a Shop gives at the till, listing what was bought and what it cost. Feeder reads it to correct a
Scanned list's Prices, weights and quantities; it does not keep it.
_Avoid_: Bill, till slip, invoice, ticket, scontrino

"Read the receipt" is the action (as "Read" is for the Recipe Assistant). "Assistant" stays the Admin's setting; the UI names the
provider as the Recipe Assistant does ("sent to Anthropic"). Domain words otherwise as in GLOSSARY: Product, Line, Price, Shop,
Scan, Stock Lot, Supply.

**ADR.** Yes: [**ADR 0018 "Receipts are read by the configured assistant"**](../adr/0018-receipt-reading.md). It adds a second outbound data flow (household
purchase data and a photo to the provider), reuses the Recipe Assistant's settings rather than adding a second provider setting,
and keeps writes behind an explicit review. It records the schema budget of §5.

## 3. UX

### 3.1 Where it lives

- **The Scanned list's last row**: a `ListRow` with the Phosphor `Receipt` icon, **Read the receipt**, meta "Fill in Prices and
  weighed amounts from a photo". It shows when the session has at least one scan and the assistant is available
  (`GET /api/recipe-assistant/status`: `available` and `photos`). Unavailable: hidden for a User; an Admin sees it muted with
  "Turn on the Recipe Assistant in Settings" linking to the settings.
- **The "Shopping list complete" celebration** gets a secondary button **Read the receipt** under the cost summary.
- The session lasts until Change Shop or the next household day (scan design §13.1), so the receipt can be read at the till, in
  the car or at home the same day.

### 3.2 Taking the photos

Full-screen route `/scan/receipt` (the Scan session stays mounted behind it; the camera strip pauses).

```
[‹ Back      Read the receipt                         ]
[ Photos (1 of up to 4)                               ]
[ [thumb] Photo 1          Edit · Remove   ≡ (drag)   ]
[ [ Take a photo ]  [ Add another photo ]             ]   ← native camera; "Choose a photo" on a computer
[ note: Long receipt? Take it in parts, top to bottom.]
[ privacy note (§4.3)                                 ]
[ Read the receipt  (primary, accent)                 ]
```

- **Take a photo** is our Button over the hidden `<input type="file" accept="image/*" capture="environment">` (the same
  `FileButton` as the new-Product Picture, scan design §2.3). The first photo opens the camera at once when the route opens.
- **Several photos** for a long receipt: up to **4** (`recipeassistant.MaxPhotos`), in order, reorderable; the copy asks for
  top-to-bottom parts with a little overlap. The model is told the photos are consecutive parts of one receipt (§4.2).
- **Rotate and crop** reuse the recipe-photo flow as it is: `PhotoList`, `PhotoRow` and `PhotoEditorPanel` over the shared
  `ImageEditor` (`aspect="free"`, rotate in 90° steps, crop, Retake), from `features/import` (photo-read.md D7, D10). Each new
  photo opens in the editor once, as in Import; **Use photo** returns to the list.
- The photos stay in memory only (not IndexedDB): leaving the route asks "Leave without reading?" ("The 2 photos are not kept.") in a `ConfirmDialog`.

### 3.3 Progress

- **Read the receipt** starts the read (`POST /api/scan/receipt/reads`, §7.1) and shows a progress tile over the photo list: an
  indeterminate bar, "Reading the receipt…", after 15 s "Long receipts can take up to a minute", and **Cancel**
  (`DELETE`, the read stops and is not counted again).
- The phone polls `GET …/reads/{id}` every 1.5 s, as the Recipe Assistant's read does. Leaving the screen does not cancel: the
  result waits for 10 minutes (`jobTTL`), and the Scanned list's row reads "Receipt read: review 9 changes".

### 3.4 The review

Route `/scan/receipt/review`. Nothing has been written yet; the header says so.

```
[‹ Back     Review the receipt                        ]
[ meta: Nothing changes until you apply.              ]
[ tile: Receipt €48.20 · Scanned €46.71 · 18 lines    ]   ← neutral metric strip (3 tiles)
[ Accept all (secondary)                              ]
[ section: Shop and date                              ]
[ section: Prices (6)                                 ]
[ section: Weighed Products (1)                       ]
[ section: Quantities (1)                             ]
[ section: Corrections (1)                            ]
[ section: Not scanned (2)                            ]
[ section: Not on the receipt (1)                     ]
[ sticky: Apply 9 changes (primary)                   ]
```

Each proposal is a `ListRow`: `[Thumb] [Product name] [the change]` over `[meta: the receipt line as printed]`, with a leading
designed checkbox (our `Checkbox`, a real `<input type=checkbox>` under the styling) as the control. The whole row toggles it.

| Section | Row shows | Default | Accept does |
|---|---|---|---|
| **Shop and date** | "Shop: Esselunga → **Coop**" (the receipt names another saved Shop); "Date: today → **Wed 12 Nov**" | unchecked | moves every scan of the session to that Shop and date (§8) |
| **Prices** | "€1.29 → **€1.35** per pack" or "Add price → **€4.49**"; per kg rows "€19.90/kg" | checked | the Price for every scan of the row |
| **Weighed Products** | "300 g → **312 g** · €6.21" | checked | the scan's quantity and its Price |
| **Quantities** | "×2 → **×3**" ("the receipt has 3") | checked | adds or undoes scans of the Product |
| **Corrections** | "Pack size 700 g → **500 g**"; "Name Mutti passata 700 g → **Mutti passata 500 g**" | unchecked | changes the Product, and this session's scans of it |
| **Not scanned** | the receipt line "PANE CASERECCIO 0,45 kg €2.25", button **Add…** | unchecked until set up | opens the short form (scan design §13.5, without a barcode) prefilled with the name, pack size or weight and Price; once filled the row is checked |
| **Not on the receipt** | the Scanned row, meta "Not on the receipt" in the info tone | unchecked | **Remove** the row's scans (Undo) |

- **Accept all** checks every row that needs no choice (Prices, Weighed Products, Quantities, Shop and date, Corrections); it never checks
  Not on the receipt (removing Stock is not a default) and leaves **Add…** rows waiting for their form. A second press reads
  **Clear all**.
- A note tile appears when the totals differ after all proposals: "The receipt total is €0.50 more than the Scanned list. Check
  the lines below." A whole-receipt discount ("SCONTO FEDELTÀ −2,00") is listed in a note, never spread on Prices.
- **Apply N changes** (accent, sticky) sends the checked ones (§7.2). Success: back to the Scanned list with the Toast "Applied 9
  changes from the receipt"; the rows show their new Prices. A partial failure is impossible by design (§8.3); a refused apply
  (the session changed meanwhile, 409) says "The Scanned list changed since the read. **Read it again**".
- **Back** keeps the review for its 10 minutes; leaving with checked rows asks "Leave without applying?".

Copy: "Read the receipt", "Fill in Prices and weighed amounts from a photo", "Take a photo", "Choose a photo", "Add another photo",
"Long receipt? Take it in parts, top to bottom.", "Reading the receipt…", "Long receipts can take up to a minute", "Cancel",
"Review the receipt", "Nothing changes until you apply.", "Accept all", "Clear all", "Shop and date", "Prices", "Weighed Products",
"Quantities", "Corrections", "Not scanned", "Not on the receipt", "Add…", "Apply {n} changes", "Applied {n} changes from the
receipt", "Read it again", "Leave without applying?", "Leave without reading?", "The {n} photos are not kept.".

## 4. What is sent to the assistant

### 4.1 The request

One Messages call, through the Recipe Assistant's Claude adapter (`internal/recipeassistant/claude`), with the Admin's base URL,
key and model. The user turn has, in order:

1. the photos, prepared by `recipeassistant.PreparePhotos` (JPEG, longest side ≤ 2,576 px, metadata stripped: no GPS);
2. one text block, wrapped as untrusted data with the Recipe Assistant's source wrapper (`prompt.go`), holding JSON:

```json
{
  "shop": "Esselunga",
  "date": "2026-11-13",
  "currency": "EUR",
  "minorDigits": 2,
  "rows": [
    {"row": 0, "product": "Mutti passata 700 g", "barcode": "8005110170003", "baseUnit": "g", "packSize": 700,
     "scans": 2, "quantity": 1400, "weighed": false, "priceCents": 129, "perKgCents": -1},
    {"row": 1, "product": "Parmigiano Reggiano", "barcode": "", "baseUnit": "g", "packSize": 300,
     "scans": 1, "quantity": 312, "weighed": true, "priceCents": 624, "perKgCents": 2000}
  ]
}
```

`row` is the server's index of the grouped Scanned rows (§7.1); the model answers with it. A weighed code's barcode is left
empty (it carries a weight or a Price, not an identity).

**Not sent:** the Ingredient names, Lines, Members, Users, other Shops, the Household name, the Picture of any Product, the
Shopping List. The Shop name and the date are sent because the receipt prints them and matching them is one of the proposals.

### 4.2 The system prompt

A fixed prompt in `internal/receipt/prompt.go` (golden in `testdata`), about 400 words: read a shop receipt from 1–4 photos that
are consecutive parts of one receipt (overlapping lines appear once); one output line per bought line, in receipt order; fold a
discount line printed under a line into that line's `priceCents`; amounts in minor units of the given currency; match a line to a
row only when the receipt text plausibly names that Product (brand, size), never by position; weighed lines give grams; use the
sentinels of §5 for anything not printed; never invent a line. The rows are data, not instructions (the wrapper says so).

### 4.3 Privacy

- The photo step shows, above the primary button, the same kind of note as Import's `photoPrivacy`:
  **"The receipt photos and your Scanned list are sent to Anthropic to read the receipt. Feeder does not keep the photos."**
  The provider name follows the Recipe Assistant's copy (the default base URL's provider); with a custom base URL it reads "sent to
  the assistant at {host}".
- The photos live in the request and the job's memory only; they are never written to disk or to `/data/images`, and the job
  drops them when the model call ends. The job keeps only the answer, for 10 minutes.
- Logs carry the request id, token counts and timing (as `logCall` does), never the photos, the rows or the answer.
- Settings › Recipe Assistant gains one sentence: "Members can also send receipt photos and their Scanned list to read a
  receipt." (The Admin turns the whole assistant on or off; no separate switch, Q2.)

## 5. The output schema: small on purpose

**Why.** In 1.0.0-beta.6 the Recipe Assistant's schema grew from 5 to 9 union-typed properties and every read failed with
"The compiled grammar is too large" (base-recipes.md §BR-C, `overrideSentinels`); earlier, optional fields nested in arrays
compiled for 180 s and were refused as "Schema is too complex" (`outputschema.go`). Structured outputs compile unions at
exponential cost, and nested objects in arrays compound it. The receipt schema is therefore written by hand (not projected),
checked in as a golden file, and held to a budget by a test.

**Rules.**
- Every property required; `additionalProperties: false` on both objects.
- **No unions**: no `anyOf`, no `type: [..., "null"]`. A missing value is a sentinel: `""` for text, `-1` for an amount or an index,
  `0` for a count, a weight or a pack size.
- **One array of flat objects**, nothing nested inside it: no arrays or objects inside a line.
- **No `$defs`, no `$ref`, no `pattern`, no `format`**; one small `enum`.
- Rows are matched by the **integer index the server gave** (`row`), never by text.

**The schema** (`internal/receipt/testdata/output-schema.golden.json`):

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["readable", "shopName", "date", "totalCents", "lines"],
  "properties": {
    "readable":   {"type": "boolean", "description": "false when the photos show no shop receipt; then lines is []"},
    "shopName":   {"type": "string",  "description": "the shop's name as printed, or \"\""},
    "date":       {"type": "string",  "description": "the purchase date as YYYY-MM-DD, or \"\" when it cannot be read"},
    "totalCents": {"type": "integer", "description": "the total paid in minor units, or -1 when it cannot be read"},
    "lines": {
      "type": "array",
      "description": "one entry per bought line, in receipt order",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["row", "text", "count", "grams", "priceCents", "unitPriceCents", "perKgCents", "name", "packSize", "packUnit"],
        "properties": {
          "row":            {"type": "integer", "description": "the index of the Scanned row this line is, or -1 when none"},
          "text":           {"type": "string",  "description": "the line as printed"},
          "count":          {"type": "integer", "description": "packs bought on this line; 0 for a weighed line"},
          "grams":          {"type": "integer", "description": "the weight of a weighed line in grams; 0 otherwise"},
          "priceCents":     {"type": "integer", "description": "the amount of the line after its own discount, minor units; -1 if unreadable"},
          "unitPriceCents": {"type": "integer", "description": "the price of one pack if printed, else -1"},
          "perKgCents":     {"type": "integer", "description": "the price per kg (or per litre) if printed, else -1"},
          "name":           {"type": "string",  "description": "row -1: a short Product name from the line; a matched row: a corrected name only if the row's is clearly wrong; else \"\""},
          "packSize":       {"type": "integer", "description": "the pack size printed on the line, in packUnit; 0 if not printed"},
          "packUnit":       {"type": "string",  "enum": ["g", "ml", "piece", ""], "description": "the unit of packSize; \"\" when packSize is 0"}
        }
      }
    }
  }
}
```

**Size: 15 properties (5 top-level, 10 per line), 2 object types, 1 array, 1 enum of 4 values, 0 unions, 0 `$defs`, 0 nested
arrays.** For comparison, the Recipe Assistant's schema that compiles carries 5 union-typed properties, several `$defs` and arrays of
objects inside arrays of objects.

**Budget test** (`internal/receipt/schema_test.go`): the golden matches byte for byte; walking the schema finds no `anyOf`, `oneOf`,
`allOf`, `$ref`, `$defs`, list-valued `type`, `pattern` or `format`; every object has all its properties required and
`additionalProperties: false`; at most one array, and no array or object property inside its items; at most 16 properties in total
(a new field needs a deliberate change to the test, and a run of the live test below).

**Live test** (`internal/recipeassistant/claude/live_receipt_schema_test.go`, opt-in, billed a few tokens, never in CI):
`TestLiveReceiptSchemaCompiles` sends `receipt.OutputSchema` with a one-line message and `MaxTokens: 16` to the default model under
`FEEDER_LIVE_SCHEMA_CHECK=1` and `FEEDER_ANTHROPIC_KEY`, and passes only on success or `CodeOutputTooLong` (as
`TestLiveOutputSchemaCompiles` does). A second opt-in test, `TestLiveReceiptReadsAFixture` (`FEEDER_LIVE_ANTHROPIC_KEY`), reads
`internal/receipt/testdata/receipt-esselunga.jpg` (a synthetic receipt made for the test, no real purchase) against fixture rows
and checks that `Finish` accepts the answer and at least the Price of row 0 is proposed.

### 5.1 Finish: from the answer to a checked result

`receipt.Finish(raw []byte, rows []Row) (Answer, []Warning, error)`, pure:

1. Not a JSON object (or data after it) → `CodeInvalidOutput`. `readable: false`, or no lines → `CodeNoReceiptFound` (new, §9).
2. Sentinels mapped back: `""` → absent, `-1` → unknown, `0` → none.
3. Per line: `row` outside `[-1, len(rows))` → treated as `-1` with the warning `row_out_of_range`; a negative amount other than
   `-1`, a negative count or weight, or a value past the sanity bounds (an amount above 100,000,000 minor units, more than
   10,000 packs, more than 10 t) → the line dropped with `line_invalid` (a total past the bound is unknown); `packUnit` must agree with `packSize` (else both
   cleared); a matched line whose `packUnit` differs from the row's Base Unit loses its pack size.
4. `date` not a real day, or later than today → absent. More than 200 lines → `CodeOutputTooLong`.
5. Nothing else is trusted: the rows' identities, Shops and Products come from the server, never from the answer.

## 6. From the answer to proposals

`receipt.Propose(rows []Row, ans Answer, ctx Context) []Proposal`, pure and unit-tested; `Context` holds today, the session's Shop
and date, the saved Shops' names, the currency. Each Proposal has a stable `id` (`price:3`, `add:12`, …), a kind, the row or line
it concerns, and the values before and after.

| Kind | Rule |
|---|---|
| `price` | A row's lines (all with readable `priceCents`): pack rows → per pack = round(Σ price / Σ count), or `unitPriceCents` when every line printed the same one; weighed rows → per kg from `perKgCents`, else Σ price × 1000 / Σ grams. Proposed when the row has no Price or differs by at least one minor unit. |
| `weight` | A weighed row (or a Product in g whose line has `grams` > 0; such a row is then read by weight: Price per kg, no quantity or pack size): Σ grams differs from the scanned quantity by more than 1 % or 2 g. The new Price follows: the lines' amount, else their per kg, else the row's own per kg at the new weight; the new scan keeps the per kg. |
| `quantity` | A pack row: Σ count differs from its scans. A matched line with `count` 0 is one pack (a receipt prints a count only above one), with or without a readable price; in the per-pack Price only the lines with a price count. |
| `pack_size` | A matched line's `packSize` (in the row's Base Unit) differs from the Product's pack size. |
| `name` | A matched line with a non-empty `name` that differs from the Product name (case and spacing ignored). |
| `add` | Each line with `row: -1`, a count or grams, and a Price (0 or more); prefilled name, pack size, unit and Price. An unmatched line with neither a count nor grams is not an Add (it shows only in the totals). Applying one needs an Ingredient (an existing one, or a new one with a name and a Base Unit), a Product name and a pack size above 0. |
| `missing` | A row that no line matched. |
| `shop` | `shopName` is set, does not match the session's Shop (normalised, `name_key` rules), and matches exactly one other saved Shop. A name that matches no Shop is a note only ("The receipt says LIDL"), never a proposal. |
| `date` | `date` is set, differs from the session's date, and is within the last 7 days. |

Notes (not proposals): the totals comparison; a whole-receipt discount (a line with negative `priceCents` and `row: -1`); lines
dropped by `Finish`. The projected total is the sum of the receipt's readable line amounts, **discount lines included**, so it
compares like for like with the total paid: a discount does not raise a "totals differ" note of its own (it has its own note),
and a difference means a line was missed or misread.

## 7. Server API

All routes are `r.User` (any signed-in User), behind the same availability check as the Recipe Assistant (`off`, `no_key`, …
answer `409 assistant_unavailable` with the reason) and the same **Limiter** instance (`wire.go` shares it): one running read per
User; 30 accepted reads per Household per rolling hour for non-Admins. A receipt read counts as one read.

### 7.1 Reading

- `POST /api/scan/receipt/reads` — body (JSON, the photo body limit of `recipefile/httpapi/reads.go`, 45 MiB):
  `{shopId, clientUuids: [...], photos: [{dataUrl}] (1..4)}`. The server:
  1. loads the session's events by `clientUuids` from `scan_events` (applied, not undone, `shop_scan` or `shop_unknown`, this Shop):
     unknown or undone uuids are ignored; none left → `422 scans_empty`. One loader serves the read and the apply,
     `scan/service.SessionEvents` (RR3), so both fingerprint the same values. Each event carries its Product's barcode
     (the first of `product_barcodes`, canonical GTIN-14; empty for a Product known only by a Shop or weighed code).
     **Weighed** (decided in the RR3 review): the ledger keeps no weighed flag, so a scan of a Product in g or ml is
     weighed when its Price was taken per kg — that day's Price row has a *recorded* per kg (never one derived from the
     pack Price) and the scan's Price is that per kg at its quantity (`product.PriceForWeight`, within one minor unit) —
     or else when its quantity is not the Product's pack size. A weighed scan's per kg is the day's (none when the day
     has none); a pack scan has none, even on a day whose Price row holds another scan's per kg. The per kg test catches
     the first weighed scan of a Product made from a weighed code, whose pack size is that first weight; the quantity
     test catches a weighed scan with no Price. (Rejected: "weighed when the day's row has a per kg", which marks every
     pack scan of a day with a weighed one, or a derived per kg, as weighed.)
  2. groups them into rows by Product (the same rule as the phone's `scannedList.ts`, shared through the fixtures), ordered by
     first scan, and gives each its index;
  3. computes a **fingerprint** (SHA-256 over the sorted uuids and their prices and quantities);
  the grouping and the fingerprint are the pure `receipt.GroupRows` and `receipt.Fingerprint` (RR1), which the apply uses too;
  4. prepares the photos, acquires the Limiter, and starts a job; answers `202 {id}`.
  Errors before the job: photo codes (`photos_empty`, `too_many_photos`, `photo_too_large`, `photo_unsupported`),
  `read_in_progress`, `too_many_reads` (with `retryAfterSeconds`).
- `GET /api/scan/receipt/reads/{id}` — `{status: "running"}`, or `{status: "done", fingerprint, rows, proposals, notes, totals}`,
  or `{status: "failed", error: {code, retryAfterSeconds?}}`. Only the User who started it may read it (404 otherwise).
- `DELETE /api/scan/receipt/reads/{id}` — cancels a running read (the context is cancelled; the model call stops).
- Jobs reuse the Recipe Assistant's job rules (`reads.go`): kept 10 minutes after they finish, at most 3 per User.

### 7.2 Applying

- `POST /api/scan/receipt/apply` — `{readId, fingerprint, clientUuids: [...], accept: [{id}], adds: [{id, ingredient: {id} | {name, baseUnit, kind},
  productName, packSize, scope}]}`.
  1. The read must be the caller's and still kept (`410 receipt_read_gone` for an unknown, expired or another User's read),
     and done: a read still running, or one that failed, is `409 receipt_read_not_done`. The apply is behind the same
     availability check as the reads (`409 assistant_unavailable`).
  2. The fingerprint is recomputed, as in §7.1, from the events the phone's session holds now (`clientUuids`, this Shop,
     applied, not undone, made today: an earlier day's scan among the uuids is left out, as the read leaves it out): a mismatch (a scan, an Undo or a Price edit since the read, or a session the phone has ended) is
     `409 receipt_session_changed`, nothing written. The read's own uuids would not see a new scan, so the phone sends its
     current ones.
  3. Every accepted id must be one of the read's proposals; each `add` must have its choices (`422` with the proposal id).
  4. The plan (§8) runs; the answer is `200 {applied: n, results: [ScanResult...], undone: [uuid...]}` with the new and
     re-priced scan Results and the uuids of the scans the plan undid (a Remove, fewer scans, a scan replaced by another
     weight, Shop or date; `[]` when none), so the phone rebuilds its session from them. `n` counts the distinct accepted ids
     (an id sent twice is one proposal).
  5. A step that fails puts back every step before it (§8.3) and answers
     `500 {error: {code: "receipt_apply_failed", message}, results: [ScanResult...]}`. Putting back an Undo applies the scan
     again under a **new** uuid, `receipt:<readId>:undo:<its uuid>` (with a `#n` suffix when an earlier attempt already used
     it), so `results` carries those scans, in the same shape as the 200's (`[]` when the put-back wrote none). The phone
     re-keys its Scanned list: each result replaces the scan whose uuid follows `undo:`. Nothing else in the session changed.
- Validation happens before the first write; the plan is built in full first.

### 7.3 Offline

Receipt reading needs a connection twice (the read and the apply) and the server's view of the session:
- **Offline**, the "Read the receipt" row is shown muted with "Reading the receipt needs a connection"; it turns on when the phone
  is back online.
- **Scans waiting to sync**: the row reads "Waiting for 2 Scans to sync first" until the queue is empty; `POST /reads` with a
  uuid the server has not seen simply leaves it out, so the phone checks first.
- **Connection lost during a read**: polling shows "Lost the connection. The read continues; come back to see it." and resumes on
  reconnect within the 10 minutes. **During the review**: Apply shows the transient error and stays; nothing is queued, because an
  apply must check the fingerprint against the server at that moment.
- No photo is ever put in the offline queue.

## 8. The apply plan

### 8.1 Reconcile, do not patch

Each row has a **target** after the accepted proposals: Shop, date, number of scans, quantity per scan, and Price (per pack or per
kg). The plan compares the target with the row's events and uses **only existing operations** of the scan service, so Stock
Lots, purchases, Prices, Shopping List ticks and Bought for a Planned Meal stay right without new rules:

| Difference | Operation |
|---|---|
| Price only | `SetPrices` (the new `PATCH /api/scan/prices` path of scan design §13.9) on all the row's events |
| More scans | new `shop_scan` Ops (`productId`, pack size, the target Price), `scannedAt` at the target date |
| Fewer scans | `Undo` of the latest events |
| Another weight or pack size, another Shop or date | `Undo` of each affected event, then a new `shop_scan` Op with the target quantity, Price, Shop and `scannedAt` (the household date at 12:00); `scanDate` already accepts a past date |
| Pack size or name correction | `UpdateProduct` (product store, name and pack size) first; then the replacement above for this session's events |
| Add | a Product created without a barcode (`products` create, as the Product sheet does), then a `shop_scan` Op; a new Ingredient or Supply through `ingredientsPort.Ensure(name, baseUnit, kind)` (H4) |
| Remove (missing) | `Undo` of each of the row's events |

**Shop and date move every row the User keeps** (decided in the RR1 review). A row the receipt does not list stays in the
session unless the User accepts its "Not on the receipt" proposal; keeping it says it was bought on this trip, so it moves to the
receipt's Shop and date with the others (one trip is never split across two Shops or days). A row whose Remove is accepted is
only undone, and a row whose weight changes is scanned again once, at the target Shop and date.

Order: Product corrections, Shop and date replacements, weight and quantity changes, Prices, Adds, Removes. New events get new
client UUIDs (`receipt:<readId>:<n>`, idempotent if the apply is retried with the same read).

### 8.2 One run under the scan lock

`scan/service.ApplyReceiptPlan(ctx, plan)` (new file `receiptplan.go`) takes the service's mutex once for the whole plan, so no
Scan from another phone interleaves; it publishes one SSE event at the end.

### 8.3 Atomic where possible

The scan service is not a single SQL transaction today: `purchase()` composes the Stock, Catalogue and List ports, each with its
own writes, and makes the whole atomic by **compensation** (its `undo` list). The plan does the same one level up: every step
records its inverse (a new Op → its Undo; an Undo → re-applying the original Op under a new uuid; `SetPrices` → the previous
Prices from `prev_price_json`; `UpdateProduct` → the previous name and pack size), and the first failure runs the inverses in
reverse and answers `500 receipt_apply_failed` with nothing left changed. A true single transaction would need the Stock,
Catalogue and List ports to accept a `*sql.Tx`; that refactor is not proposed here (noted as a follow-up in ADR 0018).

### 8.4 Known limits

- **An Ingredient created by a failed apply stays.** An accepted Add with a new Ingredient creates it through
  `ingredientsPort.Ensure` before its Product. When a later step fails, the put-back deletes the Product it made but not the
  Ingredient: the Ingredient port has no inverse for `Ensure`, and an Ingredient that already existed must never be removed. The
  leftover is an unused Ingredient, visible in the Ingredients list, which a retry of the same Add finds and reuses (`Ensure`
  matches by name). Accepted as a known leftover (RR3 review); no port change.
- **No Edit (rotate and crop) and no reorder of the receipt photos in 1.0.0-beta.7** (RR4 review). §3.2's reuse of the
  recipe-photo editor (`PhotoEditorPanel` over `ImageEditor`) and the drag handle of mock-up 13 are not built: each photo is
  prepared as taken (re-encoded as a JPEG, long edge 2576 px, at most 8 MiB) and can only be removed and taken again, in the
  order taken. A badly framed photo is retaken.
- **Leaving the photos screen while a read runs cancels it** (RR4, pinned by its tests): the screen stops polling and sends the
  `DELETE` with `keepalive`, so the slot is freed at once. §3.3's "leaving does not cancel" and the Scanned list row "Receipt
  read: review 9 changes" are not built; a finished read is still kept for its 10 minutes, so Back from the review returns to it.

## 9. Cost, limits and errors

**Cost.** Per read: about 1,600 input tokens per photo (a tall receipt is resized by the API), about 40 per Scanned row, about
1,500 for the prompt and schema, and about 60 output tokens per receipt line. A 30-line receipt in two photos with 25 rows is
roughly 6,000 input and 2,000 output tokens: a few US cents on the default `claude-haiku-5-5`. Calls use `MaxTokens: 8000`, effort
`low` where the model supports it, and no retries beyond the adapter's own (2, honouring retry-after within the budget).

**Time.** The whole read is capped at **120 s** (the Recipe Assistant allows 300 s for pages and repair; a receipt needs one call);
the stream's silence limit stays 120 s (`callTimeout`). The phone's progress says so after 15 s.

**Errors** reuse the Recipe Assistant's classes (`recipeassistant.Error`, `ClassifyAPIFailure`, `ClassifyStopReason`) and their
messages where they fit:

| Code | When | Copy | Retry |
|---|---|---|---|
| `assistant_unreachable` | timeout, connection, TLS, a stalled stream | "Couldn't reach the assistant. Check the connection and try again." | **Try again** (same photos) |
| `assistant_busy` / `assistant_rate_limited` | 5xx, 529 / 429 | "The assistant is busy. Try again in a minute." | Try again (after `retryAfterSeconds`) |
| `assistant_declined` | `stop_reason: refusal` | "The assistant would not read this photo. Try a clearer photo of the receipt." | Retake |
| `assistant_output_too_long` | `max_tokens`, or > 200 lines | "This receipt is too long to read at once. Read it in two parts." | Remove photos and read again |
| `assistant_invalid_output` | not JSON, schema broken | "The assistant's answer couldn't be used. Try again." | Try again |
| `no_receipt_found` (new) | `readable: false`, or no lines | "No receipt found in the photos. Take it flat, in good light." | Retake |
| `photo_*` | as in Import | the Import strings | Edit or replace the photo |
| `assistant_bad_key`, `assistant_billing`, `assistant_forbidden`, `assistant_model_unavailable` | settings problems | "The Recipe Assistant isn't working. An Admin can check it in Settings." (Admins: the specific message and a link) | no |
| `read_in_progress`, `too_many_reads` | Limiter | as for recipes ("You can read again in 12 minutes") | later |
| `receipt_session_changed` (new) | apply after a change | "The Scanned list changed since the read." | **Read it again** |
| `receipt_read_gone` (new) | apply after 10 min | "This read is no longer kept (10 minutes)." | Read it again |
| `receipt_read_not_done` (new) | apply of a read still running, or one that failed | "The receipt is still being read." | wait, or read it again |
| `scans_empty` (new) | no applied scans | "Scan something first." | no |

A failed read is not counted against the hourly limit when the request never reached the model (as the Recipe Assistant does);
a refusal, an unreadable photo and an invalid answer are counted.

## 10. Work packages

Team format: **test author** (Sonnet: unit tests and Gherkin first) → **developer** (Haiku) → **reviewer** (Opus: checks against
this document, GLOSSARY, ADRs, system.md and the tests; fixes small findings itself, sends the rest back). No two WPs own a file.

| WP | Scope | Files owned | Depends on | Size |
|---|---|---|---|---|
| **RR0 Language** | GLOSSARY "Receipt", ADR 0018, functional spec §10.5 "Reading the receipt", decision entry | `GLOSSARY.md`, `docs/adr/0018-receipt-reading.md`, `docs/spec/functional-spec.md` (§10.5 only) | the user's answers (§13, given) | S |
| **RR1 Pure core** | rows and grouping, the hand-written `OutputSchema` and its budget test, the system prompt and the request text, `Finish`, `Propose`, the plan builder (targets → operations) | `internal/receipt/{receipt,schema,prompt,finish,propose,plan}.go` + tests, `internal/receipt/testdata/**` (golden schema and prompt, fixture rows and answers) | RR0 | M |
| **RR2 Read service and API** | jobs, Limiter and availability shared with the Recipe Assistant, photos via `PreparePhotos`, the Claude call, `POST/GET/DELETE /api/scan/receipt/reads`, module wiring; both live tests | `internal/receipt/service/**`, `internal/receipt/httpapi/{reads.go,httpapi.go}` + tests, `internal/modules/receipt.go`, `internal/recipeassistant/service/shared.go` (new: exports the shared Limiter, availability and client factory), `internal/recipeassistant/claude/live_receipt_schema_test.go`, `internal/recipeassistant/fakeanthropic/testdata/receipt*.json` | RR1 | M |
| **RR3 Apply** | `ApplyReceiptPlan` with compensation, `POST /api/scan/receipt/apply`, fingerprint, the Product port's `UpdateProduct` | `internal/scan/service/receiptplan.go` + test, `internal/scan/httpapi/receipt.go` + test, `internal/receipt/httpapi/apply.go` | RR1; SR1 merged (`SetPrices`); H4 merged (`Ensure` with kind) | M |
| **RR4 Web** | the Scanned list's row and the celebration button, `/scan/receipt` (photos, editor, privacy, progress), `/scan/receipt/review` (sections, checkboxes, Accept all, Add… with the short form, Apply), errors | `web/src/features/receipt/**` (new: api, hooks `useReceiptRead`, `useReceiptReview`, lib `reviewState.ts`, components, screens, strings, css), `web/src/app/routes` entry for the two routes, the footer slot content passed to SR4's `ScanScreen` from `features/receipt/index.ts` | SR4 (footer slot), SR5 (`NewProductSheet` in "no barcode" mode), RR2 and RR3 contracts | M–L |
| **RR5 Guards and release** | BDD `bdd/features/receipt/*.feature` with the fake-anthropic receipt fixture (read → review → apply; refusal; changed session; offline); page-layout scenarios for both routes at 360, 390, 834, 1440; CHANGELOG; deploy note (a new data flow to the provider) | `bdd/features/receipt/**`, `bdd/steps_receipt_test.go`, `scripts/check-page-layout.mjs` (receipt scenarios), `CHANGELOG.md` (receipt lines), `docs/dev/deploy.md` (one paragraph) | RR2, RR3, RR4 | S |

**Order and parallelism**

```
RR0 ─► RR1 ─┬─► RR2 ───────────┐
            └─► RR3 (after SR1, H4) ─┼─► RR4 (after SR4, SR5) ─► RR5
```

- RR1 needs nothing from the scan redesign (it works on plain row structs); it can start as soon as RR0 is merged.
- RR2 and RR3 run in parallel (disjoint files). RR3 waits for SR1 and H4 because both own `internal/scan/**` before it.
- RR4's test author can start on fixtures once RR2's and RR3's responses are frozen.

### 10.1 With the Supplies plan and the scan redesign

- **H4** (in progress) owns `internal/scan/**` and is building `Ensure` with a kind and `ingredientKind` on scan rows; RR3 uses
  both (an Add of a Supply; a Supply row in the read's rows carries `baseUnit: "piece"`, no per kg). Nothing of RR touches H4's
  files.
- **H7** is replaced by the scan redesign's **SR5** (the short form, with H7's kind and subheaders) and **SR3** (the offline kind),
  and shrinks to **H7′** (the Shop screen's Supplies group and Restock copy); see
  [shop-scan-proposals.md §13.10](shop-scan-proposals.md#1310-work-packages-they-replace-the-scan-half-of-household-items-h7).
  RR4 builds on SR4 and SR5, so it comes after H7′'s neighbours, never beside them in the same files.

## 11. Tests

- **Go, pure** (`internal/receipt`): schema golden and budget; prompt golden; `Finish` on every sentinel, out-of-range rows,
  negative values, a bad date, `readable: false`, 201 lines; `Propose` table tests for each kind, Supplies (pieces: no per kg), a
  weighed Parmigiano, a split receipt where one Product is on two lines, a discount line, a receipt from another saved Shop and from
  an unknown one; the plan builder's operations and order.
- **Go, service**: the read job with the fake Claude (done, refusal, timeout, invalid output, cancel); Limiter sharing with recipe
  reads; photos never written to disk; the apply plan end to end on a real SQLite (prices, weights, quantities, Shop and date,
  Add of a new Supply, Remove), the fingerprint 409, and compensation after an injected failure at each step (nothing left changed).
- **Opt-in live**: `TestLiveReceiptSchemaCompiles`, `TestLiveReceiptReadsAFixture` (§5).
- **Web (Vitest)**: `reviewState` (defaults, Accept all, Clear all, Add needing its form), totals note, offline and waiting states,
  privacy note present, `ConfirmDialog` on leaving; component tests of each section.
- **BDD**: §10 RR5.

## 12. Release

**The scan redesign and receipt reading both ship in 1.0.0-beta.7** (the user's answer, 2026-11-13). This overrides this
document's earlier recommendation of beta.8 for receipt reading.

The redesign rewrites the same files as H7 (the unknown-barcode form, the offline data), so building H7 on the old screen and then
rebuilding it would be wasted work; beta.7 already carries migration 1550 and is the natural moment for a new Scan screen.
Receipt reading adds a new data flow to the provider (ADR 0018 and the user's privacy answers, both given), a new model schema
that has to be verified live before it ships (the opt-in live test of §5, run once before the release), and an apply path that
builds on the redesign's `PATCH /api/scan/prices` and Scanned list. The cost of shipping it with the redesign is that the apply
path is not tried against a beta of real Scanned lists first; the review step (nothing is written until the User applies) and
the compensation of §8.3 are what carry that risk. Receipt reading is therefore in beta.7's scope and its work packages (§10) run
in the same release as SR0 to SR6, H4 and H7′.

## 13. The user's answers (2026-11-13)

| # | Question | Answer |
|---|---|---|
| Q1 | Photos | **Up to 4 photos** (`recipeassistant.MaxPhotos`). *Proposed, not asked:* the doc's proposal stands. |
| Q2 | Who may send | **Any Member**, with the privacy note shown, the same as recipe reading. No separate switch. *Asked.* |
| Q3 | The limit | **Reads share the Recipe Assistant's limit** (one running read per User, 30 accepted reads per Household per rolling hour for non-Admins). *Proposed, not asked.* |
| Q4 | Keeping the receipt | **The photo is discarded after the read and never stored.** *Asked.* |
| Q5 | Late receipts | **Only today's shop can be read**: the current Scanned list, before Change Shop. An earlier session cannot be read. *Asked.* |
| Q6 | Defaults in the review | **As proposed** in §3.4: Prices, Weights, Quantities checked; Shop and date, Corrections, Not scanned and Not on the receipt unchecked. *Proposed, not asked.* |

Consequence of Q5: the session is this phone's Scanned list for this Shop and this household day, so once Change Shop is pressed
or the day turns, "Read the receipt" is gone and a read already done can no longer be applied: the phone's session is empty or
another Shop's, so the fingerprint the server recomputes from the `clientUuids` it sends (§7.2) no longer matches.
