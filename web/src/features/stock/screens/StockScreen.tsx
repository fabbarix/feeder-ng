/**
 * The Stock screen behind the avatar menu. A BentoGrid of StockTile (use-soon first),
 * the SpoiledTile on top when there are spoiled lots, an "Add to Stock" button
 * (AddLotSheet), and a BottomSheet per Ingredient with LotList and "Set total"
 * (SetTotalSheet). EmptyState "Nothing in Stock yet" when there is nothing.
 * All data and actions come from the hooks in ../hooks.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { BentoGrid, BottomSheet, Button, EmptyState } from '../../../ui'
import { AddLotSheet } from '../components/AddLotSheet'
import { LotList } from '../components/LotList'
import { SetTotalSheet } from '../components/SetTotalSheet'
import { SpoiledTile } from '../components/SpoiledTile'
import { StockTile } from '../components/StockTile'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { useStockActions, useSpoiledLots, useStockLots, useStockTotals } from '../hooks/useStock'
import { sortTotals } from '../lib/view'
import { stockStrings as strings } from '../strings'

export function StockScreen(): ReactElement | null {
  const totals = useStockTotals()
  const { system = 'metric' } = totals
  const spoiled = useSpoiledLots()
  const actions = useStockActions()
  const choices = useIngredientChoices()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingTotal, setSettingTotal] = useState(false)
  const [adding, setAdding] = useState(false)
  const [failed, setFailed] = useState(false)
  const lots = useStockLots(selectedId)
  // The household's date comes from the server with the lots; go-off wording uses it.
  const today = spoiled.today ?? lots.today ?? ''

  const items = useMemo(() => sortTotals(totals.data ?? []), [totals.data])
  const selected = items.find((i) => i.ingredientId === selectedId) ?? null
  const spoiledLots = spoiled.data ?? []

  /** Runs a change; a failure shows inline and the screen stays usable. */
  const attempt = async (change: () => Promise<void>) => {
    setFailed(false)
    try {
      await change()
    } catch {
      setFailed(true)
    }
  }

  const closeDetail = () => {
    setSelectedId(null)
    setSettingTotal(false)
  }

  return (
    <main className="stock-screen">
      <h1>{strings.title}</h1>
      {totals.isLoading ? <p role="status">{strings.loading}</p> : null}
      {failed ? <p role="alert">{strings.actionFailed}</p> : null}

      <SpoiledTile
        lots={spoiledLots}
        today={today}
        system={system}
        onThrowOut={(id) => void attempt(() => spoiled.throwOut(id))}
        onKeep={(id) => void attempt(() => spoiled.keep(id))}
      />

      {items.length === 0 && !totals.isLoading ? (
        <EmptyState title={strings.empty} description={strings.emptyHint} />
      ) : (
        <BentoGrid columns={2}>
          {items.map((item) => (
            <StockTile key={item.ingredientId} item={item} system={system} onOpen={setSelectedId} />
          ))}
        </BentoGrid>
      )}

      <Button onClick={() => setAdding(true)}>{strings.add}</Button>

      <BottomSheet open={selected !== null && !settingTotal} onClose={closeDetail} title={selected?.name ?? ''}>
        <LotList lots={lots.data ?? []} today={today} system={system} />
        <Button variant="tonal" onClick={() => setSettingTotal(true)}>
          {strings.setTotal}
        </Button>
      </BottomSheet>

      {selected && settingTotal ? (
        <SetTotalSheet
          open
          onClose={() => setSettingTotal(false)}
          name={selected.name}
          baseUnit={selected.baseUnit}
          initial={selected.total}
          onSubmit={(total) => {
            const id = selected.ingredientId
            closeDetail()
            void attempt(() => actions.setTotal(id, total))
          }}
        />
      ) : null}

      <AddLotSheet
        open={adding}
        onClose={() => setAdding(false)}
        choices={choices.choices}
        onSubmit={(input) => {
          setAdding(false)
          void attempt(() => actions.addLot(input))
        }}
      />
    </main>
  )
}
