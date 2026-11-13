# Feeder

Meal planning for a single family: recipes, an automatically generated meal plan, leftovers, and a shopping list ticked off by scanning products in-store.

## Language

### People

**Household**:
The single family that one deployment serves; owns all recipes, plans and shops.
_Avoid_: Family, tenant, account

**Member**:
A person who eats from the plan and counts towards portions; need not have a login. May carry an email, so that person can sign in as a User. Shown by an **Avatar**.
_Avoid_: Eater, person, diner

**Avatar**:
How a Member is drawn in lists and pickers: their photo, else their emoji, else their initials. The Admin picks which in the Member sheet; a photo that cannot be loaded falls back to the emoji, then the initials.
_Avoid_: Profile picture, icon, userpic

**User**:
Someone who signs in with Google to use the app, because their email is on the **Allowlist** (an Admin added it, or a User approved their Access Request) or a Member carries it; may be linked to a Member.
_Avoid_: Account, login, member

**Admin**:
A User who also manages who may sign in, the Members, Meal Slots, Courses, Shops and household settings.
_Avoid_: Owner, superuser

**Allowlist**:
The list of emails, managed by an Admin, that may sign in at once. An approved Access Request, or the first sign-in with an email a Member carries, adds that email to it; any other verified Google email makes an **Access Request** instead.
_Avoid_: Invite list, whitelist

**Access Request**:
A verified Google account's request to sign in, waiting for any User to approve or deny it; it expires after 14 days.
_Avoid_: Invite, join request, signup, application
_Note_: the UI calls the list of Access Requests "Sign-in requests" and the matching push notification type "Sign-in request"; both name this term.

### Recipes

**Recipe**:
A dish made from Ingredients, with a Yield, one or more **Courses** it can fill, an optional **Whole meal** flag and optional timed Steps; the Household can plan it unless it is a **Base recipe** (beta.6).
_Avoid_: Dish, meal
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)).

**Yield**:
The number of standard portions one Batch of a Recipe produces. A **Base recipe**'s Yield is an amount with a unit instead (1 l, 300 g, 8 portions).
_Avoid_: Servings, makes
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)).

**Base recipe**:
A Recipe that other Recipes call for on an ingredient line (a béchamel, a pasta frolla, a stock) and that is never planned on its own: it has no Courses, and it is never chosen for a Meal Slot or Pinned. Feeder keeps an Ingredient of its own for it, so a bought jar or a frozen batch can be stocked, scanned and used first; only what Stock does not cover is made, scaled from its Yield, and only that goes on the Shopping List. A Base recipe may call for other Base recipes, but never, through any of them, for itself.
_Avoid_: Component, sub-recipe, sub recipe, nested recipe
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)); beta.5 copy must not offer it.

**Base recipe line**:
An ingredient line that calls for a Base recipe by amount ("500 ml Béchamel (Base recipe)"). Every Ingredient inside the Base recipe, at any depth, counts for Exclusions and the planner as if it were on the Recipe itself. A plain line is turned into one only when a User links it.
_Avoid_: Recipe reference, linked recipe, sub-recipe line
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)).

**Needed at**:
The Step of a Recipe by which a Base recipe line must be ready: the Base recipe's Steps are placed on the cooking timeline to finish before it. Unless the User picks one, it is the first Step that uses the Base recipe, else the first Step whose text names it, else the first Step.
_Avoid_: Link step, anchor step, ready-by step
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)). Do not confuse with **Not needed** (a Shopping List line).

**Last cooked**:
The latest date a Recipe was Cooked fresh (not served from a Leftover).
_Avoid_: Last made, last eaten

**Ready Meal**:
A Recipe made from exactly one Ingredient (a bought pack), whose Yield is the portions in that pack. Feeder keeps an Ingredient with the Recipe's name for that pack, so it can be stocked and bought. A Ready Meal is not always a Whole meal: marking a Recipe as a Ready Meal switches Whole meal on when its Courses include the main Course, and the User may switch it off (a frozen pizza that wants a salad beside it, or a bought dessert). Whole meal is a flag of its own because one-pot Recipes that are not Ready Meals need it too.
_Avoid_: Convenience food, pre-made

