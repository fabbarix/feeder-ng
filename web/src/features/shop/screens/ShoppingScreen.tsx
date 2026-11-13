// The Shop screen (bottom bar "Shop", route /shop). Wires hooks to components; no fetching or domain maths here.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { markSlotPath } from '../../plan'
import { ApiError } from '../../../lib/http'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { ErrorState } from '../../../ui/ErrorState'
import { IconButton } from '../../../ui/IconButton'
import { PageHeader } from '../../../ui/PageHeader'
import { ShopSelect } from '../../../ui/Select/ShopSelect'
import { Skeleton } from '../../../ui/Skeleton'
import { useToast } from '../../../ui/Toast'
import { CelebrationTile } from '../components/CelebrationTile'
import { ExtraSheet } from '../components/ExtraSheet'
import { LineSheet } from '../components/LineSheet'
import { RangePicker } from '../components/RangePicker'
import { ShoppingBody } from '../components/ShoppingBody'
import { TickSheet } from '../components/TickSheet'
import { ANY_SHOP_ID, shopPickerChoices } from '../lib/anyShop'
import type { ListEntry } from '../lib/lines'
import { useLineSheet } from '../hooks/useLineSheet'
import { useShopChoice } from '../hooks/useShopChoice'
import { useShopHere } from '../hooks/useShopHere'
import { AddShopSheet } from '../../shops/components/AddShopSheet'
import { useShoppingActions } from '../hooks/useShoppingActions'
import { useShoppingList } from '../hooks/useShoppingList'
import { shopStrings } from '../strings'
import '../shop.css'

type Sheet = { kind: 'tick'; entry: ListEntry } | { kind: 'extra' } | { kind: 'addShop'; name: string } | null

function errorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : shopStrings.deleteFailed
}

