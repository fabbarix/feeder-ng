import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ApiError } from '../../../lib/http'
import { BentoGrid, Button, Chip, Cluster, CROP_ASPECTS, EmptyState, FormActions, ImagePicker, Muted, PageHeader, SectionTitle, Stack, TextField, Tile } from '../../../ui'
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
        <Stack gap="4">
          <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
          <EmptyState title={strings.notFoundTitle} />
        </Stack>
      )
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const packValue = packText ?? String(product.packSize)
  const packSize = parsePackSize(packValue)
  const offered = productActions(product)
  const error = packError ?? actions.error

  return (
    <Stack gap="4">
      <PageHeader title={product.name} breadcrumbs={breadcrumbs} />
      <Muted>
        <Link to={`/ingredients/${product.ingredientId}`}>{displayName(product.ingredientName)}</Link> · {formatPackSize(product.packSize, product.baseUnit, system)}
      </Muted>
      {product.archived ? (
        <Cluster>
          <Chip kind="state">{strings.archivedChip}</Chip>
          <Muted>{strings.archivedNote}</Muted>
        </Cluster>
      ) : null}
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}

      <BentoGrid min="card">
        <Tile as="section" span="full" aria-labelledby="product-picture-heading">
          <SectionTitle id="product-picture-heading">{strings.pictureLabel}</SectionTitle>
          <ImagePicker
            hideLabel
            label={strings.pictureLabel}
            value={product.image ?? ''}
            onChange={(id) => void attempt(() => p.setImage(id))}
            aspect={CROP_ASPECTS.landscape}
          />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.packSizeTitle}>
          <SectionTitle>{strings.packSizeTitle}</SectionTitle>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (packSize !== null) void attempt(() => p.setPackSize(packSize)).then(() => setPackText(null))
            }}
          >
            <Stack>
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
            </Stack>
          </form>
        </Tile>

        <Tile as="section" span="full" aria-label={strings.barcodesTitle}>
          <SectionTitle>{strings.barcodesTitle}</SectionTitle>
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
          <SectionTitle>{strings.shopsTitle}</SectionTitle>
          <ProductShops allShops={p.shops} soldAt={product.shops} onToggle={(shopId, sells) => void attempt(() => p.setSoldAt(shopId, sells))} />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.pricesTitle}>
          <SectionTitle>{strings.pricesTitle}</SectionTitle>
          <h3 className="product-prices__subhead">
            <Muted as="span">{strings.latestPrices}</Muted>
          </h3>
          <PriceList prices={product.latestPrices} shops={p.shops} currency={currency} onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))} />
          <Cluster>
            <Button variant="secondary" icon="add" onClick={() => setPricing(true)}>
              {strings.addPrice}
            </Button>
          </Cluster>
          <h3 className="product-prices__subhead">
            <Muted as="span">{strings.priceHistory}</Muted>
          </h3>
          <PriceList prices={p.prices} shops={p.shops} currency={currency} onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))} />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.actionsTitle}>
          <FormActions
            destructive={
              <Button variant="danger-secondary" onClick={() => void actions.remove()}>
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

      {pricing ? (
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
      ) : null}
    </Stack>
  )
}
