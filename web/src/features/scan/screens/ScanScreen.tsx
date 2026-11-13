// The Scan screen (centre button, route /scan). The session starts at once with the last Shop used (lib/initialChoice),
// or with Stock-take when the URL asks for it (?mode=stocktake, linked from the Stock-take button); otherwise the picker
// "Where are you shopping?" (ShopPicker over useShops(), the last Shop used first). A Shop session is the Split layout
// (shop-scan-proposals.md 13.2): the camera strip, and beside it the Scanned list or the To get Lines, the total and the
// sheets. Stock-take is the camera and its sheet only. The session view is its own component, so the camera and the
// offline data start only once a Shop or Stock-take is chosen.
// Shop Location: useNearestShop finds the Shop the User is in (at once only where that shows no prompt); the picker
// lists it first, and a session started with another Shop offers to switch. Any User adds a Shop (AddShopSheet).
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ingredientsApi } from '../../ingredients/api'
import { useShops } from '../../shops/hooks/useShops'
import { useNearestShop } from '../../shops/hooks/useNearestShop'
import { AddShopSheet } from '../../shops/components/AddShopSheet'
import { formatDistance } from '../../shops/lib/nearest'
import { lineEntry } from '../../shop/lib/lines'
import { ViewfinderStrip } from '../../../ui/ViewfinderStrip'
import { Button } from '../../../ui/Button'
import { ConfirmDialog } from '../../../ui/ConfirmDialog'
import { IconButton } from '../../../ui/IconButton'
import { Icon } from '../../../ui/Icon'
import { PageHeader } from '../../../ui/PageHeader'
import { Segmented } from '../../../ui/fields/Segmented'
import { Skeleton } from '../../../ui/Skeleton'
import { formatMinor } from '../../products/lib/money'
import { formatQuantity } from '../../../lib/units'
import { AskWeightSheet } from '../components/AskWeightSheet'
import { CameraFailure } from '../components/CameraFailure'
import { PriceEntrySheet } from '../components/PriceEntrySheet'
import { ScanNotices } from '../components/ScanNotices'
import { ScannedList } from '../components/ScannedList'
import { ShopPicker } from '../components/ShopPicker'
import { StockTakeSheet } from '../components/StockTakeSheet'
import { ToGetList } from '../components/ToGetList'
import { UnarchiveProductSheet } from '../components/UnarchiveProductSheet'
import { UnknownBarcodeSheet } from '../components/UnknownBarcodeSheet'
import { useJustScanned } from '../hooks/useJustScanned'
import { useListView } from '../hooks/useListView'
import { useScanController, type ScanController } from '../hooks/useScanController'
import { useScanSession } from '../hooks/useScanSessionActive'
import { useScrollAboveSheet } from '../hooks/useScrollAboveSheet'
import { initialChoice, type ScanChoice } from '../lib/initialChoice'
import { getLastShopId, setLastShopId } from '../lib/lastShop'
import type { ListView } from '../lib/listView'
import { priceContext } from '../lib/priceContext'
import type { PriceEntry, PriceIntent } from '../lib/priceEntry'
import type { ScannedRow } from '../lib/scannedList'
import { scanStrings } from '../strings'
import '../scan.css'

type Choice = ScanChoice

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
  const { shops, isLoading } = useShops()
  const [lastShopId] = useState(() => getLastShopId(localStorageOrNull()))
  const [params] = useSearchParams()
  const stockTakeLink = params.get('mode') === 'stocktake'
  // undefined: not chosen yet (the starting choice applies); null: the picker is shown; otherwise the chosen session.
  const [picked, setPicked] = useState<Choice | null | undefined>(undefined)
  const near = useNearestShop(shops)
  const [adding, setAdding] = useState(false)

  // While the Shops load neither the picker (it would flash) nor a session is shown.
  if (isLoading) {
    return (
      <section className="scan-screen">
        <Skeleton variant="tile" count={2} />
      </section>
    )
  }

  const choice = picked !== undefined ? picked : stockTakeLink ? { kind: 'stocktake' as const } : initialChoice(shops, lastShopId)
  const backToPicker = () => setPicked(null)
  const pickShop = (shop: { id: number; name: string }) => {
    setLastShopId(localStorageOrNull(), shop.id)
    setPicked({ kind: 'shop', shop: { id: shop.id, name: shop.name } })
  }
  const nearest = near.nearest ? { id: near.nearest.shop.id, name: near.nearest.shop.name, distance: formatDistance(near.nearest.metres) } : null
  if (!choice) {
    return (
      <>
        <ShopPicker
          shops={shops}
          lastShopId={lastShopId}
          onPick={pickShop}
          onStockTake={() => setPicked({ kind: 'stocktake' })}
          nearby={{ nearest, status: near.status, failure: near.failure, anyLocated: near.anyLocated, onFind: near.locate }}
          onAddShop={() => setAdding(true)}
        />
        <AddShopSheet
          open={adding}
          onClose={() => setAdding(false)}
          onAdded={(shop) => {
            setAdding(false)
            pickShop(shop)
          }}
        />
      </>
    )
  }
  // Started by itself with the last Shop, but the phone is at another saved Shop: offer to switch.
  const elsewhere = picked === undefined && choice.kind === 'shop' && nearest && nearest.id !== choice.shop.id ? nearest : null
  return choice.kind === 'shop' ? (
    <ScanSession key={choice.shop.id} mode="shop" shop={choice.shop} onChangeShop={backToPicker} elsewhere={elsewhere ? { ...elsewhere, onSwitch: () => pickShop(elsewhere) } : null} />
  ) : (
    <ScanSession mode="stocktake" shop={null} onChangeShop={backToPicker} />
  )
}

