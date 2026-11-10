// The Shop screen (bottom bar "Shop", route /shop). Wires hooks to components; no fetching or domain maths here.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/http'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { ErrorState } from '../../../ui/ErrorState'
import { IconButton } from '../../../ui/IconButton'
import { PageHeader } from '../../../ui/PageHeader'
import { ShopSelect } from '../../../ui/Select/ShopSelect'
import { Skeleton } from '../../../ui/Skeleton'
import { CelebrationTile } from '../components/CelebrationTile'
import { ExtraSheet } from '../components/ExtraSheet'
import { RangePicker } from '../components/RangePicker'
import { ShoppingBody } from '../components/ShoppingBody'
import { TickSheet } from '../components/TickSheet'
import { ANY_SHOP_ID, shopPickerChoices } from '../lib/anyShop'
import type { ListEntry } from '../lib/lines'
import { useShopChoice } from '../hooks/useShopChoice'
import { useShoppingActions } from '../hooks/useShoppingActions'
import { useShoppingList } from '../hooks/useShoppingList'
import { shopStrings } from '../strings'
import '../shop.css'

type Sheet = { kind: 'tick'; entry: ListEntry } | { kind: 'extra' } | null

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
        <ShopSelect
          label={shopStrings.shopLabel}
          shops={shopOptions}
          value={choice.shopId ?? ANY_SHOP_ID}
          onChange={(id) => choice.setShopId(id === ANY_SHOP_ID ? null : id)}
          disabled={choice.isLoading}
        />
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
          onDelete={onDelete}
          onScan={() => navigate('/scan')}
        />
      ) : null}
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
      {sheet?.kind === 'extra' ? (
        <ExtraSheet open onClose={() => setSheet(null)} ingredients={ingredients.choices} onSubmit={onExtraSubmit} />
      ) : null}
    </section>
  )
}