**Step**:
One instruction in a Recipe, optionally timed, illustrated and referring to the Ingredients it uses.
_Avoid_: Instruction, direction

**Passive Step**:
A timed Step that needs no attention while it runs (e.g. simmering), so the cook can carry on with later Steps.
_Avoid_: Background step, wait step, a wait
_Note_: "wait" is fine as an ordinary verb ("Save waits for the Photos"), but never a name for a Passive Step: not "a wait", not "wait step".

**Advance Step**:
A Step to be done a set lead time before the Planned Meal's slot time (e.g. defrost 24 h before, marinate 4 h before).
_Avoid_: Prep step, pre-step

**Cook Mode**:
The hands-free, step-by-step view used while cooking, which follows a Meal Slot's **cooking timeline** and runs the Step timers. It can also show one Course, or one Recipe, on its own.
_Avoid_: Kitchen mode, guided mode

**cooking timeline**:
The order and timing of the Steps Cook Mode walks through. For a Meal Slot on a date it interleaves the Steps of every fresh Course still to cook, plus the Reheat of any Leftover Course, with one cook: each Course keeps its Recipe's own schedule and is placed as late as it can, so that every Course is ready together; for a Recipe on its own it is that Recipe's Steps. Advance Steps are outside it. Each Step in it still belongs to its Course.
_Avoid_: Combined run, merged schedule, cook plan, multi-course mode

**Reheat**:
Warming a Leftover for the Planned Meal it is served at, with a short timer before the meal is marked Cooked; a Leftover has no Steps, so it uses its own screen rather than Cook Mode. The timer starts at the Recipe's Reheat time when it has one.
_Avoid_: Microwave, warm up

**Reheat time**:
The optional number of minutes (1 to 30) a Recipe says its Leftover takes to reheat; Reheat starts its timer there. Without one, Reheat works the time out from the portions.
_Avoid_: Warm-up time, microwave time

**Photo**:
The one picture a Recipe, a Step or a Member may have, added through the image picker. An Ingredient's or a Product's picture is called its **Picture**.
_Avoid_: Thumbnail, upload

**Recipe File**:
A JSON document in the published exchange format holding one or more Recipes and the Ingredient definitions they use, with images embedded or linked. A Recipe names its Courses by name and carries its Whole meal flag.
_Avoid_: Export, bundle, backup

**Import Review**:
The screen where a Recipe File's Ingredients and units are matched to existing ones (or created) before the Recipes are saved.
_Avoid_: Import wizard, mapping

**Agent Prompt**:
The copyable instructions, including the exchange schema, that make an AI agent turn an arbitrary recipe into a valid Recipe File.
_Avoid_: Parser prompt, AI import

**Course**:
One part of what a Meal Slot serves, filled by one Recipe (e.g. Starter, Main, Side, Dessert). The Household defines its Courses and their order in Settings; a Recipe is marked with the Courses it can fill, and a Meal Slot lists the Courses it serves, in its own order. A Course is filled only by a Recipe marked with it.
_Avoid_: Dish type, meal part
_Note_: "course" in plain English ("of course") is not this term.

**main Course**:
The one Course the Household flags as main (seeded as Main). A Whole meal planned in it covers the Meal Slot's other Courses, and a Recipe or Meal Slot that has to be given a Course gets this one (on upgrade, and for a Recipe File without Courses). It can be renamed; it cannot be removed while it has the flag, so the flag moves to another Course first.
_Avoid_: Primary course, entrée, headline course