/** "You seem to be at Coop (40 m)." with a button to switch the session to it. */
function ElsewhereNotice({ name, distance, onSwitch }: { name: string; distance: string; onSwitch: () => void }) {
  return (
    <div className="scan-elsewhere" role="status">
      <Icon name="location" size={20} />
      <span>{scanStrings.nearOther(name, distance)}</span>
      <Button variant="secondary" size="sm" onClick={onSwitch}>
        {scanStrings.switchTo(name)}
      </Button>
    </div>
  )
}

interface ScanSessionProps {
  mode: 'shop' | 'stocktake'
  shop: { id: number; name: string } | null
  onChangeShop: () => void
  /** the saved Shop the phone is at, when it is not this one */
  elsewhere?: { name: string; distance: string; onSwitch: () => void } | null
}

/** The Price entry's failure, kept with the row it belongs to, so it never shows on another row. */
interface PriceFailure {
  key: string
  message: string
}

function ScanSession({ mode, shop, onChangeShop, elsewhere }: ScanSessionProps) {
  useScanSession(mode === 'shop')
  const c = useScanController({ mode, shop })
  const navigate = useNavigate()
  const flow = c.flow
  const sheet = flow.sheet
  const isShop = mode === 'shop'
  const shopName = shop?.name ?? ''
  const product = sheet?.kind === 'stock_take' ? sheet.product : null
  // A camera failure is explained by CameraFailure below; the strip only carries the starting text.
  const viewfinderStatus = c.recovery.failure ? undefined : cameraText(c.camera.status)
  const scanned = c.scanned
  // Until the stored session is in, its scans coming back are not new scans (no switch to Scanned, no wash).
  const scanCount = scanned.loaded ? scanned.entries.length : null
  const { view, choose } = useListView(scanCount)
  const justScanned = useJustScanned(scanCount, scanned.rows[0]?.key ?? null)
  const [priceFailure, setPriceFailure] = useState<PriceFailure | null>(null)

  const pricingKey = flow.pricing?.key ?? null
  const pricingRow = pricingKey === null ? undefined : scanned.rows.find((r) => r.key === pricingKey)
  useScrollAboveSheet(pricingRow ? pricingKey : null)
  const productOf = (row: ScannedRow) => (row.productId === null ? undefined : c.product?.(row.productId))

  /** Save, Next or Close of the Price entry: a refusal or a failed save keeps the sheet open with its message. */
  const savePrice = (row: ScannedRow, entry: PriceEntry, intent: PriceIntent) => {
    void flow.savePrice(row.key, entry, intent).then((outcome) => {
      setPriceFailure(outcome.status === 'refused' || outcome.status === 'failed' ? { key: row.key, message: outcome.error } : null)
    })
  }

  // Change Shop ends the session first (its Scanned list starts empty next time); Stock-take keeps no session.
  const changeShop = () => {
    if (isShop) c.endSession()
    onChangeShop()
  }

  const cameraColumn = (
    <div className="scan-screen__camera">
      <ViewfinderStrip
        size="tall"
        status={viewfinderStatus}
        camera={flow.paused ? 'paused' : 'on'}
        torch={{ supported: c.camera.torchSupported, on: c.camera.torchOn, onToggle: c.camera.toggleTorch }}
        mute={{ muted: c.muted, onToggle: c.toggleMute }}
      >
        <video ref={c.camera.videoRef} playsInline muted autoPlay />
      </ViewfinderStrip>
      <CameraFailure recovery={c.recovery} />
      {flow.banner ? <p className="scan-screen__banner" data-tone={flow.banner.tone}>{flow.banner.text}</p> : null}
      <ScanNotices online={c.online} pendingCount={c.pendingCount} rejectedCount={c.rejectedCount} onDismissRejected={c.dismissRejected} notices={c.notices} onDismiss={c.dismissNotice} />
      {/* The Price entry is a non-modal sheet: fixed at the bottom on a phone, docked here, under the camera, from 768 px. */}
      {isShop && pricingRow ? (
        <PriceEntrySheet
          row={pricingRow}
          shopName={shopName}
          currency={c.currency}
          {...priceContext(productOf(pricingRow))}
          weighed={pricingRow.weighed ? (pricingRow.weight ?? undefined) : undefined}
          initialPerKgCents={pricingRow.perKgCents}
          hasNext={scanned.nextUnpriced(pricingRow.key) !== null}
          error={priceFailure?.key === pricingRow.key ? priceFailure.message : null}
          onNext={(entry) => savePrice(pricingRow, entry, 'next')}
          onSave={(entry) => savePrice(pricingRow, entry, 'save')}
          onClose={(entry) => savePrice(pricingRow, entry, 'close')}
        />
      ) : null}
    </div>
  )

  const listColumn = (
    <div className="scan-screen__list">
      <div className="scan-screen__summary">
        <Segmented<ListView>
          label={scanStrings.viewLabel}
          labelHidden
          compact
          value={view}
          onChange={choose}
          options={[
            { value: 'scanned', label: scanStrings.scannedTab(scanned.rows.length) },
            { value: 'to-get', label: scanStrings.toGetTab(scanned.toGetCount) },
          ]}
        />
        <div className="scan-screen__total">
          <strong className="scan-screen__amount">{formatMinor(scanned.totals.spentCents, c.currency)}</strong>
          {scanned.totals.unpricedCount > 0 ? (
            <Button variant="tertiary" size="sm" onClick={() => flow.startPriceEntry()}>
              {scanStrings.withoutPrice(scanned.totals.unpricedCount)}
            </Button>
          ) : null}
        </div>
      </div>
      {view === 'scanned' ? (
        <ScannedList
          rows={scanned.rows}
          currency={c.currency}
          system={c.system}
          pricingKey={pricingKey}
          justScanned={justScanned}
          onPrice={(key) => flow.startPriceEntry(key)}
          onIncrement={(key) => void flow.increment(key)}
          onDecrement={(key) => void flow.decrement(key)}
          onRemove={(key) => void flow.removeRow(key)}
        />
      ) : (
        <ToGetList entries={scanned.toGet.map((line) => lineEntry(line, c.currency, c.system))} onOpen={() => navigate('/shop')} />
      )}
    </div>
  )

  return (
    <section className="scan-screen" data-pricing={pricingRow ? 'true' : undefined}>
      {shop ? (
        <PageHeader title={shop.name} actions={<Button variant="tertiary" onClick={changeShop}>{scanStrings.changeShop}</Button>} />
      ) : (
        <PageHeader
          title={scanStrings.stockTakeHeading}
          subtitle={scanStrings.stockTakeHint}
          leading={<IconButton icon="back" label={scanStrings.back} onClick={changeShop} />}
        />
      )}
      {elsewhere ? (
        <ElsewhereNotice
          {...elsewhere}
          onSwitch={() => {
            if (isShop) c.endSession()
            elsewhere.onSwitch()
          }}
        />
      ) : null}

      {isShop ? (
        <div className="scan-screen__split">
          {cameraColumn}
          {listColumn}
        </div>
      ) : (
        cameraColumn
      )}

      {sheet?.kind === 'confirm_remove' ? (
        <ConfirmDialog
          open
          title={scanStrings.removeTitle(sheet.count, sheet.name)}
          body={scanStrings.removeBody}
          confirmLabel={scanStrings.removeAction}
          cancelLabel={scanStrings.keepThem}
          tone="danger"
          onConfirm={() => void flow.confirmRemove()}
          onCancel={flow.closeSheet}
        />
      ) : null}
      {sheet?.kind === 'unknown' ? (
        <UnknownBarcodeSheet
          open
          onClose={flow.closeSheet}
          mode={sheet.mode}
          shopName={shopName}
          ingredients={c.ingredients}
          canUpload={c.online}
          findSimilar={c.online ? (name) => ingredientsApi.search(name) : undefined}
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
      {sheet?.kind === 'unarchive' ? (
        <UnarchiveProductSheet
          open
          onClose={flow.closeSheet}
          productName={sheet.product.name}
          busy={flow.unarchiving}
          onUnarchive={() => void flow.unarchiveProduct()}
          onCreateNew={flow.createNewInstead}
        />
      ) : null}
    </section>
  )
}