export function ShoppingScreen() {
  const system = useDisplayUnitSystem()
  const navigate = useNavigate()
  const choice = useShopChoice()
  const [to, setTo] = useState<string | undefined>(undefined)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const list = useShoppingList({ shopId: choice.shopId, to })
  const actions = useShoppingActions()
  const toast = useToast()
  const here = useShopHere({ shopId: choice.shopId, setShopId: choice.setShopId, onAddHere: () => setSheet({ kind: 'addShop', name: '' }) })
  const ingredients = useIngredientChoices()
  const data = list.data
  const shopName = choice.shops.find((s) => s.id === choice.shopId)?.name ?? null
  const shopOptions = useMemo(() => shopPickerChoices(choice.shops, shopStrings.anyShop), [choice.shops])

  const run = (fn: () => Promise<unknown>) => {
    setActionError(null)
    fn().catch((err: unknown) => setActionError(errorMessage(err)))
  }

  const onTick = (entry: ListEntry) => {
    if (entry.kind === 'extra' && entry.ingredientId === null) {
      run(() => actions.tickExtra(entry.extraId as number, 0, choice.shopId))
      return
    }
    setSheet({ kind: 'tick', entry })
  }

  const onUntick = (entry: ListEntry) => {
    if (!data) return
    run(() => (entry.kind === 'extra' ? actions.untickExtra(entry.extraId as number) : actions.untick(entry.ingredientId as number, data.to)))
  }

  const onDelete = (entry: ListEntry) => run(() => actions.deleteExtra(entry.extraId as number))

  // B5-SH: Not needed for the range and the picked Shop; the toast offers Undo ("Needed after all").
  const onNotNeeded = (entry: ListEntry) => {
    if (!data || entry.ingredientId === null) return
    const ingredientId = entry.ingredientId
    const to = data.to
    const shopId = choice.shopId
    run(async () => {
      await actions.notNeeded({ ingredientId, to, shopId })
      toast.show(shopStrings.notNeededToast(entry.title), {
        actionLabel: shopStrings.undo,
        onAction: () => run(() => actions.neededAfterAll(ingredientId, to, shopId)),
      })
    })
  }

  const onNeededAfterAll = (entry: ListEntry) => {
    if (!data || entry.ingredientId === null) return
    run(() => actions.neededAfterAll(entry.ingredientId as number, data.to, choice.shopId))
  }

  // DS-SHOP: a row opens its sheet; the sheet's actions run the handlers above.
  const lineSheet = useLineSheet({
    onNotNeeded,
    onNeededAfterAll,
    onMarkIt: (entry) => {
      if (entry.markIt) navigate(markSlotPath(entry.markIt))
    },
    onDelete,
  })

  const onTickSubmit = (entry: ListEntry, quantity: number) => {
    if (!data) return
    setSheet(null)
    run(() =>
      entry.kind === 'extra'
        ? actions.tickExtra(entry.extraId as number, quantity, choice.shopId)
        : actions.tick({ ingredientId: entry.ingredientId as number, to: data.to, quantity, shopId: choice.shopId }),
    )
  }

  const onExtraSubmit = (input: Parameters<typeof actions.addExtra>[0]) => {
    setSheet(null)
    run(() => actions.addExtra(input))
  }

  return (
    <section className="shop-screen">
      <PageHeader
        title={shopStrings.title}
        actions={<IconButton icon="add" label={shopStrings.addExtra} onClick={() => setSheet({ kind: 'extra' })} />}
      />
      <div className="shop-screen__controls">
        {data ? <RangePicker today={data.today} maxTo={data.maxTo} to={data.to} onChange={setTo} /> : null}
        <div className="shop-screen__shop">
          <ShopSelect
            label={shopStrings.shopLabel}
            appearance="chip"
            icon="shops"
            shops={shopOptions}
            value={choice.shopId ?? ANY_SHOP_ID}
            onChange={(id) => choice.setShopId(id === ANY_SHOP_ID ? null : id)}
            disabled={choice.isLoading}
            onCreate={(name) => setSheet({ kind: 'addShop', name })}
            createLabel={shopStrings.addShopNamed}
          />
          {here.anyLocated ? (
            <IconButton
              icon="location"
              label={here.status === 'locating' ? shopStrings.findingShopHere : shopStrings.findShopHere}
              onClick={here.find}
              disabled={here.status === 'locating'}
            />
          ) : null}
        </div>
      </div>
      {list.status === 'loading' ? <Skeleton variant="tile" count={2} /> : null}
      {list.status === 'error' ? <ErrorState message={shopStrings.loadFailed} onRetry={list.retry} /> : null}
      {data?.complete ? <CelebrationTile summary={data.summary} currency={data.currency} /> : null}
      {list.status === 'offline' ? <p className="shop-screen__stale">{shopStrings.offlineList}</p> : null}
      {actionError ? <ErrorState message={actionError} /> : null}
      {data ? (
        <ShoppingBody
          list={data}
          system={system}
          shopName={shopName}
          onTick={onTick}
          onUntick={onUntick}
          onOpenLine={lineSheet.open}
          onScan={() => navigate('/scan')}
          onMarkIt={(slot) => navigate(markSlotPath(slot))}
        />
      ) : null}
      <LineSheet entry={lineSheet.entry} actions={lineSheet.actions} onAction={lineSheet.run} onClose={lineSheet.close} />
      {sheet?.kind === 'tick' && data ? (
        <TickSheet
          key={sheet.entry.key}
          open
          onClose={() => setSheet(null)}
          name={sheet.entry.title}
          baseUnit={sheet.entry.baseUnit ?? 'piece'}
          defaultQuantity={sheet.entry.quantity}
          onSubmit={(quantity) => onTickSubmit(sheet.entry, quantity)}
        />
      ) : null}
      <AddShopSheet
        open={sheet?.kind === 'addShop'}
        initialName={sheet?.kind === 'addShop' ? sheet.name : ''}
        onClose={() => setSheet(null)}
        onAdded={(shop) => {
          setSheet(null)
          choice.setShopId(shop.id)
        }}
      />
      {sheet?.kind === 'extra' ? (
        <ExtraSheet open onClose={() => setSheet(null)} ingredients={ingredients.choices} onSubmit={onExtraSubmit} />
      ) : null}
    </section>
  )
}
