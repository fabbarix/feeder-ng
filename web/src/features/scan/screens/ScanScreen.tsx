// The Scan screen (centre button, route /scan). First "Where are you shopping?" (ShopPicker over useShops(), the
// last Shop used first); then the session for that choice: the camera strip, the live list (Shop mode), the scan
// line, notices and the sheets. The session view is its own component, so the camera and the offline data start only
// once a Shop or Stock-take is chosen.
import { useState } from 'react'
import { useShops } from '../../shops/hooks/useShops'
import { ViewfinderStrip } from '../../../ui/ViewfinderStrip'
import { Button } from '../../../ui/Button'
import { formatMinor } from '../../products/lib/money'
import { formatQuantity } from '../../../lib/units'
import { AskWeightSheet } from '../components/AskWeightSheet'
import { CameraFailure } from '../components/CameraFailure'
import { LiveList } from '../components/LiveList'
import { PriceEditSheet } from '../components/PriceEditSheet'
import { ScanFeedback } from '../components/ScanFeedback'
import { ScanNotices } from '../components/ScanNotices'
import { ShopPicker } from '../components/ShopPicker'
import { StockTakeSheet } from '../components/StockTakeSheet'
import { UnknownBarcodeSheet } from '../components/UnknownBarcodeSheet'
import { useScanController, type ScanController } from '../hooks/useScanController'
import { useScanSession } from '../hooks/useScanSessionActive'
import { getLastShopId, setLastShopId } from '../lib/lastShop'
import { scanStrings } from '../strings'

type Choice = { kind: 'shop'; shop: { id: number; name: string } } | { kind: 'stocktake' }

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function cameraText(status: ScanController['camera']['status']): string | undefined {
  switch (status) {
    case 'starting':
      return scanStrings.cameraStarting
    case 'denied':
      return scanStrings.cameraDenied
    case 'unsupported':
      return scanStrings.cameraUnsupported
    case 'error':
      return scanStrings.cameraError
    default:
      return undefined
  }
}

export function ScanScreen() {
  const { shops } = useShops()
  const [lastShopId] = useState(() => getLastShopId(localStorageOrNull()))
  const [choice, setChoice] = useState<Choice | null>(null)

  if (!choice) {
    return (
      <ShopPicker
        shops={shops}
        lastShopId={lastShopId}
        onPick={(shop) => {
          setLastShopId(localStorageOrNull(), shop.id)
          setChoice({ kind: 'shop', shop: { id: shop.id, name: shop.name } })
        }}
        onStockTake={() => setChoice({ kind: 'stocktake' })}
      />
    )
  }
  return choice.kind === 'shop' ? (
    <ScanSession mode="shop" shop={choice.shop} onChangeShop={() => setChoice(null)} />
  ) : (
    <ScanSession mode="stocktake" shop={null} onChangeShop={() => setChoice(null)} />
  )
}

interface ScanSessionProps {
  mode: 'shop' | 'stocktake'
  shop: { id: number; name: string } | null
  onChangeShop: () => void
}

function ScanSession({ mode, shop, onChangeShop }: ScanSessionProps) {
  useScanSession(mode === 'shop')
  const c = useScanController({ mode, shop })
  const flow = c.flow
  const fb = flow.feedback
  const sheet = flow.sheet
  const shopName = shop?.name ?? ''
  const product = sheet?.kind === 'stock_take' ? sheet.product : null
  // A camera failure is explained by CameraFailure below; the strip only carries the starting text.
  const viewfinderStatus = c.recovery.failure ? undefined : cameraText(c.camera.status)

  return (
    <section className="scan-screen">
      <ViewfinderStrip
        status={viewfinderStatus}
        torch={{ supported: c.camera.torchSupported, on: c.camera.torchOn, onToggle: c.camera.toggleTorch }}
        mute={{ muted: c.muted, onToggle: c.toggleMute }}
      >
        <video ref={c.camera.videoRef} playsInline muted autoPlay />
      </ViewfinderStrip>
      <CameraFailure recovery={c.recovery} />

      {mode === 'shop' ? (
        <div className="scan-screen__shop">
          <Button variant="ghost" onClick={onChangeShop}>
            {scanStrings.changeShop}
          </Button>
        </div>
      ) : null}

      {fb ? (
        <ScanFeedback
          text={fb.text}
          queued={fb.queued}
          canEditPrice={fb.canEditPrice}
          onEditPrice={flow.openEditPrice}
          onUndo={() => void flow.undo()}
          onDismiss={flow.dismissFeedback}
        />
      ) : null}
      {flow.banner ? <p className="scan-screen__banner" data-tone={flow.banner.tone}>{flow.banner.text}</p> : null}

      <ScanNotices online={c.online} pendingCount={c.pendingCount} rejectedCount={c.rejectedCount} onDismissRejected={c.dismissRejected} notices={c.notices} onDismiss={c.dismissNotice} />

      {c.list ? <LiveList list={c.list} system={c.system} /> : null}

      {sheet?.kind === 'unknown' ? (
        <UnknownBarcodeSheet
          open
          onClose={flow.closeSheet}
          mode={sheet.mode}
          shopName={shopName}
          ingredients={c.ingredients}
          priceText={sheet.mode === 'weighed_price' && sheet.target.mode === 'weighed_price' ? formatMinor(sheet.target.priceCents, c.currency) : undefined}
          onSave={(values) => void flow.saveUnknown(values)}
        />
      ) : null}
      {sheet?.kind === 'ask_weight' ? (
        <AskWeightSheet
          open
          onClose={flow.closeSheet}
          productName={sheet.plan.product.name}
          priceText={formatMinor(sheet.plan.priceCents, c.currency)}
          onSubmit={(grams) => void flow.submitWeight(grams)}
        />
      ) : null}
      {product ? (
        <StockTakeSheet
          open
          onClose={flow.closeSheet}
          productName={product.name}
          ingredientName={product.ingredientName}
          currentStockText={formatQuantity(c.stockTotal?.(product.ingredientId) ?? 0, product.baseUnit, c.system)}
          packText={formatQuantity(product.packSize, product.baseUnit, c.system)}
          onAction={(action, total) => void flow.stockTakeAction(action, total)}
        />
      ) : null}
      {sheet?.kind === 'edit_price' ? (
        <PriceEditSheet
          open
          onClose={flow.closeSheet}
          productName={fb?.productName ?? ''}
          priceCents={fb?.priceCents ?? null}
          currency={c.currency}
          onSave={(cents) => void flow.editPrice(cents)}
        />
      ) : null}
    </section>
  )
}
