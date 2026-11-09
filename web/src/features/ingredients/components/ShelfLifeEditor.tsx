export interface ShelfLifeEditorProps {
  days: number | null
  onSave: (days: number | null) => void
}

/** Shows strings.shelfLife(days) or strings.noShelfLife; a "Shelf Life (days)" input, "Save Shelf Life", and "Clear Shelf Life" (only while set). Invalid text shows the error (role alert) and does not save. */
export function ShelfLifeEditor(props: ShelfLifeEditorProps) {
  void props
  return null
}
