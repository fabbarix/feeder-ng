# Feeder

Meal planning for a single family: recipes, an automatically generated meal plan, leftovers, and a shopping list ticked off by scanning products in-store.

## Language

### People

**Household**:
The single family that one deployment serves; owns all recipes, plans and shops.
_Avoid_: Family, tenant, account

**Member**:
A person who eats from the plan and counts towards portions; need not have a login. May carry an email, so that person can sign in as a User.
_Avoid_: Eater, person, diner

**User**:
Someone who signs in with Google to use the app, because an Admin added their email, a Member carries it, or a User approved their Access Request; may be linked to a Member.
_Avoid_: Account, login, member

**Admin**:
A User who also manages who may sign in, the Members, Meal Slots, Shops and household settings.
_Avoid_: Owner, superuser

**Access Request**:
A verified Google account's request to sign in, waiting for any User to approve or deny it; it expires after 14 days.
_Avoid_: Invite, join request, signup, application

### Recipes

**Recipe**:
A dish the Household can plan, made from Ingredients, with a Yield and optional timed Steps.
_Avoid_: Dish, meal

**Yield**:
The number of standard portions one Batch of a Recipe produces.
_Avoid_: Servings, makes

**Ready Meal**:
A Recipe made from exactly one Ingredient (a bought pack), whose Yield is the portions in that pack.
_Avoid_: Convenience food, pre-made

**Step**:
One instruction in a Recipe, optionally timed, illustrated and referring to the Ingredients it uses.
_Avoid_: Instruction, direction

**Passive Step**:
A timed Step that needs no attention while it runs (e.g. simmering), so the cook can carry on with later Steps.
_Avoid_: Background step, wait

**Advance Step**:
A Step to be done a set lead time before the Planned Meal's slot time (e.g. defrost 24 h before, marinate 4 h before).
_Avoid_: Prep step, pre-step

**Cook Mode**:
The hands-free, step-by-step view used while cooking, which runs the Step timers.
_Avoid_: Kitchen mode, guided mode

**Reheat**:
Warming a Leftover for the Planned Meal it is served at, with a short timer before the meal is marked Cooked; a Leftover has no Steps, so it uses its own screen rather than Cook Mode. The timer starts at the Recipe's Reheat time when it has one.
_Avoid_: Microwave, warm up

**Reheat time**:
The optional number of minutes (1 to 30) a Recipe says its Leftover takes to reheat; Reheat starts its timer there. Without one, Reheat works the time out from the portions.
_Avoid_: Warm-up time, microwave time

**Recipe File**:
A JSON document in the published exchange format holding one or more Recipes and the Ingredient definitions they use, with images embedded or linked.
_Avoid_: Export, bundle, backup

**Import Review**:
The screen where a Recipe File's Ingredients and units are matched to existing ones (or created) before the Recipes are saved.
_Avoid_: Import wizard, mapping

**Agent Prompt**:
The copyable instructions, including the exchange schema, that make an AI agent turn an arbitrary recipe into a valid Recipe File.
_Avoid_: Parser prompt, AI import

**Tag**:
A household-defined label on Recipes (e.g. "fish", "pasta", "roast") that Slot Rules and Variety Rules refer to.
_Avoid_: Category, label

### Preferences

**Favourite**:
A Member's liking for a Recipe, which makes the planner more likely to choose it when they attend.
_Avoid_: Star, like

**Dislike**:
A Member's soft aversion to a Recipe; the planner avoids it when they attend, but it may still appear.
_Avoid_: Unfavourite

**Exclusion**:
A Member's hard ban on a Recipe or Ingredient (e.g. an allergy); the planner never chooses it when they attend.
_Avoid_: Never, allergy, blacklist

### Planning

**Meal Slot**:
A named eating occasion the Household defines for a particular day of the week, with a usual time (e.g. "Tuesday Dinner, 19:30").
_Avoid_: Meal time, occasion, slot type

**Planned Meal**:
The Recipe assigned to one Meal Slot on one date, either freshly cooked or served from a Leftover.
_Avoid_: Meal, entry, booking

**Cooked**:
The state of a Planned Meal once someone has confirmed it was actually prepared; only then is Stock deducted.
_Avoid_: Done, eaten, completed

