// Route /scan/receipt/review: the review with its Add… seam wired to the new-Product sheet without a barcode (design 3.4). The sheet
// hands back its values, mapped to the Add's draft (lib/addDraft); nothing is sent until the review's Apply.
import { NewProductSheet } from '../../scan/components/NewProductSheet'
import { useAddSheetData } from '../hooks/useAddSheetData'
import { useReceiptSession } from '../hooks/useReceiptSession'
import { draftFromValues, initialFromAdd } from '../lib/addDraft'
import { ReceiptReviewScreen, type AddSheetRenderProps } from './ReceiptReviewScreen'

export function ReceiptReviewRoute() {
  const session = useReceiptSession()
  const data = useAddSheetData(session?.shopId ?? null)
  const renderAdd = ({ proposal, draft, onSave, onClose }: AddSheetRenderProps) => (
    <NewProductSheet
      open
      noBarcode
      mode="pack"
      onClose={onClose}
      shopName={data.shopName}
      ingredients={data.ingredients}
      lines={data.lines}
      products={data.products}
      findSimilar={data.findSimilar}
      initial={initialFromAdd(proposal, draft, data.ingredients)}
      onSave={(values) => onSave(draftFromValues(values))}
    />
  )
  return <ReceiptReviewScreen renderAdd={renderAdd} />
}
