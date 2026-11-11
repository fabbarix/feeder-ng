import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useMe } from '../../../app/useMe'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, EmptyState, IconButton, ListGroup, ListRow, PageHeader, Tile } from '../../../ui'
import { useCurrency } from '../../products/hooks/useCurrency'
import { useProducts } from '../../products/hooks/useProducts'
import { formatMinor } from '../../products/lib/money'
import { useAttempt } from '../../products/hooks/useAttempt'
import { useProductsLiveUpdates } from '../../products/hooks/useProductsLiveUpdates'
import { AddShopBarcodeSheet } from '../components/AddShopBarcodeSheet'
import { ShopBarcodeList } from '../components/ShopBarcodeList'
import { ShopNameForm } from '../components/ShopList'
import { WeightRuleEditor } from '../components/WeightRuleEditor'
import { WeightRuleList } from '../components/WeightRuleList'
import { useShop } from '../hooks/useShop'
import { useShopPrices } from '../hooks/useShopPrices'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import '../../products/products.css'

/**
 * /settings/shops/:id: BentoGrid with a Weight Barcode Rules tile (WeightRuleList + WeightRuleEditor in a
 * BottomSheet, Admin edits), a Shop Barcodes tile (ShopBarcodeList), rename/delete (Admin; delete asks to confirm
 * with strings.deleteShopWarning). Hooks: useShop, useCurrency (products feature), useMe.
 */
export function ShopScreen() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const currency = useCurrency()
  const shop = useShop(id)
  const breadcrumbs = useBreadcrumbs(shop.shop?.name)
  const { products } = useProducts('')
  const prices = useShopPrices(id, [...new Set(shop.barcodes.map((b) => b.productId))])

  const [editor, setEditor] = useState<{ rule?: ShopRule } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)
  const { error, attempt } = useAttempt()
  useProductsLiveUpdates()

  if (!shop.shop) {
    if (shop.isLoading) return <p role="status">{strings.loading}</p>
    if (shop.error instanceof ApiError && shop.error.status === 404) {
      return (
        <div className="pg">
          <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
          <EmptyState title={strings.notFoundTitle} />
        </div>
      )
    }
    return <p role="alert">{strings.actionFailed}</p>
  }

  const productName = (pid: number) => products.find((p) => p.id === pid)?.name ?? strings.unknownProduct

  return (
    <div className="pg">
      <PageHeader
        title={shop.shop.name}
        breadcrumbs={breadcrumbs}
        actions={
          isAdmin ? (
            <>
              <IconButton icon="edit" label={strings.renameShopLabel} onClick={() => setRenaming(true)} />
              <IconButton icon="delete" label={strings.deleteShop} onClick={() => setDeleting(true)} />
            </>
          ) : undefined
        }
      />
      {isAdmin ? null : <p className="pg__muted">{strings.adminOnly}</p>}
      {error ? (
        <p role="alert" className="pg__error">
          {error}
        </p>
      ) : null}

      <BentoGrid columns={2}>
        <Tile as="section" span="full" aria-label={strings.shopBarcodesTitle}>
          <h2 className="pg__tile-title">{strings.shopBarcodesTitle}</h2>
          <ShopBarcodeList
            barcodes={shop.barcodes}
            rules={shop.rules}
            products={products}
            onDelete={(bid) => void attempt(() => shop.deleteBarcode(bid))}
          />
          <Button variant="tertiary" onClick={() => setAdding(true)}>
            {strings.addShopBarcode}
          </Button>
        </Tile>

        <Tile as="section" span="full" aria-label={strings.weightRulesTitle}>
          <h2 className="pg__tile-title">{strings.weightRulesTitle}</h2>
          <WeightRuleList
            rules={shop.rules}
            currency={currency}
            isAdmin={isAdmin}
            onAdd={() => setEditor({})}
            onEdit={(rule) => setEditor({ rule })}
            onDelete={(rule) => void attempt(() => shop.deleteRule(rule.id))}
          />
        </Tile>

        <Tile as="section" span="full" aria-label={strings.pricesTitle}>
          <h2 className="pg__tile-title">{strings.pricesTitle}</h2>
          {prices.length === 0 ? (
            <p className="pg__muted">{strings.noPrices}</p>
          ) : (
            <ListGroup label={strings.pricesTitle}>
              {prices.map((p) => (
                <ListRow
                  key={p.id}
                  title={`${productName(p.productId)} · ${p.date}${p.priceCents != null ? ` · ${formatMinor(p.priceCents, currency)}` : ''}`}
                  chevron
                  href={`/products/${p.productId}`}
                />
              ))}
            </ListGroup>
          )}
        </Tile>
      </BentoGrid>

      <BottomSheet open={editor !== null} onClose={() => setEditor(null)} title={editor?.rule ? strings.editRule : strings.addRule}>
        {editor ? (
          <WeightRuleEditor
            initial={editor.rule}
            currency={currency}
            onCancel={() => setEditor(null)}
            onSave={async (body) => {
              if (editor.rule) await shop.updateRule(editor.rule.id, body)
              else await shop.addRule(body)
              setEditor(null)
            }}
          />
        ) : null}
      </BottomSheet>
      <AddShopBarcodeSheet
        open={adding}
        rules={shop.rules}
        currency={currency}
        onClose={() => setAdding(false)}
        onAdd={async (body) => shop.addBarcode(body)}
      />
      <BottomSheet open={renaming} onClose={() => setRenaming(false)} title={strings.renameShop}>
        {renaming ? (
          <ShopNameForm
            initial={shop.shop.name}
            submitLabel={strings.saveShop}
            onSubmit={async (name) => {
              await shop.rename(name)
              setRenaming(false)
            }}
          />
        ) : null}
      </BottomSheet>
      <BottomSheet open={deleting} onClose={() => setDeleting(false)} title={strings.deleteShop}>
        <p>{strings.deleteShopWarning}</p>
        <Button
          variant="danger"
          onClick={() => {
            setDeleting(false)
            void attempt(async () => {
              await shop.remove()
              navigate('/settings/shops')
            })
          }}
        >
          {strings.confirmDeleteShop}
        </Button>
      </BottomSheet>
    </div>
  )
}