**Whole meal**:
A Recipe that needs no other Course beside it (a one-pot Recipe, most Ready Meals). Planned in a Meal Slot's main Course, it covers that slot's other Courses that hold no Planned Meal: they stay empty on that date, and that is not Couldn't plan. A Pinned, Cooked or Not cooked Planned Meal in another Course stays and is not covered. In any other Course a Whole meal is an ordinary Recipe.
_Avoid_: One-pot meal, complete meal, full meal

**optional Course**:
A Course a Meal Slot serves only when a Leftover or a fresh Recipe fits it without breaking a Cool-down or Variety Rule (e.g. "Dinner: Main, Side, Dessert (optional)"); otherwise it is left empty on that date, and that is not Couldn't plan. Optional is set per Meal Slot, not on the Course, and every Meal Slot serves at least one Course that is not optional.
_Avoid_: Extra course, maybe course, bonus course

**Tag**:
A household-defined name carried by Recipes (e.g. "fish", "pasta", "roast") that Slot Rules and Variety Rules refer to. Each Tag has a **Tag colour**. The Household adds, renames, recolours, merges and deletes Tags in Settings > Tags; a Tag may exist with no Recipe, and it stays when its last Recipe loses it. Renaming or merging a Tag carries its Slot Rules and Variety Rule with it, and deleting it removes them ([ADR 0010](docs/adr/0010-tags-as-entities.md)).
_Avoid_: Category, label
_Note_: two names that differ only in case or spacing are one Tag ("Fish" and "fish").

**Tag colour**:
The colour of a Tag's pill, one of a closed palette of ten (Tomato, Apricot, Mustard, Olive, Sage, Teal, Sky, Blue, Plum, Rose); a new Tag gets the colour fewest Tags have. It only helps tell Tags apart: it never carries a meaning of its own, and status colours are not among them.
_Avoid_: Tag category, colour code

### Preferences

**Favourite**:
A Member's liking for a Recipe, which makes the planner more likely to choose it for a Course they eat.
_Avoid_: Star, like

**Dislike**:
A Member's soft aversion to a Recipe; the planner avoids it for a Course they eat, but it may still appear.
_Avoid_: Unfavourite

**Exclusion**:
A Member's hard ban on a Recipe or Ingredient (e.g. an allergy); the planner never chooses it for a Course they eat.
_Avoid_: Never, allergy, blacklist

### Planning

**Meal Slot**:
A named eating occasion the Household defines for a particular day of the week, with a usual time (which one date may change) and the ordered Courses it serves (e.g. "Tuesday Dinner, 19:30: Main, Side"), some of which may be optional. It serves at least one Course that is not optional.
_Avoid_: Meal time, occasion, slot type

**Matching Meal Slot**:
The Meal Slot with the same name (case and edge spaces ignored) on another weekday. A change applied to several weekdays edits the Matching Meal Slot on each; a weekday without one is skipped, and nothing is created.
_Avoid_: Sibling, linked slot, twin

**Planned Meal**:
The Recipe assigned to one Course of one Meal Slot on one date, either freshly cooked or served from a Leftover. A Meal Slot on a date has one Planned Meal per Course it serves, except the Courses a Whole meal covers, optional Courses left empty and Courses nobody eats that day; each is planned, swapped, Pinned and marked Cooked on its own.
_Avoid_: Meal, entry, booking

**Cooked**:
The state of a Planned Meal once someone has confirmed it was actually prepared; only then is Stock deducted, from the Lots the User picked (**Used from**) or else soonest to go off first.
_Avoid_: Done, eaten, completed

**Batch**:
One preparation of a Recipe, producing its Yield; a Planned Meal cooks a whole number of Batches (or an explicit fraction).
_Avoid_: Scale, run

**Leftover**:
Portions left from a Batch beyond what its Planned Meal's Course Attendance needs; these are served at later Meal Slots, in any Course the Recipe is marked with. A Leftover may be frozen in a Storage Place of kind freezer; a frozen Leftover is not planned automatically.
_Avoid_: Surplus, remains

