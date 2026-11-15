// Route /scan/receipt/review: the review with its Add… seam wired to the new-Product sheet without a barcode (design 3.4). The sheet
// hands back its values, mapped to the Add's draft (lib/addDraft); nothing is sent until the review's Apply. B9-50 (SSP-08): the sheet
// shows the receipt line and its name matches, and "Use <Product>" is a draft of that Product.
import { NewProductSheet } from '../../scan/components/NewProductSheet'
import { useAddSheetData } from '../hooks/useAddSheetData'
import { useMoney } from '../hooks/useMoney'
import { useReceiptSession } from '../hooks/useReceiptSession'
import { draftFromProduct, draftFromValues, initialFromAdd } from '../lib/addDraft'
import { addSheetContext } from '../lib/addSheetContext'
import { ReceiptReviewScreen, type AddSheetRenderProps } from './ReceiptReviewScreen'

export function ReceiptReviewRoute() {
  const session = useReceiptSession()
  const data = useAddSheetData(session?.shopId ?? null)
  const money = useMoney()
  const renderAdd = ({ proposal, draft, onSave, onClose }: AddSheetRenderProps) => {
    const context = addSheetContext(proposal, { products: data.products, lines: data.lines ?? [] }, money)
    return (
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
        receiptLine={context.receiptLine}
        matches={context.matches}
        onUseProduct={(productId) => onSave(draftFromProduct(productId))}
      />
    )
  }
  return <ReceiptReviewScreen renderAdd={renderAdd} products={data.products} />
}
