# In-shop scanning: five proposals

Status: **decided** (2026-11-13): the user chose **A (Split)** with D's "Which Line is it?" and B's in-row Price entry; §12
records the decisions and §13 is the final spec. Base: 1.0.0-beta.6.5 (4f7b12bd), then beta7 merged. Design only: no code changes.
Receipt reading, the follow-up the user asked for, is designed in [receipt-reading.md](receipt-reading.md).
Mockups: one HTML page with all five proposals as 390×844 phone frames, light and dark (kept outside the repository).

**The user's brief:** "Redesign the in shop scanning experience: it should show a list of the items and quantities scanned, the
price and and a thumb if available; items from the shopping list are highlighted. We need a more streamlined creation of new
products; let's open the native camera to take a picture - entering the price should be easy, and should be possible from the
list itself. Create 5 proposals."

Words follow [GLOSSARY.md](../../GLOSSARY.md): the brief's "items" are **Products** (what was scanned) and **Lines** (what the
Shopping List asks for); a "thumb" is the **Picture** drawn by the shared `Thumb`, or its monogram. **Supply** is the term from
[household-items.md](../dev/design/household-items.md) (decision D1, coming in 1.0.0-beta.7). "Basket" is on the Shopping List's
_Avoid_ list, so no proposal uses it; "cost" is avoided for a Price (the running sum is the **total**).

## 1. Today's experience (read from the code)