**Use-by**:
The last date a Leftover may be served; after it the Leftover is not planned, and Feeder asks whether it was had, thrown out or not there.
_Avoid_: Expiry, best-before

**Had it**:
A User's record that portions of a Leftover were had outside the plan; the portions go down and it is not waste.
_Avoid_: Consumed

**Threw it out**:
A User's record that portions of a Leftover were thrown away: waste dated the day of the action, or, when answering the question after the Use-by, the day after the Use-by.
_Avoid_: Scrapped, dumped
_Note_: a Stock Lot's equivalent is **Throw out**.

**Freeze it**:
Moving a Leftover, or part of it, to a Storage Place of kind freezer; its Use-by becomes today plus its Frozen Use-by.
_Avoid_: Stash

**Wasn't there**:
The answer that removes a Leftover that Feeder thought was left but never was (a mistake, like Delete on a Stock Lot); it is not waste.
_Avoid_: Phantom leftover

**Take out**:
Taking a frozen Leftover out of the Freezer; it is no longer frozen and its Use-by becomes today plus the Recipe's Use-by days.

**Cool-down**:
The minimum number of days before the same Recipe may be planned again, in any Course. It is soft: when no Recipe that fits a required Course keeps it, the planner still fills the Course with the Recipe that comes round least soon, and says so with a why chip ("Again soon: had Tue"). As the Household adds Recipes, it holds again on its own.
_Avoid_: Rotation, repeat gap

**Planning Horizon**:
How many days ahead the planner keeps Meal Slots filled (default 7).
_Avoid_: Window, lookahead

**Pinned**:
A Planned Meal set or confirmed by a User, which the planner never replaces.
_Avoid_: Locked, fixed, manual
_Note_: a **Bought** Planned Meal is held the same way by automatic replans, but Regenerate replaces it; it is not Pinned.

**Ingredient Overlap**:
The planner's preference for Recipes that use up what remains of Ingredients already bought or planned that week, so that fewer distinct Ingredients are needed.
_Avoid_: Reuse, synergy

**Planner Style**:
The Household's single setting for what the planner leans towards, from using up what it already has, through variety, to Favourites.
_Avoid_: Mode, profile, weights

**Slot Rule**:
A standing rule that fixes one Course of a Meal Slot (the main Course unless another is chosen) to a particular Recipe or Tag (e.g. "Friday Dinner = pizza", "Sunday Lunch, Dessert = tiramisu").
_Avoid_: Fixed meal, theme night

**Variety Rule**:
A limit on how often Recipes with a given Tag may appear (e.g. at most twice a week, never two days running). Soft, like Cool-down: when nothing that fits a required Course keeps it, the planner breaks it as little as it can and says so ("3rd fish this week").
_Avoid_: Quota, balance rule

**Portion Factor**:
How much of a standard portion a Member eats; each Member has a default, which a Meal Slot may override. A Guest's is always 1.
_Avoid_: Appetite, multiplier, serving size

**Attendance**:
The Members who eat at a given Meal Slot, each with their Portion Factor. It starts as everyone, and people opt out; it can be changed for one date. The Members who eat each Course of the slot are that Course's **Course Attendance**.
_Avoid_: Headcount
_Note_: **Guests** are counted beside the Attendance, not in it: they add portions but no preferences. In the UI, "Who's eating" is the sheet that edits one date's Attendance, its Course Attendance and its Guests; it is a label, not a second term. "Time today" and "Time on Thu" are labels for one date's time of a **Meal Slot**.

**Course Attendance**:
The Members who eat one Course of a Meal Slot: the slot's Attendance less those who opt out of that Course (e.g. Sam opts out of Dessert), usually or for one date. It determines that Course's portions, and whose Exclusions, Dislikes and Favourites count for it. Nobody opts out unless set; a Course nobody eats on a date is left empty, and that is not Couldn't plan.
_Avoid_: skips, diners
_Note_: Guests eat every Course the slot serves; they are not part of a Course Attendance.
_Note_: "skip" and "skipped" are not used for opting out, because the code calls a Not cooked Planned Meal `skipped`.

