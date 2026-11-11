/**
 * The Pantry screen (route /pantry, with /stock redirecting to it; the page is called Pantry, its contents are Stock): by default every Stock Lot
 * grouped by Storage Place (usePantry, PantryFilters, PantryLotRow, LotSheet with "Move to"), or "By Ingredient" the
 * per-Ingredient totals below.
 *
 * The Stock screen, reached from the avatar menu (a top-level destination: the bars stay, so no back button).
 *
 * Layout (ui-fix-plan 2.6, 5.7), top to bottom:
 * - `PageHeader title="Stock"` with actions: secondary sm "Stock-take" (icon `scan`, onClick from
 *   useStockTakeEntry) and primary sm "Add to Stock" (icon `add`) which opens AddLotSheet. Header actions are the
 *   only Buttons at this level, so one primary per scope.
 * - L-06: from 1280 px a two-column `.stock-screen__layout`: a sticky `<aside aria-label="Filter Stock">` (SpoiledTile, then the search
 *   and the chips) beside `.stock-screen__main` (the list). One tree: on a phone the aside simply comes first.
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
import { useNavigate } from 'react-router-dom'
import { BottomSheet, Button, Chip, EmptyState, ErrorState, ListGroup, PageHeader, SearchField, Skeleton, useMediaQuery, useToast } from '../../../ui'
import { AddLotSheet } from '../components/AddLotSheet'
import { LotList } from '../components/LotList'
import { LotSheet } from '../components/LotSheet'
import { PantryFilters } from '../components/PantryFilters'
import { PantryLotRow } from '../components/PantryLotRow'
import { usePantry } from '../hooks/usePantry'
import type { StockLot } from '../types'
import { SetTotalSheet } from '../components/SetTotalSheet'
import { SpoiledTile } from '../components/SpoiledTile'
import { StockRow } from '../components/StockRow'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { useStockActions, useSpoiledLots, useStockLots, useStockTotals } from '../hooks/useStock'
import { useStockTakeEntry } from '../hooks/useStockTakeEntry'
import { capitalise } from '../lib/display'
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
  const pantry = usePantry()
  const navigate = useNavigate()
  const { mode, setMode } = pantry
  const [openLot, setOpenLot] = useState<StockLot | null>(null)

  const [filter, setFilter] = useState<StockFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingTotal, setSettingTotal] = useState(false)
  const [adding, setAdding] = useState(false)
  const lots = useStockLots(selectedId)
  // The household's date comes from the server with the lots; go-off wording uses it.
  const today = spoiled.today ?? lots.today ?? pantry.lots.today ?? ''

  const items = useMemo(() => filterTotals(sortTotals(totals.data ?? []), filter, query), [totals.data, filter, query])
  const selected = (totals.data ?? []).find((i) => i.ingredientId === selectedId) ?? null
  const spoiledLots = spoiled.data ?? []
  // The aside is a 360 px column from 1280 px: the spoiled rows keep their actions under the text there.
  const twoColumns = useMediaQuery('(min-width: 1280px)')
  const ready = totals.status === 'ready'
  // No empty aside: it exists when something is spoiled or the search and chips are shown.
  const showAside = spoiledLots.length > 0 || ready

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

      <div className="stock-screen__layout">
        {showAside ? (
          <aside className="stock-screen__aside" aria-label={strings.asideLabel}>
            <SpoiledTile
              lots={spoiledLots}
              today={today}
              system={system}
              stacked={twoColumns}
              onThrowOut={(id) => void attempt(() => spoiled.throwOut(id))}
              onKeep={(id) => void attempt(() => spoiled.keep(id))}
            />
            {ready ? (
              <div className="stock-screen__controls">
                <div className="stock-screen__filters" role="group" aria-label={strings.view.label}>
                  {(['places', 'ingredients'] as const).map((m) => (
                    <Chip key={m} kind="filter" selected={mode === m} onClick={() => setMode(m)}>
                      {strings.view[m]}
                    </Chip>
                  ))}
                </div>
                <SearchField
                  label={strings.searchLabel}
                  value={query}
                  onChange={(q) => {
                    setQuery(q)
                    pantry.setView({ query: q })
                  }}
                />
                <div className="stock-screen__filters" role="group" aria-label={strings.filtersLabel}>
                  {STOCK_FILTERS.map((f) => (
                    <Chip
                      key={f}
                      kind="filter"
                      selected={filter === f}
                      onClick={() => {
                        setFilter(f)
                        pantry.setView({ status: f })
                      }}
                    >
                      {strings.filters[f]}
                    </Chip>
                  ))}
                </div>
                {mode === 'places' ? <PantryFilters view={pantry.view} places={pantry.places} onChange={pantry.setView} /> : null}
                <Button variant="tertiary" size="sm" icon="settings" onClick={() => navigate('/settings/storage-places')}>
                  {strings.managePlaces}
                </Button>
              </div>
            ) : null}
          </aside>
        ) : null}

        <div className="stock-screen__main">
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
          ) : mode === 'places' ? (
            pantry.groups.length === 0 ? (
              <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
            ) : (
              <div className="pantry-groups">
                {pantry.groups.map((g) => {
                  const name = g.key === -1 ? strings.lotsLabel : (g.place?.name ?? strings.unsorted)
                  return (
                    <ListGroup key={g.key} label={strings.groupLabel(name, g.lots.length)}>
                      {g.lots.map((lot) => (
                        <PantryLotRow
                          key={lot.id}
                          lot={lot}
                          today={today}
                          system={system}
                          placeName={pantry.view.groupByPlace ? undefined : (pantry.placeOf(lot)?.name ?? strings.unsorted)}
                          onOpen={setOpenLot}
                        />
                      ))}
                    </ListGroup>
                  )
                })}
              </div>
            )
          ) : items.length === 0 ? (
            <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
          ) : (
            <ListGroup label={strings.listLabel}>
              {items.map((item) => (
                <StockRow key={item.ingredientId} item={item} today={today} system={system} onOpen={setSelectedId} />
              ))}
            </ListGroup>
          )}
        </div>
      </div>

      <BottomSheet
        open={selected !== null && !settingTotal}
        onClose={closeDetail}
        title={selected ? capitalise(selected.name) : ''}
        footer={
          <Button variant="secondary" onClick={() => setSettingTotal(true)}>
            {strings.setTotal}
          </Button>
        }
      >
        <LotList
          lots={lots.data ?? []}
          today={today}
          system={system}
          onThrowOut={(id) => void attempt(() => actions.throwOut(id))}
        />
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

      <LotSheet
        lot={openLot}
        places={pantry.places}
        today={today}
        system={system}
        onClose={() => setOpenLot(null)}
        onMove={(lot, placeId, quantity) => {
          setOpenLot(null)
          const place = pantry.places.find((p) => p.id === placeId)
          void attempt(async () => {
            await actions.moveLot(lot.id, placeId, quantity)
            toast.show(strings.moved(lot.ingredientName, place?.name ?? ''), { status: 'success' })
          })
        }}
        onSeeIngredient={(id) => {
          setOpenLot(null)
          setSelectedId(id)
        }}
      />

      <AddLotSheet
        open={adding}
        onClose={() => setAdding(false)}
        choices={choices.choices}
        places={pantry.places}
        onSubmit={(input) => {
          setAdding(false)
          void attempt(() => actions.addLot(input))
        }}
      />
    </div>
  )
}
