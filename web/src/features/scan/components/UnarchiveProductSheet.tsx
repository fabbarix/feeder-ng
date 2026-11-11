// R8: "Unarchive <Product>?" offered when an Archived Product owns the scanned barcode.
import { BottomSheet } from '../../../ui/BottomSheet'
import { Button } from '../../../ui/Button'
import { FormActions } from '../../../ui/FormActions'
import { scanStrings } from '../strings'

export interface UnarchiveProductSheetProps {
  open: boolean
  onClose: () => void
  productName: string
  /** the unarchive is under way: the primary Button shows its spinner and both are disabled */
  busy?: boolean
  onUnarchive: () => void
  onCreateNew: () => void
}

/** The R8 offer: "Unarchive <name>" (primary) or "Create a new Product instead" (secondary). */
export function UnarchiveProductSheet({ open, onClose, productName, busy = false, onUnarchive, onCreateNew }: UnarchiveProductSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={scanStrings.archivedTitle(productName)}>
      <p>{scanStrings.archivedBody}</p>
      <FormActions
        primary={
          <Button loading={busy} onClick={onUnarchive}>
            {scanStrings.unarchiveAction(productName)}
          </Button>
        }
        secondary={
          <Button variant="secondary" disabled={busy} onClick={onCreateNew}>
            {scanStrings.createNewInstead}
          </Button>
        }
      />
    </BottomSheet>
  )
}
