// The Shop screen (bottom bar "Shop", route /shop). Wires hooks to components; no fetching or domain maths here.
import { useState } from 'react'
import { ApiError } from '../../../lib/http'
import { useDisplayUnitSystem } from '../../ingredients/hooks/useDisplayUnitSystem'
import { getLastShopId } from '../../scan/lib/lastShop'
import { useIngredientChoices } from '../../stock/hooks/useIngredientChoices'
import { BentoGrid } from '../../../ui/BentoGrid'
import { Button } from '../../../ui/Button'
import { CelebrationTile } from '../components/CelebrationTile'
import { ExtraSheet } from '../components/ExtraSheet'
import { ShoppingBody } from '../components/ShoppingBody'
import { TickSheet } from '../components/TickSheet'
import { useShoppingActions } from '../hooks/useShoppingActions'
import { useShoppingList } from '../hooks/useShoppingList'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

type Sheet = { kind: 'tick'; entry: ListEntry } | { kind: 'extra' } | null

function errorMessage(err: unknown): string {
  return err instanceof ApiError || err instanceof Error ? err.message : shopStrings.deleteFailed
}

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function ShoppingScreen() {
  const system = useDisplayUnitSystem()
  const [shopId] = useState(() => getLastShopId(localStorageOrNull()))
  const [to, setTo] = useState<string | undefined>(undefined)
  const [sheet, setSheet] = useState<Sheet>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const list = useShoppingList({ shopId, to })
  const actions = useShoppingActions()
  const ingredients = useIngredientChoices()
  const data = list.data

  const run = (fn: () => Promise<unknown>) => {
    setActionError(null)
    fn().catch((err: unknown) => setActionError(errorMessage(err)))
  }

  const onTick = (entry: ListEntry) => {
    if (entry.kind === 'extra' && entry.ingredientId === null) {
      run(() => actions.tickExtra(entry.extraId as number, 0, shopId))
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
        ? actions.tickExtra(entry.extraId as number, quantity, shopId)
        : actions.tick({ ingredientId: entry.ingredientId as number, to: data.to, quantity, shopId }),
    )
  }

  const onExtraSubmit = (input: Parameters<typeof actions.addExtra>[0]) => {
    setSheet(null)
    run(() => actions.addExtra(input))
  }

  return (
    <section className="shop-screen">
      <h1 className="shop-screen__title">{shopStrings.title}</h1>
      {list.error && !data ? <p role="alert">{list.error.message}</p> : null}
      {list.stale ? <p className="shop-screen__stale">{shopStrings.offlineList}</p> : null}
      {actionError ? <p role="alert">{actionError}</p> : null}
      {data ? (
        <ShoppingBody
          list={data}
          system={system}
          onRangeChange={setTo}
          onTick={onTick}
          onUntick={onUntick}
          onDelete={onDelete}
        />
      ) : null}
      {data?.complete ? <CelebrationTile summary={data.summary} currency={data.currency} /> : null}
      {data ? (
        <BentoGrid columns={2}>
          <Button variant="tonal" onClick={() => setSheet({ kind: 'extra' })}>
            {shopStrings.addExtra}
          </Button>
        </BentoGrid>
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

