/**
 * The Stock screen, reached from the avatar menu (a top-level destination: the bars stay, so no back button).
 *
 * Layout (ui-fix-plan 2.6, 5.7), top to bottom:
 * - `PageHeader title="Stock"` with actions: secondary sm "Stock-take" (icon `scan`, onClick from
 *   useStockTakeEntry) and primary sm "Add to Stock" (icon `add`) which opens AddLotSheet. Header actions are the
 *   only Buttons at this level, so one primary per scope.
 * - SpoiledTile (when there are spoiled lots).
 * - `SearchField` "Search Stock" and filter `Chip kind="filter"`s All · Use soon · Spoiled (aria-pressed), both
 *   only when status is 'ready'. filterTotals(sortTotals(data), filter, query).
 * - A `ListGroup label="Stock"` of StockRow. If the filter leaves nothing: EmptyState "Nothing in Stock matches".
 * - A BottomSheet per Ingredient: LotList + secondary "Set total" (-> SetTotalSheet).
 * Status (from useStockTotals().status): loading -> `Skeleton variant="row" count={5}`; error -> `ErrorState`
 * "Stock could not be loaded." with onRetry = refetch; offline -> `EmptyState` "Stock is not saved on this device
 * yet" (icon `offline`); empty -> `EmptyState` "Nothing in Stock yet" + hint; ready -> the list.
 * A failed change shows a `useToast` error toast "That did not save. Try again." (no inline role=alert paragraph).
 * No `<main>`: the shell provides it. No tile grid.
 */
import { useMemo, useState, type ReactElement } from 'react'
import { BottomSheet, Button, Chip, EmptyState, ErrorState, ListGroup, PageHeader, SearchField, Skeleton, useToast } from '../../../ui'
import { AddLotSheet } from '../components/AddLotSheet'
import { LotList } from '../components/LotList'
import { SetTotalSheet } from '../components/SetTotalSheet'
import { SpoiledTile } from '../components/SpoiledTile'
import { StockRow } from '../components/StockRow'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { useStockActions, useSpoiledLots, useStockLots, useStockTotals } from '../hooks/useStock'
import { useStockTakeEntry } from '../hooks/useStockTakeEntry'
import { filterTotals, STOCK_FILTERS, type StockFilter } from '../lib/filter'
import { sortTotals } from '../lib/view'
import { stockStrings as strings } from '../strings'
import '../stock.css'

export function StockScreen(): ReactElement | null {
  const totals = useStockTotals()
  const { system = 'metric' } = totals
  const spoiled = useSpoiledLots()
  const actions = useStockActions()
  const choices = useIngredientChoices()
  const toast = useToast()
  const openStockTake = useStockTakeEntry()

  const [filter, setFilter] = useState<StockFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingTotal, setSettingTotal] = useState(false)
  const [adding, setAdding] = useState(false)
  const lots = useStockLots(selectedId)
  // The household's date comes from the server with the lots; go-off wording uses it.
  const today = spoiled.today ?? lots.today ?? ''

  const items = useMemo(() => filterTotals(sortTotals(totals.data ?? []), filter, query), [totals.data, filter, query])
  const selected = (totals.data ?? []).find((i) => i.ingredientId === selectedId) ?? null
  const spoiledLots = spoiled.data ?? []

  /** Runs a change; a failure shows an error toast and the screen stays usable. */
  const attempt = async (change: () => Promise<void>) => {
    try {
      await change()
    } catch {
      toast.show(strings.actionFailed, { status: 'error' })
    }
  }

  const closeDetail = () => {
    setSelectedId(null)
    setSettingTotal(false)
  }

  return (
    <div className="stock-screen">
      <PageHeader
        title={strings.title}
        actions={
          <>
            <Button variant="secondary" size="sm" icon="scan" onClick={openStockTake}>
              {strings.stockTake}
            </Button>
            <Button size="sm" icon="add" onClick={() => setAdding(true)}>
              {strings.add}
            </Button>
          </>
        }
      />

      <SpoiledTile
        lots={spoiledLots}
        today={today}
        system={system}
        onThrowOut={(id) => void attempt(() => spoiled.throwOut(id))}
        onKeep={(id) => void attempt(() => spoiled.keep(id))}
      />

      {totals.status === 'loading' ? (
        <div aria-busy="true">
          <Skeleton variant="row" count={5} />
        </div>
      ) : totals.status === 'error' ? (
        <ErrorState message={strings.errorMessage} onRetry={() => void totals.refetch()} />
      ) : totals.status === 'offline' ? (
        <EmptyState icon="offline" title={strings.offlineTitle} description={strings.offlineHint} />
      ) : totals.status === 'empty' ? (
        <EmptyState icon="stock" title={strings.empty} description={strings.emptyHint} />
      ) : (
        <div className="stock-screen__list">
          <div className="stock-screen__controls">
            <SearchField label={strings.searchLabel} value={query} onChange={setQuery} />
            <div className="stock-screen__filters" role="group" aria-label={strings.filtersLabel}>
              {STOCK_FILTERS.map((f) => (
                <Chip key={f} kind="filter" selected={filter === f} onClick={() => setFilter(f)}>
                  {strings.filters[f]}
                </Chip>
              ))}
            </div>
          </div>
          {items.length === 0 ? (
            <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
          ) : (
            <ListGroup label={strings.listLabel}>
              {items.map((item) => (
                <StockRow key={item.ingredientId} item={item} today={today} system={system} onOpen={setSelectedId} />
              ))}
            </ListGroup>
          )}
        </div>
      )}

      <BottomSheet
        open={selected !== null && !settingTotal}
        onClose={closeDetail}
        title={selected?.name ?? ''}
        footer={
          <Button variant="secondary" onClick={() => setSettingTotal(true)}>
            {strings.setTotal}
          </Button>
        }
      >
        <LotList lots={lots.data ?? []} today={today} system={system} />
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
    </div>
  )
}