| Area | What happens today | Where |
|---|---|---|
| Entry | The centre **Scan** button (`app/nav.ts`, the one accent nav item) opens `/scan`. It starts at once with the last Shop used on this device (`lib/initialChoice`, `lib/lastShop`), or shows "Where are you shopping?" (`ShopPicker`), which leads with the Shop the phone is at (Shop Location) and offers "Add the Shop I am in" and "Stock-take at home". A session started with the last Shop while the phone is at another offers "Switch to Coop". | `screens/ScanScreen.tsx`, `components/ShopPicker.tsx` |
| Layout | `PageHeader` (the Shop's name, **Change Shop**), the 140 px `ViewfinderStrip` (reticle, torch, mute), then the **last scan only** (`ScanFeedback`: Thumb, "Passata +700 g · $1.59", ✎, Undo, ×), banners, sync notices, and `LiveList`: the Shopping List, read-only, open Lines then ticked ones struck through, with "N left". | `screens/ScanScreen.tsx`, `components/LiveList.tsx`, `components/ScanFeedback.tsx` |
| What was scanned | **Not shown as a list.** Each scan replaces the feedback line; earlier scans are only visible as ticked Lines. Two packs of passata are two separate scans, two Stock Lots, two `scan_events`. There is no quantity, no running total on this screen (the Shop screen's "Shopping list complete" shows `summary.spentCents`). | `hooks/useScanFlow.ts` (`line` state) |
| A known barcode | `planScan` resolves offline against the cached Catalog (`GET /api/scan/offline`), then a `shop_scan` Op: a Stock Lot (pack size, or the decoded weight), "sold at" this Shop, a purchase, a Price, and `List.AfterLot`, which lowers the matching Line by Ingredient and ticks it at ≤ 0. The Result says `onList`, `remaining`, `ticked`. | `lib/resolveScan.ts`, `internal/scan/service/service.go` `purchase` |
| Prices | The Op's Price is prefilled from `OfflineProduct.lastPriceCents`, the latest Price **at this Shop**; if the Op has none the server uses `LatestPrice(product, shop)`. Prices are unique per Product, Shop and date (`prices` UNIQUE), so a second scan the same day replaces the day's Price. ✎ opens `PriceEditSheet` (a `TextField`, `inputMode="decimal"`, `parseMajor` takes "1.59" or "1,59"), then `PATCH /api/scan/{clientUuid}`, or `setQueuedPrice` while still queued. Weighed codes carry `pricePerKgCents`; a price-valued code with no €/kg asks the weight once (`AskWeightSheet`). | `components/PriceEditSheet.tsx`, `products/lib/money.ts`, `internal/product/price.go` |
| Unknown barcode | "What is this?" (`UnknownBarcodeSheet`): Ingredient (searchable `Select`, create new with the near-duplicate guard), pack size + unit, Product name (prefilled "<Ingredient> <size>"), scope "Any Shop / This Shop only" (`RadioCards`), an optional Picture via the shared `ImagePicker` (4:3 crop; raw Blob while offline), Save. A barcode owned by an Archived Product offers **Unarchive** first. Six fields, one long sheet. | `components/UnknownBarcodeSheet.tsx`, `lib/unknownForm.ts` |
| Undo | Only for the last scan: `cancelQueued` if still queued, else `POST /api/scan/{uuid}/undo` (reverses Lot, sold-at, purchase, Price, Line). | `hooks/useScanFlow.ts` |
| Offline | Ops queue in IndexedDB (`lib/queue.ts`, `lib/idbStore.ts`) with a Picture Blob store; flushed to `POST /api/scan/sync` in order with backoff; rejected ones become notices. | `hooks/useSyncQueue.ts`, `components/ScanNotices.tsx` |
| Data | `products` (name, Ingredient, pack size, Picture), `product_barcodes` / `shop_barcodes`, `prices` (Product × Shop × date, `price_cents` and/or `price_per_kg_cents`), `purchases`, `stock_lots`, `shopping_ticks`, `shopping_extras` (with `got`), `scan_events` (one per Op: quantity, Price, `on_list`, `ticked`, Lot, purchase, `prev_price_json`). | `internal/db/migrations/0400`, `0800` |

**What the brief changes.** A running list of what was scanned (grouped by Product, with a quantity), a Price on every row that
can be set from the row, Shopping List matches visible on those rows, a much shorter new-Product flow that starts the phone's own
camera, and all of it for Supplies too.

## 2. Shared foundations (every proposal)

These are the same in all five, so the proposals below only say where they differ.

### 2.1 The Scanned list (the model)

- A **Scanned row** is one Product in this session, grouping its `shop_scan` / `shop_unknown` Ops. Quantity **×N** = the number of
  Ops; the amount ("1.4 kg", "2 × 700 g") comes from the Ops' quantities, so a weighed Product shows its weight and no ×.
- The session is this Shop on this household day. It lives on the phone (IndexedDB beside the queue), so a reload keeps it and it
  works offline. It ends on **Change Shop** or the next day; the scans stay recorded either way.
- **Row anatomy** (`ListRow`, [system.md §3](system.md)): `[Thumb 48] [Product name, body-strong, ≤ 2 lines] [Price, value column]`
  over `[meta: ×N · amount · match]` and `[sub-value: €1.29 each / €20.00/kg]`. The Thumb is the Product's Picture, else its
  Ingredient's (PE), else the muted monogram on `surface-2`.
- **Supplies** are rows like any other: "Regina toilet paper 9 pieces", amount "9 pieces", matched by their Restock Line.

### 2.2 Shopping List matches ("highlighted")

Highlighting uses the **success** role, which [system.md §2](system.md) gives to "a ticked Line"; a match is the same fact seen
from the Scanned side. Never accent, never accent-soft (the accent is the one primary action; with Tomato it reads as alarm).

| State | Look | Meta copy |
|---|---|---|
| Matched, Line ticked | 18 px filled success tick badge on the Thumb's corner; meta in `--status-success-fg` with the tick icon | "✓ On the list · Passata ticked" |
| Matched, Line not ticked yet | the same badge, outlined; meta in `--status-success-fg` | "✓ On the list · 700 g still to get" |
| Not on the list (or Not needed) | no badge; meta in `--color-muted` | "Not on the list" |
| Waiting to sync | no badge yet (the match is a guess from the cached list); meta muted with the clock icon | "Waiting to sync · on the list" |

Where a proposal also shows **Lines still to get**, they are `ListRow`s with an empty tick circle (the Shop screen's `LineRow`),
muted quantity, never coloured: they are the open question, the scanned ones are the answer.

### 2.3 The native camera for a Picture

- A designed Button ("Take a Picture", camera icon) triggers a hidden
  `<input type="file" accept="image/*" capture="environment" hidden>`. That is the shared `ImagePicker`'s existing `FileButton`
  (`ui/ImagePicker/components/FileButton.tsx`), used on its own: no `getUserMedia` panel, no second in-page camera. No native control
  is visible; the Button is ours.
- **The scanner's stream is stopped before the input is clicked** and restarted on `change` or `cancel` (iOS ends a
  `getUserMedia` track when the camera app opens; Android may keep two cameras busy).
- The Picture is **centre-cropped to 4:3 automatically** (no crop step); "Adjust" on the Product page crops later. Online it is
  uploaded at once (`POST /api/images`) while the User fills the other fields; offline it is downscaled to 1600 px / 2 MiB and
  queued as a Blob (`lib/offlinePicture.ts`, PPX).
- **Desktop / no rear camera:** browsers ignore `capture` there and open the file dialog. The Button reads **"Choose a Picture"**
  when `matchMedia('(pointer: coarse)')` is false, and the sheet keeps the full `ImagePicker` (file, paste, drop) behind "More ways".
  Scanning itself on a laptop uses the webcam or **Type the barcode instead** (`ManualBarcodeEntry`).

### 2.4 Price entry

- **Our keypad, never the system keyboard.** A shared `PriceKeypad` primitive: twelve 56 px `<button>`s in a `role="group"`, a
  display `<output aria-live="polite">`, backspace, and Save; physical keyboards type into it. It sits at the bottom of the screen,
  in thumb reach. A11y: each key is a real button; the display is announced.
- **Decimals follow the Household's currency** (`fractionDigits`): EUR has 2, so the decimal key shows; a 0-digit currency (JPY)
  hides it. The decimal key prints the Household locale's separator ("," for Italy) and `parseMajor` already accepts both. Today the
  app formats Prices with `en-US` ("€1.29"); the mockups follow that.
- **Last Price at this Shop** prefills the keypad and every new row (`lastPriceCents`, already cached). A chip under the display
  says "Last time here €1.29"; leaving it confirms it (spec §10.1). No Price here yet: the row says **Add price** (a neutral
  surface-2 pill, not accent).
- **Per pack or per kg.** A `Segmented` "per pack · per kg" over the keypad, shown only for a Product in grams (and "per l" for
  ml). Typing €/kg shows the pack Price it implies ("€6.45/kg × 200 g = €1.29"). A weighed row opens in per kg. Pieces (most
  Supplies) only have per pack: household-items.md §1 keeps "price per piece" out of beta.7.
- **A group's Price** is per pack and applies to all of its scans (one Price per Product, Shop and day already).

### 2.5 Quantity, Undo, removal

- **Scanning the same barcode again adds one** (a new Op, a new Stock Lot): the row moves to the top, its ×N ticks up with a
  short spring (≤ 250 ms, reduced-motion: none), the beep and buzz as now.
- **+** adds a pack without scanning (six yoghurts: scan one, + five). **−** undoes that Product's latest Op (existing Undo).
- **Remove** takes the whole row away (each Op undone). For ×1 it is immediate with a Toast "Removed Monini olive oil · Put back";
  for ×2 or more a crafted `ConfirmDialog` ("Remove 3 Granarolo mozzarella? Their Stock Lots and Price go too.").
- **Undo** after any scan: the Toast "Added Mutti passata · Undo" for 5 s, as today, and it now names the row.

### 2.6 Creating a new Product: the short form

Every proposal reduces "What is this?" to **at most four decisions**, with these smart defaults:

| Field | Default | Can it wait? |
|---|---|---|
| Picture | none; one tap opens the camera | **yes** (add later on the Product page) |
| What it is: Ingredient or Supply | a labelled pair of picture chips "Ingredient · Supply" (beta.8; a `Segmented` in beta.7); the `Select` lists both under subheaders, matches as you type, creates new ("New Supply 'Toilet paper'") | no: the server needs it (`products.ingredient_id NOT NULL`) |
| Pack size | chips from the chosen Ingredient's existing Products and common sizes (500 g · 1 kg · 1 l · 6 pieces), then a `StepperField`; a new Supply defaults to **piece** | no (it is the Stock Lot's quantity) |
| Product name | "<Ingredient> <size>" (`suggestedName`), editable | **yes** (rename later) |
| Barcode scope | **Any Shop**; "This Shop only" behind "More" | **yes** |
| Price | the keypad inline, optional | **yes** (Add price on the row) |

The near-duplicate guard, the Archived-Product offer and the weighed-code variant (Ingredient and name only) stay as they are.

### 2.7 Edge cases, common rules

- **Offline:** the existing notice ("Offline: Scans are kept and sent when you are back online"); rows show "Waiting to sync";
  prices edit the queued Op (`setQueuedPrice`); new Products and their Picture Blobs queue; matches are computed from the cached
  Shopping List and confirmed by the sync Result.
- **Barcode not found:** the short form (2.6); "Type the barcode instead" after a failed read; "Not a product code" for a QR.
- **Shop not chosen:** the camera starts anyway; the header shows a Shop chip ("At Esselunga ▾", nearest or last used). With no
  Shop known, a sheet "Where are you shopping?" rises **over the live camera**, and a scan made meanwhile is held on the phone until
  a Shop is picked (an Op needs `shopId`).
- **One-handed:** every frequent control is in the bottom 40 % of a 390×844 screen; tap targets are ≥ 48 px; gestures (swipe to
  remove, drag the sheet) always have a button twin.

## 3. Proposal A: Split ("Viewfinder over the Scanned list")

**Idea.** Keep the shape the spec and the code already have, a compact viewfinder strip above a list, and make the list the
**Scanned list** instead of the read-only Shopping List. A two-tab `Segmented` switches between "Scanned" and "To get".

**Layout (390×844).**

```
┌ Esselunga ▾                         Change Shop ┐
│ ┌ viewfinder 180 px ─────────── torch  mute ┐   │
│ └───────────────────────────────────────────┘   │
│ [ Scanned 6 | To get 3 ]          €21.38 · 6 ✓  │  ← Segmented + total (title-3, tabular)
│ [▣✓] Mutti passata 700 g          €2.58   [−2+] │
│      ✓ On the list · Passata ticked  €1.29 each   │
│ [▣ ] Monini olive oil 1 l         €8.90         │
│      Not on the list                            │
│ [M✓] Regina toilet paper 9 pcs   [Add price]    │
│ …                                               │
└ nav ────────────────────────────────────────────┘
```

- The strip grows from 140 px to **180 px** (`ViewfinderStrip size="tall"`), still a strip: the list keeps ≥ 55 % of the screen.
- Rows show a compact `Stepper` (− ×N +) only on the row last touched, so rows stay calm; tapping another row moves it.
- The **total** is a `title-3` value beside the Segmented ("€21.38"), with "+1 without a Price" under it when some rows have none.

**Matches.** As §2.2. "To get" is the Shop screen's `LineRow` list (ticked ones collapse into "Ticked (4)"); a scan that ticks a
Line also flashes the "To get" count.

**New Product.** A **bottom sheet at 70 %**, the camera paused behind it:

1. **Take a Picture** (a 4:3 tile-sized Button at the top; after the shot the tile shows the Picture with "Retake").
2. **What is it?** `Segmented` Ingredient · Supply, then the `Select` (typeahead, "New Ingredient 'Passata'").
3. **Pack size**: chips + `StepperField`.
4. Name, prefilled; **Price** (an "Add price" pill that opens the keypad over the sheet).

Primary **Add to Scanned** (accent, the only accent on the sheet). "This Shop only" is under **More**.

**Price.** Tap the Price (or Add price) on any row: the **keypad sheet** (40 % height) rises; the row stays visible above it,
outlined, so the User sees what is being priced. Segmented per pack · per kg, "Last time here €1.29", Save.

**Quantity.** Scan again → ×N+1. Row Stepper − / +; swipe left on a row reveals **Remove** (button twin in the row's sheet).

**Edge cases.** Offline: a muted notice under the strip. No Shop: the "Where are you shopping?" sheet over the strip. One-handed:
the Segmented, Steppers and keypad are low; only Change Shop is high (rare).

**Copy.** "Scanned 6", "To get 3", "€21.38", "+1 without a Price", "Add price", "✓ On the list · Passata ticked", "Not on the
list", "Add to Scanned", "Take a Picture", "Retake".

- **Strengths:** closest to today's code and spec (§10.1 "compact viewfinder strip above the live list"); the camera never
  leaves the screen; both lists one tap apart; smallest build.
- **Weaknesses:** the list area is shorter than in B or D; the Shopping List hides behind a tab, so a User can forget it; two
  Segmenteds on screen when the keypad's per-kg toggle shows.
- **Fits best:** a mixed trip (half Lines, half Products not on the list), and as the safe first step.

**Data / API:** none required (the session list is on the phone). Optional additions of §8.

## 4. Proposal B: Receipt ("List first, Scan button, camera sheet")

**Idea.** The screen is a **receipt**: what is in hand, with Prices, and a large total. The camera is a tool you reach for with
the thumb: a floating **Scan** button (the screen's one accent) opens a camera sheet that stays open for continuous scanning.

**Layout.**

```
┌ Esselunga ▾                                      ┐
│ Total            €21.38      6 Products · 3 to get│ ← metric strip: 3 neutral tiles
│ From the list (4)                                │
│ [▣✓] Mutti passata 700 g   ×2           €2.58    │
│ [▣✓] Barilla spaghetti n.5 ×1           €0.99    │
│ Not on the list (2)                                     │
│ [▣ ] Monini olive oil 1 l  ×1           €8.90    │
│ 3 Lines to get ›                                 │ ← a ListRow that opens them in a sheet
│                                   ( ⌧ Scan  )    │ ← 64 px accent button, bottom-right, above the nav
└──────────────────────────────────────────────────┘
```

- Sections: **From the list** (success tick badges, §2.2) and **Not on the list**; inside each, newest first.
- The **camera sheet** is 45 % high, with the viewfinder and the last three scans as small chips under it; it never covers the
  totals. Dragging it down or tapping **Close** returns to the receipt. With the sheet open, the Scan button becomes the torch.

**Matches.** Sections do the highlighting as much as the badge: a matched Product is literally filed under "From the list". "3 Lines
to get" opens the Lines in a sheet with Tick by hand.

**New Product: Picture first.** An unknown barcode closes the camera sheet and **opens the phone's camera at once** (the
hidden input, §2.3), because the pack is in the User's hand right now. After the shot: a short **card** with the Picture at the
top, "What is it?" (typeahead, focused), the pack-size chips and **Add**. Name, scope and Price are deferred (Add price on the row).
Cancel in the camera app still shows the card, without a Picture.

**Price: inline, cash-register style.** Tapping a row's Price turns **that cell into the entry field** (an outlined pill with a
caret) and the Scan button's area becomes the keypad. Digits fill from the right: 1 → €0.01, 12 → €0.12, 129 → €1.29, so there
is **no decimal key** to miss (for EUR); a "00" key helps round Prices. Per pack · per kg above the keypad. **Next** jumps to the
next row without a Price, so a User can price a whole receipt in one pass; **Close** ends it.

**Quantity.** Scan again → ×N+1 and the row flashes. Tap the ×N to get a Stepper; swipe to remove.

**Edge cases.** Offline: a muted chip "Offline · 2 waiting" in the header. No Shop: the Shop chip says **Pick a Shop** and the
Scan button opens the picker first. One-handed: the Scan button and keypad are in the bottom-right thumb arc; left-handed Users
can flip it (a per-device setting, as mute is).

**Copy.** "Total", "From the list", "Not on the list", "3 Lines to get", "Scan", "Close", "Next without a Price", "What is it?", "Add".

- **Strengths:** the list and the money are first-class, as the brief asks; the fastest Price entry for a whole trip ("Next");
  Picture-first creation matches the moment (pack in hand).
- **Weaknesses:** one more tap to scan; the camera sheet hides most of the list while open; cash-register entry surprises Users who
  type "1,29" (the display makes it obvious after one digit).
- **Fits best:** Users who scan in bursts (fill the trolley, then scan at the checkout belt) and care about the total.

**Data / API:** none required. Optional: `lastPriceDate` (§8).

## 5. Proposal C: Tiles ("A Bento grid of what was scanned")

**Idea.** Bento all the way: every scanned Product is a **tile with a big Picture**, two per row, so the trip reads at a glance.
Unknown barcodes **never stop scanning**: they become "Describe later" tiles.

**Layout.**

```
┌ Esselunga ▾                                      ┐
│ ┌ viewfinder tile, full row, 120 px ───────────┐ │
│ [ €21.38 total ][ 6 scanned ][ 3 to get ]        │ ← metric strip (neutral)
│ ┌─────────────┐ ┌─────────────┐                  │
│ │ [Picture]  ✓│ │ [Picture]   │                  │
│ │ Mutti passata│ │ Monini oil  │                  │
│ │ ×2    €2.58 │ │ ×1    €8.90 │                  │
│ └─────────────┘ └─────────────┘                  │
│ ┌ ? Describe ─┐ ┌ ┄ Basil ┄┄┄ ┐  ← dashed: a Line still to get
└──────────────────────────────────────────────────┘
```

- Tiles: `BentoGrid min` ≈ 10 rem (two columns at 390, four at 834). Picture 4:3 at the top (monogram tile when none), name
  (body-strong, 2 lines), ×N chip and Price pill at the bottom.
- **Lines still to get** are dashed-outline ghost tiles at the end ("Basil · 30 g"), muted; they turn into a real tile when scanned.

**Matches.** A matched tile gets the **status tile border** (1 px `--status-success-fg`, as system.md §2 asks of status tiles)
and a success tick badge in its corner. Unmatched tiles are plain surface.

**New Product: Describe later.** An unknown barcode beeps differently and adds a **"?" tile** (barcode digits as its meta,
"Describe" pill); scanning goes on. Tapping the tile opens a **full-screen card**: the camera Button (big), the Ingredient /
Supply typeahead, pack-size chips, Add. Until described, the Op is held on the phone (not queued: it cannot be valid yet), the
tile shows "Not counted yet", and the total says "+1 to describe". Leaving the session with "?" tiles asks once: "2 Products are
not described. Describe them now or drop them?"

**Price.** Tap a tile's Price pill: the tile **lifts** (elev-2) and the keypad slides up below it, with per pack · per kg and
"Last time here". Decimal key per currency.

**Quantity.** ×N chip on the tile: tap → − / + over the Picture. Long-press or the tile's ⋮ → Remove.

**Edge cases.** Offline: tiles show a small clock badge. No Shop: the viewfinder tile becomes the Shop picker tile. One-handed:
the grid scrolls; the top row (viewfinder) is out of thumb reach, but scanning is hands-off; Prices and steppers sit at the
bottom of each tile.

**Copy.** "Describe", "Not counted yet", "+1 to describe", "Still to get", "Describe them now", "Drop them".

- **Strengths:** the most visual and the most "Bento"; Pictures do the recognising; Describe later keeps a fast checkout fast;
  ghost tiles show the list without a second view.
- **Weaknesses:** half the rows fit on a screen compared with a list; long names truncate at two lines on a 170 px tile; Products
  without a Picture make a wall of monograms; held "?" Ops are a new state to explain and test; the biggest build.
- **Fits best:** tablets on a trolley, Households that add Pictures to everything, weekly big shops.

**Data / API:** none on the server if "?" tiles stay on the phone (they do not sync to a second shopper). A cross-device
version would need a draft-Product table: not proposed.

## 6. Proposal D: List ("The Shopping List, scanned into")

**Idea.** The Shopping List **is** the screen: the Lines to get with their Pictures, and a thin viewfinder above them. A scan
ticks its Line, which **moves down into "Scanned"** carrying its Product, ×N and Price. Products not on the list gather under "Not on the list".

**Layout.**

```
┌ Esselunga ▾                    4 of 8 to get    ┐
│ ┌ viewfinder 110 px ─────────────── torch mute ┐│
│ To get (3)                                       │
│ [○][▣] Basil                       30 g          │
│ [○][▣] Cherry tomatoes             500 g  · 2×250│
│ [○][▣] Eggs                        6 pieces      │
│ Scanned (5)                              €12.48  │
│ [✓][▣] Passata → Mutti passata 700 g ×2   €2.58  │
│ [◐][▣] Mozzarella → Granarolo 125 g ×3    €2.67  │
│        ✓ 125 g still to get                      │
│ Not on the list (1)                      €8.90   │
│ [ ][▣] Monini olive oil 1 l  ×1          €8.90   │
└──────────────────────────────────────────────────┘
```

- **To get** rows are the Shop screen's `LineRow` (tick by hand stays). A partial match moves down too, with the outlined
  success badge and "125 g still to get"; it still counts in "4 of 8 to get" until its Line is ticked.
- **Scanned** rows read "Line → Product": the title is the Product, the meta is the Line ("✓ Passata"), in success.
- Header metric "4 of 8 to get" (`display` role is reserved for Shop's "16 of 18 left", so here `title-3`); the total sits on the
  Scanned subheader.

**Matches.** The highlight is position as well as colour: a matched Product lives under the Line it satisfied, with the success
tick (the ticked Line's look, §2.2). Off-list Products are muted and separate.

**New Product: "Which Line is it?"** The sheet opens with the **open Lines as chips** ("Basil", "Cherry tomatoes", "Eggs",
"Something else"). Picking a Line fills the **Ingredient (and its Base Unit) for free** and offers that Ingredient's usual pack
sizes; the name follows. So the common case is: tap the Line chip, tap a pack size, (optionally) Take a Picture, **Add**: three
taps. "Something else" shows the Ingredient · Supply typeahead. Restock Lines of Supplies are chips too ("Toilet paper").

**Price: inline row.** Tapping a Price **expands the row in place** (the list pushes down, the camera pauses): the display, two
chips **"Last time €1.29"** and **"€1.19 at Coop"** (the cheapest recent Price at another Shop), per pack · per kg, and the keypad
under it. Save collapses the row.

**Quantity.** Scan again → ×N+1 on the Scanned row (and the Line's "still to get" falls). − / + on the expanded row; Remove
there too (with the confirm for ×2+), which puts the Line back in To get.

**Edge cases.** Offline: the cached list drives the ticks, marked "Waiting to sync". No Shop: the list still shows (it does not
need a Shop), and the first scan asks the Shop. Empty list: the screen becomes A's Scanned list with "Nothing on the Shopping
List: everything you scan is an extra". One-handed: To get rows near the top are out of reach, but they are read, not tapped.

**Copy.** "To get", "Scanned", "Not on the list", "4 of 8 to get", "Which Line is it?", "Something else", "Last time €1.29",
"€1.19 at Coop", "still to get".

- **Strengths:** the strongest Shopping List focus (the point of the app); the shortest new-Product flow by far; the User sees
  what is missing without switching tabs; reuses Shop's `LineRow` and `useShoppingList`.
- **Weaknesses:** blurs the Scan and Shop screens (two nav items with near-twin screens; a later decision may merge them); a long
  list pushes Scanned below the fold; off-list Products feel second-class.
- **Fits best:** planned weekly shops, which are most of Feeder's use.

**Data / API:** "€1.19 at Coop" needs the latest Price at other Shops per Product in the offline data (`OfflineProduct.otherShopPrice:
{shopName, cents, date} | null`, additive). Everything else exists (`ShoppingList` is cached; `Applied.remaining`).

## 7. Proposal E: HUD ("Full-screen camera with a pull-up list")

**Idea.** For speed: the **whole screen is the camera**. A translucent HUD shows the last scan as a big card in the thumb zone;
the Scanned list is a sheet you pull up. Optional **"Ask the Price after each scan"** turns the trip into scan → type → scan.

**Layout.**

```
┌ [Esselunga ▾]                    [torch][mute]  ┐  ← chips on a scrim
│                                                 │
│              (live camera, reticle)             │
│                                                 │
│ ┌ last scan card ─────────────────────────────┐ │
│ │ [▣✓] Mutti passata 700 g   ×2  [ €1.29 ]    │ │  ← Price is a 48 px button
│ │      ✓ On the list · Passata ticked   [−][+] Undo│ │
│ └─────────────────────────────────────────────┘ │
│ ═══ 6 scanned · €21.38 · 3 to get ═══  (peek)   │  ← sheet handle, 72 px
└─────────────────────────────────────────────────┘
```

- The bottom nav hides while the HUD is up (the sheet's peek row replaces it; a back IconButton top-left leaves the session).
- The pull-up sheet has two snap points (50 %, 92 %) with A's Scanned / To get Segmented and the same rows.

**Matches.** The last-scan card carries the success badge and meta; the peek row says "3 to get"; the sheet's rows follow §2.2.
A scan that completes a Line gives a stronger buzz and the card shows "Passata ticked".

**New Product: stepper over the camera.** An unknown barcode freezes the frame and shows **one question at a time** in the
lower half, each with big targets: (1) **Take a Picture** / Skip, (2) What is it? (recent Ingredients and Supplies as chips +
typeahead), (3) Pack size (chips), then **Add**. A progress dot row shows 1 · 2 · 3. Each step is one tap in the common case.

**Price.** Tap the Price button on the card: the keypad replaces the card in the lower half, the camera stays visible above
(scanning paused). With **Ask the Price after each scan** on, the keypad opens by itself after a scan whose Price is unknown or
differs from the label (User's choice), prefilled with the last Price, so Save is one tap.

**Quantity.** The card's − / + and Undo; in the sheet as in A.

**Edge cases.** Offline: a chip on the scrim, "Offline · 2 waiting". No Shop: the Shop chip pulses and the first scan opens the
picker over the camera. Low light: the torch chip. One-handed: everything interactive is in the lower 45 %; nothing needs a reach.

**Copy.** "6 scanned · €21.38 · 3 to get", "Ask the Price after each scan", "Skip", "What is it?", "Add".

- **Strengths:** the fastest continuous scanning; the best one-handed ergonomics; the biggest camera, so the best reads in
  poor light; the "ask Price" mode makes complete price history a habit.
- **Weaknesses:** the list is hidden by default (against "show a list" in the brief, unless the sheet rests at 50 %); hiding the
  nav is a new pattern; full-screen video costs battery; hardest to make the scrim text pass contrast on every frame (needs a
  solid chip behind every label).
- **Fits best:** quick top-up trips, Users who price everything, poor light.

**Data / API:** none required.

## 8. Data and API changes

| Change | Why | A | B | C | D | E |
|---|---|---|---|---|---|---|
| **Scanned list on the phone** (IndexedDB: Ops + Results of this Shop and day) | the running list survives a reload and works offline | needed | needed | needed | needed | needed |
| `PATCH /api/scan/{clientUuid}` accepts `pricePerKgCents` (additive) | per kg from the keypad; today only `priceCents` | needed | needed | needed | needed | needed |
| A group's Price updates all its scans: the phone PATCHes each Op, or a new `PATCH /api/scan/prices {clientUuids, priceCents}` | `summary.spentCents` sums `scan_events.price_cents`, so every Op of the row must carry the new Price | needed (either) | needed | needed | needed | needed |
| `OfflineProduct.lastPriceDate` (additive) | "Last time here €1.29 · 3 Nov" | optional | optional | optional | optional | optional |
| `OfflineProduct.otherShopPrice` (additive) | "€1.19 at Coop" | – | – | – | needed | – |
| `GET /api/scan/session?shop=&date=` over `scan_events` (read only) | rebuild the list on another phone or after clearing site data; a second shopper sees the first one's scans | optional | optional | optional | optional | optional |
| Held "?" Ops on the phone (no server change) | Describe later | – | – | needed | – | – |
| Supply `kind` in the offline data and the Op's new Ingredient (household-items H4/H7) | Ingredient · Supply in the short form | beta.7 | beta.7 | beta.7 | beta.7 | beta.7 |
| New shared UI primitives: `PriceKeypad`, `ViewfinderStrip size="tall"/"full"`, row `Stepper` (exists) | – | keypad, tall | keypad | keypad, tile | keypad | keypad, full, snap sheet |

No migration is needed by any proposal. +1 and −1 reuse `shop_scan` and Undo; Remove reuses Undo per Op.

## 9. Comparison

| | A Split | B Receipt | C Tiles | D List | E HUD |
|---|---|---|---|---|---|
| One-handed use | good | **very good** (thumb button, keypad low) | fair (grid top out of reach) | fair (top rows out of reach, read-only) | **best** |
| Scanning speed | good (always on) | fair (open the sheet first) | **very good** (Describe later never stops) | good | **best** |
| New Product taps (common case) | 4–5 | 3–4 (Picture first) | 0 at the shelf, 4 later | **3** (Line chip) | 3–4 |
| Price entry | keypad sheet | **inline, Next to the next unpriced** | keypad under the tile | inline row + other-Shop Price | after each scan (optional) |
| Shopping List focus | medium (tab) | medium (sections + a row) | medium (ghost tiles) | **highest** | low (sheet) |
| The brief's "list of scanned" | **yes** | **yes** | as tiles | yes, under the Lines | in a sheet |
| Implementation size | **M** (smallest) | M | L | M–L | L |
| Data / API (beyond the shared rows) | none | none | none (phone-held "?") | `otherShopPrice` | none |
| Risk | low | low | medium (new held state) | medium (overlaps Shop screen) | medium (nav hidden, contrast on video) |

## 10. Recommendation

**Build A (Split), with two pieces borrowed.**

1. **A as the shape.** It keeps the camera always on and the spec's "strip above a list", it answers the brief literally (a list of
   what was scanned with quantities, Prices and Pictures, matches highlighted), and it is the smallest change to
   `ScanScreen`, `useScanFlow` and `LiveList`.
2. **D's "Which Line is it?"** as the first step of the short form: the open Lines (and Restock Lines of Supplies) as chips, with
   "Something else" for the typeahead. It makes new-Product creation three taps for planned shopping with no API change.
3. **B's inline Price with Next**: the row's Price cell becomes the entry, the keypad docks low, and **Next without a Price**
   walks the list. Keep the decimal key (users type "1,29" on a shelf label); cash-register entry can be a later setting.

Then measure. If Users mostly scan at the checkout belt, B's Scan button is the next step; if they ask for the camera bigger, E's
HUD can arrive as a "Full screen" toggle on A's strip, since both share the same rows and keypad.

Work, roughly: `PriceKeypad` primitive (S), Scanned list model and IndexedDB (M), rows, Segmented and Stepper wiring (M), short
form with Line chips and the native camera Button (M), `PATCH` per-kg and group Price (S). Supplies plug in with household-items
H7.

## 11. Open questions for the user (answered in §12)

1. Should a second shopper's scans appear in my Scanned list (needs `GET /api/scan/session`), or is the Shopping List's ticking
   enough?
2. Per kg: only for Products in grams (and per l for ml), or also "per piece" for Supplies (out of beta.7 today)?
3. After Change Shop, start an empty Scanned list (proposed) or keep the earlier Shop's rows greyed?
4. Hide the bottom nav while scanning (E), or keep it everywhere (A–D)?

## 12. Decisions (the user, 2026-11-13)

| # | Question | Decision |
|---|---|---|
| S1 | Which direction | **A (Split)**, with **D's "Which Line is it?"** as the first step of the new-Product form and **B's in-row Price entry with "Next without a Price"**. B's cash-register entry is not taken: the keypad keeps a decimal key. |
| S2 | A second shopper's scans in my Scanned list | **No.** The Scanned list is this phone's session; the second shopper's scans still tick Lines through the Shopping List (SSE). No `GET /api/scan/session`. |
| S3 | Per kg | **Per kg (Products in g) and per l (Products in ml) only.** Pieces, so most Supplies, have a Price per pack only. |
| S4 | After Change Shop | **An empty Scanned list.** The earlier Shop's scans stay recorded; they are not shown. |
| S5 | The bottom nav while scanning | **Kept**, as on every screen. |
| S6 | Receipt reading | **Added** by the user after the choice: "allow the user to take a picture of the receipt and sent it to the configured assistant with the scan contents to fill prices, weights and corrections to the products." Designed in [receipt-reading.md](receipt-reading.md). |

## 13. The chosen design: final spec

This section replaces §3 to §7 as the thing to build. §2 (shared foundations) still holds where this section does not say
otherwise. Mockup frames A1 to A3 show the shape; the Price entry follows B3 with a decimal key, and the new-Product sheet follows D2.

### 13.1 Starting a session

- Unchanged entry: the centre **Scan** button opens `/scan`. The session starts with the last Shop used, or with "Where are you
  shopping?" (`ShopPicker`, Shop Location first), as today.
- **No Shop known** (first use, or the last Shop was deleted): the camera starts and "Where are you shopping?" opens as a
  `BottomSheet` over it. A barcode read while the sheet is open is held on the phone (it cannot be an Op without `shopId`) and
  applied once a Shop is picked; closing the sheet without a Shop drops it with the Toast "Pick a Shop to keep that Scan".
- "You seem to be at Coop (40 m). **Switch to Coop**" stays as today, under the header.
- **Change Shop** ends the session: the next Shop starts with an empty Scanned list (S4). With unpriced rows it asks nothing;
  the Prices can still be set on the Product page.

### 13.2 The scanning screen

```
[PageHeader: Esselunga ▾                       Change Shop ]
[ViewfinderStrip size="tall" (180 px), torch, mute         ]
[Segmented: Scanned 6 | To get 3]          [€21.38        ]   ← title-3, tabular
                                           [+1 without a Price] ← meta, muted; absent when all are priced
[Scanned list (ListGroup of ScannedRow), newest first      ]
[ListRow "Read the receipt" (beta.7, receipt-reading.md)   ]
[bottom nav (kept)                                         ]
```

- **Segmented** `Scanned N · To get M`. N counts rows (Products), not scans; M is the Shopping List's open Lines. It remembers the
  last choice per device. A scan always switches back to Scanned and flashes the new row.
- **Total**: the sum of the rows' Prices (Price × count, or the weighed Price), `formatMinor`. Rows without a Price are left out
  and counted in "+k without a Price"; tapping that line starts the Price entry on the first such row (13.4).
- **Empty Scanned**: an `EmptyState` "Nothing scanned yet" with "Point the camera at a barcode. Lines to get are under To get."
- **To get** lists the Shopping List's open Lines. *Beta.8 (replaces "the Shop screen's `LineRow` list unchanged", which sent a
  tap to /shop):* **a row ticks by hand.** The whole row is one button, "Tick Passata"; a tap marks the Line bought, with the
  Shop screen's own tick (`useShoppingActions.tick`: the Line's remaining quantity, which adds it to Stock, and a fresh client
  id), and goes nowhere. The second line reads like a Scanned row's: the pack, then one tick and "x of y" (what this session's
  scans cover of the Line, "0 of 1400 g" before any scan, "700 of 1400 g" after one pack). The tick is hollow while the Line is
  open and filled while the tick is on its way (the row is busy and cannot be tapped twice). A Toast "Passata ticked · Undo"
  follows (Undo is the Shop screen's untick); the Line leaves To get at once and the Scanned list is untouched. A failed tick
  (offline included) says "Couldn't tick Passata. Try again." and changes nothing; a tick is not queued, as on the Shop screen.
  With every Line ticked the tab shows an `EmptyState` "Nothing left to get". Not needed, the Ticked group and the "How much?"
  sheet stay on the Shop screen (/shop), reached from the app's navigation. Supplies' Restock Lines are rows like the others
  (household-items §4.4); their "Supplies" subheader is not drawn here.

### 13.3 A Scanned row

`ScannedRow` is a `ListRow`: `[Thumb 48 + match badge] [Product name] [Price / Add price]` over `[meta] [sub-value]`.

| State | Meta (one line) | Value / sub-value |
|---|---|---|
| Matched, Line ticked | success tick + "On the list · Passata ticked" (`--status-success-fg`) | €2.58 / "×2 · €1.29" |
| Matched, more to get | outlined success badge; "On the list · 700 g still to get" | €2.67 / "×3 · €0.89" |
| Not on the list (or Not needed) | "Not on the list" (muted) | €8.90 / "×1" |
| Weighed | "On the list · 312 g" or "312 g" | €6.24 / "€20.00/kg" |
| No Price | as above | **Add price** pill (surface-2) / "×1" |
| Waiting to sync | clock icon, "Waiting to sync" (muted); the match badge appears with the Result | as above |
| Just scanned | `--status-success-bg` wash fading over 1.2 s (none with reduced motion); the row moves to the top | |
| Active (tapped) | the value column shows the compact `Stepper` (− ×N +) and the row gets a trailing ⋮ "More for Mutti passata": **Remove**, **Open the Product** | |
| Price entry | the value becomes a focused price pill (accent focus ring, the one focus on screen) | |

- Title: the Product name; Thumb: the Product's Picture, else its Ingredient's, else the monogram (system.md §7).
- Only one row is active at a time; scanning, scrolling away or tapping another row clears it.
- Supplies use the same row ("Regina toilet paper 9 pieces", amount "9 pieces").

**Changes after the mockup review (the user, 2026-11-13).** These replace the table above where they differ.

- *Row text.* Line 1 is the Product name only, without the pack size ("Mutti passata", not "Mutti passata 700 g").
  Line 2 is muted, normal weight: the pack size ("125 g", "9 pieces"), or the scanned weight of a weighed row. On a
  Shopping List row it goes on with " · ", one tick and "x of y": what this session's scans cover of the Line, against
  the Line's quantity, in the Line's unit ("250 of 375 g", "2 of 6", "312 of 300 g"). Metric g and ml name the unit once
  when both amounts share it and keep both when they format differently; imperial keeps both (as the Shop screen's
  Restock reason). The tick is a filled check-circle once the Line is covered and a hollow circle (Phosphor Circle) in
  the same success colour while some is still to get; exactly one per row, and no Thumb badge. A row not on the list
  shows only the size. "On the list", "ticked", "{Line} ticked", "still to get" and "Not on the list" are gone, so
  their strings leave 13.8. Rows stay two lines.
- *Active row.* The top part is the same as every other row (name, line 2, the Price with "×2 · €1.29"); the Price
  is plain text, and "Add price" stays the pill. Under it, in the same row card, one calm strip with a subtle top
  divider: the compact `Stepper` (32 px outline − and +, a regular-weight count) on the left; two quiet text buttons on
  the right, **Price** (accent text) and **Remove** (danger text). A weighed row has the strip without the Stepper.
  There is no ⋮ menu, so "More for {product}" and "Open the Product" leave 13.8. The Price entry starts from Add
  price, from the strip's Price, or from "+k without a Price". Remove behaves as in 13.6 (×1 at once with Put back,
  ×2 or more through the `ConfirmDialog`). Accessible names: "Quantity of {product}", "Price of {product}…",
  "Remove {product}".

### 13.4 Price entry (from B, with a decimal key)

- **Starts** from a row's Price or Add price pill, or from "+k without a Price". The camera pauses (no reads while typing).
- The **keypad sheet** (`PriceKeypad` in a non-modal `BottomSheet`, about 45 % of the height) docks at the bottom; the list scrolls
  so the row being priced sits just above it, outlined.
- Sheet content, top to bottom:
  - the row's name (meta) and, for a Product in g or ml, the `Segmented` **per pack · per kg** (or **per l**); a weighed row opens
    on per kg; pieces show no Segmented (S3);
  - the display: "€1.45" (`display` role), and under it what it implies: "= €2.90/kg for 500 g" or "× 312 g = €6.21";
  - one neutral chip: "Last time here €1.29 · 3 Nov" (tapping it types that Price), or "No Price at Esselunga yet";
  - the keypad: 1–9, the decimal key (the Household locale's separator; hidden for a 0-digit currency), 0, backspace;
  - actions: **Close** (tertiary) and the primary: **Next without a Price →** while another row has no Price, else **Save**.
- **Next** saves this row and moves the pill to the next row without a Price (top to bottom); the last one turns the primary into
  Save. Close saves what was typed if it is valid, and discards an empty or invalid entry.
- **What is saved**: a per-pack Price applies to every scan of the row; per kg sends `pricePerKgCents` and the pack Price it implies
  (rounded half up, `product.PriceForWeight`). Queued scans are edited in the queue (`setQueuedPrice`); applied ones through
  `PATCH /api/scan/prices` (13.9). A refused value shows the field error "Enter a number above 0".

### 13.5 A new Product (from D)

An unknown barcode pauses the camera and opens **"What is this?"** (`NewProductSheet`, replacing `UnknownBarcodeSheet`).

1. **Which Line is it?** Chips of the open Lines, partially covered ones included, Restock Lines of Supplies included, in list
   order, at most 8 then "More Lines"; and **Something else** (outlined, search icon). Picking a Line sets the Ingredient (or
   Supply), its Base Unit and the "ticks" promise. With no open Lines the step is skipped.
2. **Something else** reveals the choice **What it is** (a group label above two picture chips, **Ingredient** and
   **Supply**; decided 2026-11-13, beta.8: the label stays, the chips stay instead of the mockup's radio) and the `Select` (typeahead, "Ingredients" and "Supplies"
   subheaders, "New Ingredient 'X'" / "New Supply 'X'"; the near-duplicate guard as today). A new Supply defaults to piece.
3. **Pack size**: chips from the chosen Ingredient's existing Products and common sizes for its Base Unit (g: 250 g, 500 g, 1 kg;
   ml: 500 ml, 1 l; piece: 1, 4, 6, 10), then **Other** (a `StepperField` with the unit `Select`). The first chip is preselected
   when the Ingredient has one usual size.
4. **Take a Picture** (secondary Button with the camera icon): the hidden `capture="environment"` input (§2.3); after the shot the
   button becomes the Picture with "Retake". On a computer it reads **Choose a Picture**.
5. A summary note: 'Saved as "Eggs 6 pieces", Any Shop. **Rename**' (Rename turns the note into the name `TextField`), and
   **More: This Shop only**.
6. Primary: **Add · ticks Eggs** when a Line was picked, else **Add**. The Price is not asked: the new row says Add price and the
   keypad opens on it at once (Close leaves it unpriced).

Deferred by default: the Product name, the Picture, the scope and the Price. Required: what it is, and the pack size. The weighed
variant (Weight Barcode Rule, unknown item code) shows steps 1–2 only; the price-valued one also asks the weight once, as today.
The Archived-Product offer (Unarchive) comes first, as today. Offline: the same sheet; the Picture is kept as a Blob (PPX).

### 13.6 Quantity, Undo and removal

- Scanning the same barcode again: ×N+1, the row moves to the top, beep and buzz.
- **+** on the active row: a new `shop_scan` Op for the same Product (no camera). **−**: Undo of that Product's latest scan; at ×1
  it is Remove.
- **Remove** (⋮, or swipe left on the row with the button twin): ×1 at once with the Toast "Removed Monini olive oil · **Put back**"
  (Put back sends a new Op); ×2 or more asks first in a `ConfirmDialog`: "Remove 3 Granarolo mozzarella? Their Stock Lots and Price
  go too." **Remove** / **Keep them**.
- After every scan the Toast "Added Mutti passata · **Undo**" (5 s), replacing today's `ScanFeedback` line.

### 13.7 Edge cases

| Case | Behaviour and copy |
|---|---|
| Offline | `ScanNotices` as today under the strip: "Offline: Scans are kept and sent when you are back online"; rows "Waiting to sync"; match badges come with the sync Result; Prices edit the queue. |
| Rejected on sync | the row is removed and the notice "Couldn't sync a Scan: …" stays, as today. |
| Not a product code | banner "Not a product code" (as today). |
| Unreadable | "Couldn't read that, try again", reject buzz. |
| Camera fails | `CameraFailure` as today with **Type the barcode instead**; a typed barcode follows the same flow. |
| Stock-take | unchanged (`StockTakeSheet`); the Scanned list is Shop mode only. |
| A reload | the session (this Shop, this household day) comes back from IndexedDB; the next day it starts empty. |
| One hand | Segmented, rows, Stepper, keypad and primary actions are in the lower 60 %; Change Shop is the only control near the top. |

### 13.8 Copy (new strings, in `features/scan/strings.ts`)

"Scanned {n}", "To get {n}", "+{n} without a Price", "Add price", "On the list · {line} ticked", "On the list · {qty} still to
get", "Not on the list", "Waiting to sync", "Nothing scanned yet", "Price of {product}", "per pack", "per kg", "per l", "Last time
here {price} · {date}", "No Price at {shop} yet", "= {perKg}/kg for {size}", "× {weight} = {price}", "Next without a Price",
"Close", "Save", "What is this?", "Which Line is it?", "Something else", "More Lines", "Take a Picture", "Choose a Picture",
"Retake", 'Saved as "{name}", Any Shop.', "Rename", "More: This Shop only", "Add · ticks {line}", "Add", "Added {product}",
"Undo", "Removed {product}", "Put back", "Remove {n} {product}?", "Their Stock Lots and Price go too.", "Keep them", "More for
{product}", "Remove", "Open the Product", "Pick a Shop to keep that Scan".

Beta.8 adds: "Tick {line}", "{line} ticked" (with "Undo"), "Couldn't tick {line}. Try again.", "Couldn't undo that tick. Try again.",
"Nothing left to get", "Every Line on the Shopping List is ticked."

### 13.9 Data and API (final)

| Change | Where |
|---|---|
| The Scanned session on the phone: Ops and Results of this Shop and household day, in IndexedDB beside the queue | `web/src/features/scan/lib/sessionStore.ts` |
| `PATCH /api/scan/prices {clientUuids: [...], priceCents, pricePerKgCents?}`: one Price for all scans of a row, each event's `price_cents` updated (so `summary.spentCents` stays right), one Price row per day as now; 404 for an unknown uuid, 409 for an undone one, nothing written on error | `internal/scan/service`, `internal/scan/httpapi` |
| `PATCH /api/scan/{clientUuid}` also accepts `pricePerKgCents` (additive; the queue's edit of a queued Op already can) | same |
| `OfflineProduct.lastPriceDate` (additive, `YYYY-MM-DD`, absent with no Price) for "Last time here €1.29 · 3 Nov" | `internal/scan/httpapi/wiring.go`, `service.OfflineProduct` |
| From the Supplies plan (H4, in progress): `ingredientKind` on scan rows and offline Products, `Ensure` with a kind | H4 |

No migration. `+1` is a `shop_scan` Op, `−1` and Remove are Undo, as today.

### 13.10 Work packages (they replace the scan half of household-items H7)

Team format: **test author** (Sonnet: unit tests and Gherkin first) → **developer** (Haiku) → **reviewer** (Opus: checks against
this spec, GLOSSARY, ADRs and system.md; fixes small findings itself, sends larger ones back). The receipt WPs are in
[receipt-reading.md §10](receipt-reading.md#10-work-packages).

| WP | Scope | Files owned | Depends on | Size |
|---|---|---|---|---|
| **SR0 Spec** | functional spec §10.1 rewritten for the Scanned list, short form and Price entry; decision entry | `docs/spec/functional-spec.md` (§10.1 and the decision list only) | – | S |
| **SR1 Scan API** | `PATCH /api/scan/prices`, `pricePerKgCents` on the PATCH, `lastPriceDate` | `internal/scan/service/prices.go` (new) + test, `internal/scan/httpapi/httpapi.go`, `internal/scan/httpapi/wiring.go`, `internal/scan/store/store.go` (`UpdatePrices`) | **H4 merged** (H4 owns `internal/scan/**` until then) | S |
| **SR2 Primitives** | `PriceKeypad`, `ViewfinderStrip size="tall"`, compact `Stepper` variant if missing; Phosphor `Receipt` icon for receipt reading | `web/src/ui/PriceKeypad.{tsx,css}` + tests, `web/src/ui/ViewfinderStrip.{tsx,css}`, `web/src/ui/Stepper.{tsx,css}`, `web/src/ui/index.ts`, `web/src/ui/icons.ts` | – | S |
| **SR3 Session model** | pure grouping of Ops and Results into rows, totals, "next without a Price", the IndexedDB session, +/−/Remove and group Price in the flow | `web/src/features/scan/lib/scannedList.ts`, `lib/sessionStore.ts`, `lib/priceEntry.ts` + tests, `hooks/useScannedList.ts`, `hooks/useScanFlow.ts`, `hooks/useScanController.ts`, `api.ts`, `types.ts` | SR1 (contract) | M |
| **SR4 Screen** | the scanning screen, `ScannedRow`, Segmented, total, the keypad sheet and Next, Toasts, empty state; the footer slot for "Read the receipt" | `web/src/features/scan/screens/ScanScreen.tsx`, `components/ScannedList.tsx`, `components/ScannedRow.tsx`, `components/PriceEntrySheet.tsx` (replaces `PriceEditSheet`), `components/ScanFeedback.tsx` (removed), `components/LiveList.tsx` (removed), `scan.css`, `strings.ts` | SR2, SR3 | M |
| **SR5 Short form** | `NewProductSheet`: Line chips, Ingredient · Supply, pack chips, native camera Button, summary and Rename; the Op with `kind` (H7's unknown-form half) | `web/src/features/scan/components/NewProductSheet.tsx` (replaces `UnknownBarcodeSheet`), `lib/unknownForm.ts`, `lib/lineChoice.ts`, `lib/packChips.ts` + tests, `newProductStrings.ts` | SR2; H4 (contract); H5 (the New Ingredient `Segmented`) | M |
| **H7′ Shop** | what is left of H7: the Shop screen's "Supplies" group and Restock copy | `web/src/features/shop/**` | H4 (contract) | S |
| **SR6 Guards** | BDD `bdd/features/scan/scanned_list.feature`, `new_product.feature`, `price_entry.feature` and steps; page-layout scenarios for `/scan` (keypad open, sheet open) at 360, 390, 834; CHANGELOG lines | `bdd/features/scan/**`, `bdd/steps_scan_list_test.go`, `scripts/check-page-layout.mjs` (scan scenarios), `CHANGELOG.md` (scan lines) | SR4, SR5 | S |

**Order.** SR0 and SR2 start at once (with H4 running). SR1 after H4 merges. SR3 after SR1's contract is frozen (tests can start
on fixtures). SR4 and SR5 run in parallel (disjoint files; `strings.ts` belongs to SR4, `newProductStrings.ts` to SR5). H7′ runs
beside them. SR6 last, folded into H8 for the release.

**How H7 changes.** H7 owned all of `web/src/features/scan/**` for three things: the unknown form's kind and subheaders, the
offline kind, and nothing else in Scan. The form is rewritten by **SR5**, which takes those requirements (Ingredient · Supply,
subheaders, a new Supply on piece, `kind` in the Op); the offline kind (`ingredientKind` on `OfflineProduct`, from H4) is read by
**SR3**. H7 shrinks to **H7′**, the Shop screen only. No file is owned twice.

### 13.11 Beta.8 decisions (the user, 2026-11-13)

- **To get ticks by hand** (13.2). The row is the tick: a tap marks the Line bought and does not open /shop. The Line leaves To
  get with a Toast "{line} ticked · Undo". The tick adds the Line's remaining quantity to Stock, like "Tick and add to Stock" on the
  Shop screen's "How much?" sheet, whose prefilled answer it is; a different amount, "Tick without adding" and Not needed stay on
  the Shop screen.
- **New-Product sheet, "What it is"** (13.5 step 2). The group label "What it is" sits above the choice (the mockup had it); the
  choice stays picture chips (Ingredient, Supply) instead of the mockup's radio. The chips are a `radiogroup` named by the label
  (`aria-labelledby`), with roving tabindex, so the keyboard and screen readers read a radio choice while the eye sees chips.