**Not served**:
A Meal Slot on one date, or one Course of it, that the plan leaves empty on purpose: the Household marked the slot Not served, nobody eats that Course that date, or it is an optional Course that nothing fits. It is not Couldn't plan and it is not Not cooked, which is said after the date.
_Avoid_: Day off, blocked out, no meal
_Note_: "skipped" stays the code's word for a Not cooked Planned Meal; Not served is never "skipped".

**Guest**:
Someone who is not a Member and eats at one Meal Slot on one date, counted only as a number. Each Guest is one standard portion of every Course the slot serves that date, with no name and no preferences.
_Avoid_: Visitor, plus-one
_Note_: the singular is the term; the UI says "Guests" for the count.

**Bought**:
A fresh Planned Meal that a purchase from the Shopping List was bought for: a Scan or Tick by hand that covered part of its Ingredients. Automatic replans leave it as it is; Regenerate, Swap or choosing a Recipe changes it.
_Avoid_: Reserved, committed, purchased
_Note_: not **Pinned**: a Pinned Planned Meal is the User's choice and Regenerate keeps it; a Bought one is only held against automatic changes. Not the "Bought today" / "Bought on" of a Stock Lot's purchase date, which is plain copy for **Stock Lot**.

**Couldn't plan**:
The state of a required Course of a Meal Slot the planner left empty, filed under one cause (nobody attends, no Recipes, no Recipe marked with that Course, a Slot Rule that nothing meets, or every Recipe excluded or too late for an Advance Step) with one way to fix it. Something to set up or adjust, not a failure. Cool-down and Variety Rules never cause it, because they give way when too few Recipes fit. A Course covered by a Whole meal, an optional Course left empty and a Course nobody eats are not Couldn't plan.
_Avoid_: Missing meal

### Food and shopping

**Ingredient**:
A generic food item that recipes call for and the shopping list is written in (e.g. "passata"). May carry a **Picture** (see **Photo**).
_Avoid_: Item, food, product

**Product**:
A specific purchasable pack, identified by its barcode, that supplies exactly one Ingredient (e.g. "Mutti passata 700 g"). May carry a **Picture** (see **Photo**) of the pack, so it can be told from another brand at a glance.
_Avoid_: SKU, article, item, pack shot, product photo

**Archived**:
The state of a Recipe, Product or Course that was used (planned, or bought) and so cannot be deleted, but is retired: left out of lists and pickers and ignored by the planner and by Scans, while its history stays. It can be unarchived.
_Avoid_: Deleted, disabled, hidden, inactive

**Base Unit**:
The single unit (gram, millilitre or piece) in which an Ingredient's Stock and shopping quantities are counted. Always metric internally; imperial is a per-User display conversion only.
_Avoid_: Default unit, canonical unit

**Unit Conversion**:
An Ingredient-specific equivalence from another unit into its Base Unit (e.g. 1 clove garlic = 5 g).
_Avoid_: Measure, ratio

**Stock**:
The quantity of each Ingredient the Household currently has at home, a Base recipe's Ingredient included (a jar of béchamel, a frozen batch of ragù).
_Avoid_: Inventory, larder
_Note_: "Pantry" names the page that shows Stock (and the pantry kind of Storage Place); the things on it are still Stock and Stock Lots. Frozen Leftovers also appear on the Pantry page; they are not Stock.
_Note_: beta.6 (scheduled, not in the app yet; [ADR 0015](docs/adr/0015-base-recipes.md)).

**Storage Place**:
Where the Household keeps Stock and frozen Leftovers (Kitchen Pantry, Garage Fridge, Garage Freezer), of one kind: pantry, fridge or freezer. A Stock Lot is in one Storage Place, or not sorted.
_Avoid_: Storage location, shelf, compartment