**Batch**:
One preparation of a Recipe, producing its Yield; a Planned Meal cooks a whole number of Batches (or an explicit fraction).
_Avoid_: Scale, run

**Leftover**:
Portions left from a Batch beyond what its Planned Meal's Attendance needs; these are served at later Meal Slots.
_Avoid_: Surplus, remains

**Use-by**:
The last date a Leftover may be served; after it the Leftover is discarded and never planned.
_Avoid_: Expiry, best-before

**Cool-down**:
The minimum number of days before the same Recipe may be planned again.
_Avoid_: Rotation, repeat gap

**Planning Horizon**:
How many days ahead the planner keeps Meal Slots filled (default 7).
_Avoid_: Window, lookahead

**Pinned**:
A Planned Meal set or confirmed by a User, which the planner never replaces.
_Avoid_: Locked, fixed, manual

**Ingredient Overlap**:
The planner's preference for Recipes that use up what remains of Ingredients already bought or planned that week, so that fewer distinct Ingredients are needed.
_Avoid_: Reuse, synergy

**Planner Style**:
The Household's single setting for what the planner leans towards, from using up what it already has, through variety, to Favourites.
_Avoid_: Mode, profile, weights

**Slot Rule**:
A standing rule that fixes a Meal Slot to a particular Recipe or Tag (e.g. "Friday Dinner = pizza").
_Avoid_: Fixed meal, theme night

**Variety Rule**:
A limit on how often Recipes with a given Tag may appear (e.g. at most twice a week, never two days running).
_Avoid_: Quota, balance rule

**Portion Factor**:
How much of a standard portion a Member eats; each Member has a default, which a Meal Slot may override.
_Avoid_: Appetite, multiplier, serving size

**Attendance**:
The Members who eat at a given Meal Slot, each with their Portion Factor; it determines the portions that slot needs.
_Avoid_: Guests, headcount

### Food and shopping

**Ingredient**:
A generic food item that recipes call for and the shopping list is written in (e.g. "passata").
_Avoid_: Item, food, product

**Product**:
A specific purchasable pack, identified by its barcode, that supplies exactly one Ingredient (e.g. "Mutti passata 700 g").
_Avoid_: SKU, article, item

**Archived**:
The state of a Recipe or Product that was used (planned, or bought) and so cannot be deleted, but is retired: left out of lists and pickers and ignored by the planner and by Scans, while its history stays. It can be unarchived.
_Avoid_: Deleted, disabled, hidden, inactive

**Base Unit**:
The single unit (gram, millilitre or piece) in which an Ingredient's Stock and shopping quantities are counted. Always metric internally; imperial is a per-User display conversion only.
_Avoid_: Default unit, canonical unit

**Unit Conversion**:
An Ingredient-specific equivalence from another unit into its Base Unit (e.g. 1 clove garlic = 5 g).
_Avoid_: Measure, ratio

**Stock**:
The quantity of each Ingredient the Household currently has at home.
_Avoid_: Inventory, pantry, larder

**Shelf Life**:
An optional number of days an Ingredient stays usable after purchase.
_Avoid_: Expiry, best-before

**Stock Lot**:
One purchase's worth of an Ingredient in Stock, with its purchase date and (if the Ingredient has a Shelf Life) the date it goes off.
_Avoid_: Batch, item, unit

**Zero-waste streak**:
The number of whole days since the Household last wasted food (a Stock Lot going off, a Throw out, or a discarded Leftover), never more than the Household's age.
_Avoid_: Clean run, no-waste counter

**Throw out / Keep**:
The two choices for a spoiled Stock Lot: Throw out removes it and records the waste; Keep pushes its go-off date out by a day and means it did not go off.
_Avoid_: Discard, bin, extend, snooze

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
The Ingredients and quantities still needed for uncooked Planned Meals up to a chosen date, less Stock, plus any manual extras.
_Avoid_: Grocery list, basket

**Shop**:
A store the Household buys from; Products learn which Shops sell them, and prices are recorded per Shop.
_Avoid_: Store, supermarket, retailer
_Note_: the phone bottom-bar label "Shop" names the shopping screen (Shopping List plus scanning), not this term.

**Shop Barcode**:
A barcode that identifies a Product only within one Shop (e.g. own-label or weighed goods).
_Avoid_: Local code, in-store code
