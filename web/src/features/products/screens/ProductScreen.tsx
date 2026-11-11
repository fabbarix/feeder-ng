import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, Chip, EmptyState, FormActions, PageHeader, TextField, Tile } from '../../../ui'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { displayName } from '../../ingredients/lib/names'
import { PriceEditor } from '../components/PriceEditor'
import { PriceList } from '../components/PriceList'
import { ProductBarcodes } from '../components/ProductBarcodes'
import { ProductShops } from '../components/ProductShops'
import { useAttempt } from '../hooks/useAttempt'
import { useCurrency } from '../hooks/useCurrency'
import { useProduct } from '../hooks/useProduct'
import { useProductActions } from '../hooks/useProductActions'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { productActions } from '../lib/archive'
import { formatPackSize } from '../lib/names'
import { todayIso } from '../lib/priceForm'
import { parsePackSize } from '../lib/productForm'
import { strings } from '../strings'
import '../products.css'

/**
 * /products/:id: a PageHeader, then a BentoGrid of Tiles: pack size (editable), barcodes and Shop Barcodes, Shops,
 * Prices (PriceList + PriceEditor in a BottomSheet) and the actions (Archive or Unarchive, Delete).
 * Hooks: useProduct, useProductActions, useCurrency.
 */
export function ProductScreen() {
  const id = Number(useParams().id)
  const currency = useCurrency()
  const system = useDisplayUnitSystem()
  const p = useProduct(id)
  const [packText, setPackText] = useState<string | null>(null)
  const [pricing, setPricing] = useState(false)
  const { error: packError, attempt } = useAttempt()
  const actions = useProductActions(p.product, p)
  useProductsLiveUpdates()

  const product = p.product
  const breadcrumbs = useBreadcrumbs(product?.name)
  if (!product) {
    if (p.isLoading) return <p role="status">{strings.loading}</p>
    if (p.error instanceof ApiError && p.error.status === 404) {
      return (
        <div className="pg">
          <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
          <EmptyState title={strings.notFoundTitle} />
        </div>
      )
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const packValue = packText ?? String(product.packSize)
  const packSize = parsePackSize(packValue)
  const offered = productActions(product)
  const error = packError ?? actions.error

  return (
    <div className="pg">
      <PageHeader title={product.name} breadcrumbs={breadcrumbs} />
      <p className="pg__muted">
        <Link to={`/ingredients/${product.ingredientId}`}>{displayName(product.ingredientName)}</Link> · {formatPackSize(product.packSize, product.baseUnit, system)}
      </p>
      {product.archived ? (
        <div className="pg__row">
          <Chip kind="state">{strings.archivedChip}</Chip>
          <p className="pg__muted">{strings.archivedNote}</p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}

      <BentoGrid columns={2}>
        <Tile as="section" span="full" aria-label={strings.packSizeTitle}>
          <h2 className="pg__tile-title">{strings.packSizeTitle}</h2>
          <form
            className="pg__stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (packSize !== null) void attempt(() => p.setPackSize(packSize)).then(() => setPackText(null))
            }}
          >
            <TextField
              size="sm"
              label={strings.packSizeLabel(product.baseUnit)}
              inputMode="decimal"
              value={packValue}
              onChange={setPackText}
              error={packSize === null ? strings.errPackSize : undefined}
            />
            <FormActions
              primary={
                <Button type="submit" disabled={packSize === null || packSize === product.packSize}>
                  {strings.savePackSize}
                </Button>
              }
            />
          </form>
        </Tile>

        <Tile as="section" span="full" aria-label={strings.barcodesTitle}>
          <h2 className="pg__tile-title">{strings.barcodesTitle}</h2>
          <ProductBarcodes
            barcodes={product.barcodes}
            shopBarcodes={product.shopBarcodes}
            shops={p.shops}
            rules={p.rules}
            onAdd={p.addBarcode}
            onRemove={(code) => void attempt(() => p.removeBarcode(code))}
          />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.shopsTitle}>
          <h2 className="pg__tile-title">{strings.shopsTitle}</h2>
          <ProductShops allShops={p.shops} soldAt={product.shops} onToggle={(shopId, sells) => void attempt(() => p.setSoldAt(shopId, sells))} />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.pricesTitle}>
          <h2 className="pg__tile-title">{strings.pricesTitle}</h2>
          <h3 className="pg__muted">{strings.latestPrices}</h3>
          <PriceList prices={product.latestPrices} shops={p.shops} currency={currency} onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))} />
          <Button className="pg__add-price" variant="secondary" icon="add" onClick={() => setPricing(true)}>
            {strings.addPrice}
          </Button>
          <h3 className="pg__muted">{strings.priceHistory}</h3>
          <PriceList prices={p.prices} shops={p.shops} currency={currency} onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))} />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.actionsTitle}>
          <FormActions
            destructive={
              <Button variant="danger-tertiary" onClick={() => void actions.remove()}>
                {strings.deleteProduct}
              </Button>
            }
            primary={
              offered.includes('unarchive') ? (
                <Button variant="secondary" onClick={() => void actions.unarchive()}>
                  {strings.unarchiveProduct}
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => void actions.archive()}>
                  {strings.archiveProduct}
                </Button>
              )
            }
          />
        </Tile>
      </BentoGrid>

      <BottomSheet open={pricing} onClose={() => setPricing(false)} title={strings.addPrice}>
        <PriceEditor
          shops={p.shops}
          latestByShop={p.latestByShop}
          currency={currency}
          today={todayIso()}
          onSave={async (body) => {
            await p.recordPrice(body)
            setPricing(false)
          }}
          onCancel={() => setPricing(false)}
        />
      </BottomSheet>
    </div>
  )
}
