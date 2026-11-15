import { useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { useMe } from '../../../app/useMe'
import { ApiError } from '../../../lib/http'
import { BentoGrid, BottomSheet, Button, ConfirmDialog, EmptyState, ErrorState, LoadState, IconButton, Muted, PageHeader, SectionTitle, Stack, Tile, useToast } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useCurrency } from '../../products/hooks/useCurrency'
import { useProducts } from '../../products/hooks/useProducts'
import { useAttempt } from '../../products/hooks/useAttempt'
import { useProductsLiveUpdates } from '../../products/hooks/useProductsLiveUpdates'
import { AddShopBarcodeSheet } from '../components/AddShopBarcodeSheet'
import { ShopBarcodeList } from '../components/ShopBarcodeList'
import { ShopNameForm } from '../components/ShopList'
import { ShopLocationTile } from '../components/ShopLocationTile'
import { ShopPricesTile } from '../components/ShopPricesTile'
import { WeightRuleEditor } from '../components/WeightRuleEditor'
import { WeightRuleList } from '../components/WeightRuleList'
import { useHashSection, WEIGHT_RULES_ANCHOR } from '../hooks/useHashSection'
import { useShop } from '../hooks/useShop'
import { useShopPrices } from '../hooks/useShopPrices'
import { soldAtIds } from '../lib/productChoices'
import { shopImpactRows } from '../lib/shopImpact'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import '../../products/products.css'

/**
 * /settings/shops/:id: the Shop Location (full width, short), Shop Barcodes (removed at once with Undo; "Add Shop Barcode" opens the
 * sheet on the crafted Product Select), Weight Barcode Rules (Admin edits) and "Prices known here" (one read by Shop). Rename and
 * Delete (Admin) sit in the header; Delete is a danger confirm with what goes as rows. A failed action is the page's FormError.
 */
export function ShopScreen() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const currency = useCurrency()
  const shop = useShop(id, isAdmin)
  const breadcrumbs = useBreadcrumbs(shop.shop?.name)
  const { products } = useProducts('')
  const prices = useShopPrices(id, currency)
  const toast = useToast()
  const addButton = useRef<HTMLButtonElement>(null)

  const [editor, setEditor] = useState<{ rule?: ShopRule } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState(false)
  const { error, attempt } = useAttempt()
  // B9-41 (SSP-15): Scan's "Set up the rule" opens this page at its Weight Barcode Rules
  useHashSection()
  useProductsLiveUpdates()

  if (!shop.shop) {
    // B9-20 (RES-02): offline and never loaded is a LoadState; a 404 says so; another failure offers Try again.
    if (shop.state === 'loading') return <p role="status">{strings.loading}</p>
    const notFound = shop.error instanceof ApiError && shop.error.status === 404
    return (
      <Stack gap="4">
        <PageHeader title={breadcrumbs.at(-1)?.label ?? ''} breadcrumbs={breadcrumbs} />
        {shop.state === 'offlineUnknown' ? (
          <LoadState title={strings.offlineItemTitle} text={strings.offlineItemText} />
        ) : notFound ? (
          <EmptyState title={strings.notFoundTitle} />
        ) : (
          <ErrorState message={strings.itemError} onRetry={shop.refetch} />
        )}
      </Stack>
    )
  }

  const name = shop.shop.name
  const impactRows = shop.impact ? shopImpactRows(shop.impact) : []

  return (
    <Stack gap="4">
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
      {isAdmin ? null : <Muted>{strings.adminOnly}</Muted>}
      <FormError>{error}</FormError>

      <BentoGrid min="card">
        <ShopLocationTile location={shop.shop.location} onSave={shop.saveLocation} />

        <Tile as="section" span="full" aria-label={strings.shopBarcodesTitle}>
          <SectionTitle>{strings.shopBarcodesTitle}</SectionTitle>
          <ShopBarcodeList
            barcodes={shop.barcodes}
            rules={shop.rules}
            products={products}
            onDelete={(barcode, label) => void attempt(() => shop.removeBarcode(barcode, label))}
          />
          <Button ref={addButton} variant="secondary" onClick={() => setAdding(true)}>
            {strings.addShopBarcode}
          </Button>
        </Tile>

        <Tile as="section" span="full" aria-label={strings.weightRulesTitle} id={WEIGHT_RULES_ANCHOR}>
          <SectionTitle>{strings.weightRulesTitle}</SectionTitle>
          <WeightRuleList
            rules={shop.rules}
            currency={currency}
            isAdmin={isAdmin}
            onAdd={() => setEditor({})}
            onEdit={(rule) => setEditor({ rule })}
            onDelete={(rule) => void attempt(() => shop.deleteRule(rule.id))}
          />
        </Tile>

        <ShopPricesTile shopName={name} prices={prices} />
      </BentoGrid>

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
      <AddShopBarcodeSheet
        open={adding}
        shop={{ id, name }}
        rules={shop.rules}
        currency={currency}
        soldAtProductIds={soldAtIds(prices.rows, shop.barcodes)}
        onClose={() => {
          setAdding(false)
          addButton.current?.focus()
        }}
        onAdd={async (body) => {
          await shop.addBarcode(body)
          toast.show({ status: 'success', title: strings.shopBarcodeAdded })
        }}
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
      <ConfirmDialog
        open={deleting}
        tone="danger"
        title={strings.deleteShopTitle(name)}
        body={shop.impact === null ? strings.deleteShopWarning : shop.impact && impactRows.length === 0 ? strings.deleteShopNothing : undefined}
        groups={impactRows.length > 0 ? [{ label: strings.deleteShopGoesWith(name), rows: impactRows }] : undefined}
        note={shop.impact === null ? strings.cannotBeUndone : strings.deleteShopNote}
        confirmLabel={strings.deleteShop}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false)
          void attempt(async () => {
            await shop.remove()
            navigate('/settings/shops')
          })
        }}
      />
    </Stack>
  )
}
