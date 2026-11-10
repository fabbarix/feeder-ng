// R8: "Unarchive <Product>?" offered when an Archived Product owns the scanned barcode. WP7 stub: the Developer builds it
// on BottomSheet (title, body text, primary "Unarchive <name>", secondary "Create a new Product instead").

export interface UnarchiveProductSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  /** the unarchive is under way: the primary Button shows its spinner and both are disabled */
  busy?: boolean
  onUnarchive: () => void
  onCreateNew: () => void
}

export function UnarchiveProductSheet(props: UnarchiveProductSheetProps) {
  void props
  return null
}
