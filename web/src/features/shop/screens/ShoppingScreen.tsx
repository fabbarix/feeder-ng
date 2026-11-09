/**
 * The Shop screen (bottom bar "Shop", route /shop): a BentoGrid of a ProgressTile ("Items ticked", done of total), a
 * CostTile, the RangePicker, the open ItemTiles (Lines then extras) and a collapsible "Done (n)" group of ticked ones,
 * an "Add an extra" button (ExtraSheet) and, when the list is complete, the CelebrationTile. Data and callbacks come
 * from hooks: useShoppingList({ shopId: last Shop used, to }) and useShoppingActions; no fetching or maths here.
 *   - Tick on a Line or an Ingredient extra opens the TickSheet (prefilled with the item's quantity) and then calls
 *     actions.tick({ingredientId, to: list.to, quantity, shopId}) / actions.tickExtra(id, quantity, shopId).
 *     Tick on a free-text extra calls actions.tickExtra(id, 0) at once. Untick calls actions.untick(ingredientId, list.to)
 *     / actions.untickExtra(id).
 *   - Choosing a range chip sets `to` (the screen state) and the list refetches.
 *   - An empty list shows EmptyState "Nothing to buy"; `stale` shows "Showing the last list you loaded"; a load error
 *     shows its message.
 * Stub until implemented.
 */
export function ShoppingScreen() {
  return null
}
