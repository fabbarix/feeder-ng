import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, EmptyState, Tile } from '../../../ui'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { FormField } from '../components/FormField'
import { PriceEditor } from '../components/PriceEditor'
import { PriceList } from '../components/PriceList'
import { ProductBarcodes } from '../components/ProductBarcodes'
import { ProductShops } from '../components/ProductShops'
import { useAttempt } from '../hooks/useAttempt'
import { useCurrency } from '../hooks/useCurrency'
import { useProductsLiveUpdates } from '../hooks/useProductsLiveUpdates'
import { useProduct } from '../hooks/useProduct'
import { formatPackSize } from '../lib/names'
import { todayIso } from '../lib/priceForm'
import { parsePackSize, errorText } from '../lib/productForm'
import { strings } from '../strings'
import '../products.css'

/**
 * /products/:id: BentoGrid of tiles: pack size (editable), ProductBarcodes, ProductShops,
 * Prices (PriceList + PriceEditor in a BottomSheet), delete (shows strings.inUse on 409).
 * Hooks: useProduct, useCurrency.
 */
export function ProductScreen() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const currency = useCurrency()
  const system = useDisplayUnitSystem()
  const p = useProduct(id)
  const [packText, setPackText] = useState<string | null>(null)
  const [pricing, setPricing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const { error, setError, attempt } = useAttempt()
  useProductsLiveUpdates()

  const product = p.product
  if (!product) {
    if (p.isLoading) return <p role="status">{strings.loading}</p>
    if (p.error instanceof ApiError && p.error.status === 404) {
      return <EmptyState title={strings.notFoundTitle} action={<Link to="/products">{strings.backToProducts}</Link>} />
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const packValue = packText ?? String(product.packSize)
  const packSize = parsePackSize(packValue)

  const remove = async () => {
    setError(null)
    try {
      await p.remove()
      navigate('/products')
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'in_use' ? strings.inUse : errorText(e))
    }
  }

  return (
    <div className="pg">
      <h1 className="pg__title">{product.name}</h1>
      <p className="pg__muted">
        <Link to={`/ingredients/${product.ingredientId}`}>{product.ingredientName}</Link> ·{' '}
        {formatPackSize(product.packSize, product.baseUnit, system)}
      </p>
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}

      <BentoGrid columns={2}>
        <Tile as="section" size="full" aria-label={strings.packSizeTitle}>
          <h2 className="pg__tile-title">{strings.packSizeTitle}</h2>
          <form
            className="pg__stack"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              if (packSize !== null) void attempt(() => p.setPackSize(packSize)).then(() => setPackText(null))
            }}
          >
            <FormField label={strings.packSizeLabel(product.baseUnit)} error={packSize === null ? strings.errPackSize : undefined}>
              {(c) => <input {...c} type="text" inputMode="decimal" value={packValue} onChange={(e) => setPackText(e.target.value)} />}
            </FormField>
            <Button type="submit" variant="tonal" disabled={packSize === null || packSize === product.packSize}>
              {strings.savePackSize}
            </Button>
          </form>
        </Tile>

        <Tile as="section" size="full" aria-label={strings.barcodesTitle}>
          <h2 className="pg__tile-title">{strings.barcodesTitle}</h2>
          <ProductBarcodes
            barcodes={product.barcodes}
            shopBarcodes={product.shopBarcodes}
            shops={p.shops}
            onAdd={p.addBarcode}
            onRemove={(code) => void attempt(() => p.removeBarcode(code))}
          />
        </Tile>

        <Tile as="section" size="full" aria-label={strings.shopsTitle}>
          <h2 className="pg__tile-title">{strings.shopsTitle}</h2>
          <ProductShops
            allShops={p.shops}
            soldAt={product.shops}
            onToggle={(shopId, sells) => void attempt(() => p.setSoldAt(shopId, sells))}
          />
        </Tile>

        <Tile as="section" size="full" aria-label={strings.pricesTitle}>
          <h2 className="pg__tile-title">{strings.pricesTitle}</h2>
          <h3 className="pg__muted">{strings.latestPrices}</h3>
          <PriceList
            prices={product.latestPrices}
            shops={p.shops}
            currency={currency}
            onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))}
          />
          <Button variant="tonal" onClick={() => setPricing(true)}>
            {strings.addPrice}
          </Button>
          <h3 className="pg__muted">{strings.priceHistory}</h3>
          <PriceList
            prices={p.prices}
            shops={p.shops}
            currency={currency}
            onDelete={(priceId) => void attempt(() => p.deletePrice(priceId))}
          />
        </Tile>

        <Tile as="section" size="full" aria-label={strings.deleteProduct}>
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            {strings.deleteProduct}
          </Button>
        </Tile>
      </BentoGrid>

      <BottomSheet open={confirming} onClose={() => setConfirming(false)} title={strings.deleteProduct}>
        <p>{strings.deleteProductConfirm}</p>
        <Button
          onClick={() => {
            setConfirming(false)
            void remove()
          }}
        >
          {strings.confirmDeleteProduct}
        </Button>
      </BottomSheet>
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
