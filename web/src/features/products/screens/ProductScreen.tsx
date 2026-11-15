import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useHouseholdDate } from '../../../app/useHouseholdDate'
import { ApiError } from '../../../lib/http'
import { BentoGrid, Button, Chip, Cluster, CROP_ASPECTS, EmptyState, ErrorState, FieldRow, ImagePicker, LoadState, Menu, Muted, PageHeader, SectionTitle, Stack, TextField, Tile } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { displayName } from '../../ingredients/lib/names'
import { PriceEditor } from '../components/PriceEditor'
import { ProductBarcodes } from '../components/ProductBarcodes'
import { ProductPrices } from '../components/ProductPrices'
import { ProductShops } from '../components/ProductShops'
import { useAttempt } from '../hooks/useAttempt'
import { useCurrency } from '../hooks/useCurrency'
import { usePackSize } from '../hooks/usePackSize'
import { useProduct } from '../hooks/useProduct'
import { useProductActions } from '../hooks/useProductActions'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { productActions } from '../lib/archive'
import { formatPackSize } from '../lib/names'
import { todayIso } from '../lib/priceForm'
import { strings } from '../strings'
import type { Price, ProductDetail } from '../types'
import '../products.css'

/**
 * /products/:id, in order of use (SET-04): the header (the Ingredient link and the pack size; Archive and Delete in the ⋮ menu), Prices
 * (rows, history, Add Price), Sold at and Pack size (cards, two-up when they fit), Barcodes, and the compact Picture last. Light removals
 * act at once with Undo; a failed change is the page's FormError.
 */
export function ProductScreen() {
  const id = Number(useParams().id)
  const p = useProduct(id)
  const product = p.product
  const breadcrumbs = useBreadcrumbs(product?.name)
  if (!product) {
    // B9-20 (RES-02): offline and never loaded is a LoadState; a 404 says so; another failure offers Try again.
    if (p.state === 'loading') return <p role="status">{strings.loading}</p>
    const notFound = p.error instanceof ApiError && p.error.status === 404
    return (
      <Stack gap="4">
        <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
        {p.state === 'offlineUnknown' ? (
          <LoadState title={strings.offlineItemTitle} text={strings.offlineItemText} />
        ) : notFound ? (
          <EmptyState title={strings.notFoundTitle} />
        ) : (
          <ErrorState message={strings.itemError} onRetry={p.refetch} />
        )}
      </Stack>
    )
  }
  return <ProductPage product={product} p={p} breadcrumbs={breadcrumbs} />
}

function ProductPage({ product, p, breadcrumbs }: { product: ProductDetail; p: ReturnType<typeof useProduct>; breadcrumbs: ReturnType<typeof useBreadcrumbs> }) {
  const currency = useCurrency()
  const system = useDisplayUnitSystem()
  const today = useHouseholdDate() ?? todayIso()
  const [sheet, setSheet] = useState<Price | 'new' | null>(null)
  const { error: changeError, attempt } = useAttempt()
  const actions = useProductActions(product, p)
  const pack = usePackSize(product, (size) => attempt(() => p.setPackSize(size)))
  useProductsLiveUpdates()

  const offered = productActions(product)
  const error = changeError ?? actions.error
  const editing = sheet !== null && sheet !== 'new' ? sheet : undefined

  return (
    <Stack gap="4">
      <PageHeader
        title={product.name}
        breadcrumbs={breadcrumbs}
        subtitle={
          <>
            <Link className="text-link" to={`/ingredients/${product.ingredientId}`}>
              {displayName(product.ingredientName)}
            </Link>
            {/* The separator stays on the link's line, so a long Ingredient name never leaves a line starting with "·". */}
            {'\u00a0· '}
            <span className="product-header__pack">{strings.packPill(formatPackSize(product.packSize, product.baseUnit, system))}</span>
          </>
        }
        actions={
          <Menu
            label={strings.morePrefix(product.name)}
            items={[
              offered.includes('unarchive')
                ? { id: 'unarchive', label: strings.unarchiveProduct, icon: 'unarchive', onSelect: () => void actions.unarchive() }
                : { id: 'archive', label: strings.archiveProduct, icon: 'archive', onSelect: () => void actions.archive() },
              { id: 'delete', label: strings.deleteProduct, icon: 'delete', tone: 'danger', onSelect: () => void actions.remove() },
            ]}
          />
        }
      />
      {product.archived ? (
        <Cluster>
          <Chip kind="state">{strings.archivedChip}</Chip>
          <Muted>{strings.archivedNote}</Muted>
        </Cluster>
      ) : null}
      <FormError>{error}</FormError>

      <BentoGrid min="card">
        <Tile as="section" span="full" aria-label={strings.pricesTitle}>
          <SectionTitle>{strings.pricesTitle}</SectionTitle>
          <ProductPrices
            latest={product.latestPrices}
            all={p.prices}
            shops={p.shops}
            currency={currency}
            today={today}
            onOpen={(price) => setSheet(price)}
            onAdd={() => setSheet('new')}
          />
        </Tile>

        <Tile as="section" aria-label={strings.shopsTitle}>
          <SectionTitle>{strings.shopsTitle}</SectionTitle>
          <ProductShops allShops={p.shops} soldAt={product.shops} onToggle={(shopId, sells) => void attempt(() => p.setSoldAt(shopId, sells))} />
        </Tile>

        <Tile as="section" aria-label={strings.packSizeTitle}>
          <SectionTitle>{strings.packSizeTitle}</SectionTitle>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void pack.submit()
            }}
          >
            <Stack gap="2">
              <FieldRow align="end">
                <TextField size="xs" label={strings.packSizeLabel(product.baseUnit)} inputMode="decimal" value={pack.value} onChange={pack.setValue} error={pack.error} />
                <Button type="submit" disabled={!pack.canSave}>
                  {strings.savePackSize}
                </Button>
              </FieldRow>
              {pack.hint ? <Muted>{pack.hint}</Muted> : null}
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

        <Tile as="section" span="full" aria-labelledby="product-picture-heading">
          <SectionTitle id="product-picture-heading">{strings.pictureLabel}</SectionTitle>
          <ImagePicker
            compact
            monogram={product.name}
            hideLabel
            label={strings.pictureLabel}
            value={product.image ?? ''}
            onChange={(image) => void attempt(() => p.setImage(image))}
            aspect={CROP_ASPECTS.landscape}
          />
        </Tile>
      </BentoGrid>

      {sheet !== null ? (
        <PriceEditor
          shops={p.shops}
          latestByShop={p.latestByShop}
          currency={currency}
          today={today}
          price={editing}
          onDelete={
            editing
              ? () => {
                  setSheet(null)
                  void attempt(() => p.deletePrice(editing))
                }
              : undefined
          }
          onSave={async (body) => {
            await p.recordPrice(body)
            setSheet(null)
          }}
          onCancel={() => setSheet(null)}
        />
      ) : null}
    </Stack>
  )
}
