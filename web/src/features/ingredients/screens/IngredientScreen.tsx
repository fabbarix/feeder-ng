/**
 * Route /ingredients/:id. Heading = name; "Rename" (inline Name field + "Save name"); the Base Unit as a chip with
 * a "Change Base Unit" chip group disabled with strings.baseUnitLocked(n) while referenced; ShelfLifeEditor;
 * ConversionEditor; "Merge into another Ingredient" (MergeSheet, on success navigates to the survivor);
 * "Delete Ingredient" (disabled with strings.deleteLocked(n) while referenced; otherwise asks strings.deleteConfirm
 * in a sheet, then deletes and navigates to /ingredients). Unknown id shows an EmptyState with a link back.
 */
export function IngredientScreen() {
  return null
}