**Frozen Shelf Life**:
An optional number of days an Ingredient keeps in a Storage Place of kind freezer; a Stock Lot moved into a Freezer is good for this long from that day.
_Avoid_: Freezer life, frozen expiry
_Note_: not **Frozen Use-by**, which is a Leftover's.

**Shelf Life**:
An optional number of days an Ingredient stays usable after purchase.
_Avoid_: Expiry, best-before

**Stock Lot**:
One purchase's worth of an Ingredient in Stock, with its purchase date and (if the Ingredient has a Shelf Life) its go-off date, the last day it is good; a User may correct the quantity and both dates.
_Avoid_: Batch, item, unit

**Go-off date / Good until**:
The last day a Stock Lot is fine to use. A Stock Lot goes off the day after its go-off date. Forward copy names the last good day ("Good until today", "Good until tomorrow", "Good until Thu"); once the Stock Lot has gone off, copy says so ("Went off today", "Went off yesterday", "Went off 3 days ago"). A plan chip uses the same day: "uses spinach by Thu".
_Avoid_: Expires, expiry date, "goes off Thu" for the last good day, "before Thu" for the go-off date

**Frozen Use-by**:
The number of days a Leftover keeps in a Storage Place of kind freezer, set per Recipe or by the Household's default; freezing a Leftover sets its Use-by to that many days from that day.
_Avoid_: Freezer use-by, freezer date
_Note_: not **Frozen Shelf Life**, which is how long an Ingredient's Stock Lot keeps in a Freezer.

**Used from**:
The Stock Lots a User says a Cooked Planned Meal took an Ingredient from, when not the default order.
_Avoid_: Source lots, picked lots

**Zero-waste streak**:
The number of whole days since the Household last wasted food (a Stock Lot going off, a Throw out, or a Leftover thrown out), never more than the Household's age.
_Avoid_: Clean run, no-waste counter

**Throw out / Keep**:
The two choices for a spoiled Stock Lot: Throw out removes it and records the waste; Keep pushes its go-off date out by a day and means it did not go off.
_Avoid_: Discard, bin, extend, snooze
_Note_: a Leftover's equivalent is **Threw it out**.

**Scan**:
Reading a barcode with the phone; in a Shop it ticks the Shopping List and adds a Stock Lot; at home (Stock-take) it corrects Stock.
_Avoid_: Check-off

**Stock-take**:
A scanning mode used at home to add or remove Stock without involving the Shopping List.
_Avoid_: Inventory count, audit

**Weight Barcode Rule**:
A per-Shop rule describing how to read the Product and its weight (or price) from that Shop's variable-weight barcodes.
_Avoid_: Barcode parser, PLU rule

**Price**:
What a Product cost at a given Shop on a given date, optionally recorded at Scan time.
_Avoid_: Cost

**Shopping List**:
The Ingredients and quantities still needed for uncooked Planned Meals up to a chosen date (earlier ones not yet marked Cooked included), less Stock, less lines **Not needed**, plus any manual extras.
_Avoid_: Grocery list, basket

**Not needed**:
A Shopping List line the User took off the list for its current range, because nothing needs buying; it adds no Stock and is not a purchase.
_Avoid_: Not required, crossed off

**Shop**:
A store the Household buys from; Products learn which Shops sell them, and prices are recorded per Shop. Any User adds one; only the Admin renames or deletes one.
_Avoid_: Store, supermarket, retailer
_Note_: the phone bottom-bar label "Shop" names the shopping screen (Shopping List plus scanning), not this term.

**Shop Location**:
Where a Shop is (latitude and longitude), saved by a User standing in it; the phone uses it to pick the nearest Shop.
_Avoid_: Geofence

**Shop Barcode**:
A barcode that identifies a Product only within one Shop (e.g. own-label or weighed goods).
_Avoid_: Local code, in-store code
