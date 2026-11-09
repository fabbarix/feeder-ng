# Stock is kept as lots and deducted only when a meal is marked Cooked

Stock is kept as Stock Lots (purchase date, plus a go-off date if the Ingredient has a Shelf Life), so the planner can push to use perishables before they spoil (Ingredient Overlap). Lots are added by Scan or Stock-take. They are deducted only when a User marks a Planned Meal as Cooked, taking from the lot that goes off soonest and otherwise the oldest. Merely planning a meal, or a slot passing, never changes Stock.

**Considered Options**
- No stock tracking (the list comes from the plan only): simpler, but it can't support Ingredient Overlap or a list that subtracts what's already at home.
- Automatic deduction at slot time: less effort, but Stock drifts silently whenever plans change (takeaway night, swapped meals).
- A single quantity per Ingredient: can't tell which chicken is about to go off.
