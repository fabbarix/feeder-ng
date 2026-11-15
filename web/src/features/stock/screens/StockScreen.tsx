/**
 * The Pantry screen (route /pantry, with /stock redirecting to it; the page is called Pantry, its contents are Stock): by default every
 * Stock Lot grouped by Storage Place (usePantry, PantryLotRow, LotSheet with "Move to"), or "By Ingredient" the per-Ingredient totals.
 *
 * Layout (ui-fix-plan 2.6, 5.7; docs/design/pantry-filter.md 3), top to bottom:
 * - `PageHeader title="Pantry"` with actions: secondary sm "Stock-take" (icon `scan`), primary sm "Add to Stock" (icon `add`, the one
 *   accent action) and the More menu ("Storage Places").
 * - L-06: from 1280 px a two-column `.stock-screen__layout`: a sticky `<aside aria-label="Filter Stock">` (SpoiledTile, then the filter
 *   header) beside `.stock-screen__main` (the list). One tree: on a phone the aside simply comes first.
 * - The filter header (pantry-filter), while the list loads or shows (ready, or its saved copy offline): row 1 Search Stock + Filters; row 2 the List control + Sort (By
 *   Storage Place); row 3 the active filter chips. The filters are chosen in the Filters panel and live in the URL (usePantryFilters).
 * - The list: the Storage Place groups, or a `ListGroup label="Stock"` of IngredientLotsRow. If the filters leave nothing: EmptyState
 *   "Nothing in Stock matches".
 * State (B9-20, from useStockTotals().state): loading -> Skeleton; failed -> ErrorState with Try again; offlineUnknown -> LoadState
 * "Your Stock isn’t on this phone yet"; empty -> EmptyState "Nothing in Stock yet" + hint; ready or offlineSaved -> the list.
 * A failed change shows an error toast. No `<main>`: the shell provides it. No tile grid.
 */
import { useCallback, useId, useMemo, useRef, useState, type ReactElement } from 'react'
import { combineScreenStates } from '../../../lib/dataState'
import { BottomSheet, Button, EmptyState, ErrorState, ListGroup, LoadState, PageHeader, useToast } from '../../../ui'
import { SkeletonGroup, SkeletonList } from '../../../ui/Skeleton'
import { AddLotSheet } from '../components/AddLotSheet'
import { IngredientLotsRow } from '../components/IngredientLotsRow'
import { LotEditSheet } from '../components/LotEditSheet'
import { LotList } from '../components/LotList'
import { LotSheet } from '../components/LotSheet'
import { PantryFiltersPanel } from '../components/PantryFiltersPanel'
import { PantryFilterHeader } from '../components/PantryFilterHeader'
import { PantryOverflowMenu } from '../components/PantryOverflowMenu'
import { PantryPlaceGroups } from '../components/PantryPlaceGroups'
import { KeepDateSheet } from '../components/KeepDateSheet'
import { PutAwaySheet } from '../components/PutAwaySheet'
import { useLotParam, usePutAwayParam } from '../hooks/useLotParam'
import { usePutAway } from '../hooks/usePutAway'
import { useSpoiledFlow } from '../hooks/useSpoiledFlow'
import { useOpenIngredients } from '../hooks/useOpenIngredients'
import { usePantry } from '../hooks/usePantry'
import { usePantryFilters } from '../hooks/usePantryFilters'
import { useStoragePlaces } from '../hooks/useStoragePlaces'
import type { StockLot } from '../types'
import { SetTotalSheet } from '../components/SetTotalSheet'
import { SpoiledTile } from '../components/SpoiledTile'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import { useStockActions, useSpoiledLots, useStockLots, useStockTotals } from '../hooks/useStock'
import { useStockTakeEntry } from '../hooks/useStockTakeEntry'
import { useSupplyRestock } from '../hooks/useSupplyRestock'
import { capitalise } from '../lib/display'
import { lotsOfIngredient } from '../lib/ingredientLots'
import { filterTotals } from '../lib/filter'
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
  // The view and the filters live in the URL (?view, ?status, ?place, ?kind, ?leftovers, ?sort, ?group); the search is this screen's.
  const filters = usePantryFilters(useStoragePlaces().places)
  const { mode } = filters
  const [query, setQuery] = useState('')
  const { applied, sort, groupByPlace } = filters
  const pantry = usePantry({ filters, query })
  const [panelOpen, setPanelOpen] = useState(false)
  const filtersAnchor = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const [openLot, setOpenLot] = useState<StockLot | null>(null)
  const [editingLot, setEditingLot] = useState<StockLot | null>(null)
  const openIngredients = useOpenIngredients()
  const putAway = usePutAway()
  // SSP-10: the Not sorted Lots the Put away sheet opened over (null = closed).
  const [puttingAway, setPuttingAway] = useState<StockLot[] | null>(null)

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingTotal, setSettingTotal] = useState(false)
  const [adding, setAdding] = useState(false)
  const lots = useStockLots(selectedId)
  // The household's date comes from the server with the lots; go-off wording uses it.
  const today = spoiled.today ?? lots.today ?? pantry.lots.today ?? ''
  // B5-LOW: the frozen Leftovers sit in the Storage Place sections (usePantry owns the flow).
  const leftovers = pantry.leftovers
  const sections = leftovers.sections

  const items = useMemo(() => filterTotals(sortTotals(totals.data ?? []), applied.status, query, applied.stock), [totals.data, applied.status, applied.stock, query])
  // H6: a Supply's Restock level and Stock, and whether the Household has a Supply (the Food or Supplies filter).
  const { restockFor, hasSupplies } = useSupplyRestock(choices.choices, pantry.lots.data)
  const selected = (totals.data ?? []).find((i) => i.ingredientId === selectedId) ?? null
  const spoiledLots = spoiled.data ?? []
  // SAFE-09, SSP-17: Throw out and Keep act at once, with Undo (and Change for Keep).
  const flow = useSpoiledFlow({ system, today, keep: spoiled.keep, undoKeep: spoiled.undoKeep })
  const spoiledCalls = useMemo(() => ({ throwOut: spoiled.throwOut, undoThrowOut: spoiled.undoThrowOut }), [spoiled.throwOut, spoiled.undoThrowOut])
  const lotCalls = useMemo(() => ({ throwOut: actions.throwOut, undoThrowOut: actions.undoThrowOut }), [actions.throwOut, actions.undoThrowOut])
  // TB-11: /pantry?lot=<id> opens that Lot.
  useLotParam(pantry.lots.data, useCallback((lot: StockLot) => setOpenLot(lot), []))
  // B9-43 (SSP-09): /pantry?putAway=1 (the Shop's complete tile) opens the Put away sheet over the Not sorted Lots.
  const putAwayParam = usePutAwayParam(pantry.lots.data, setPuttingAway)
  // B9-20 (RES-02): the Storage Place view lists the Lots, so it waits for them as well as for the totals.
  const listState = mode === 'places' ? combineScreenStates(totals.state, pantry.lots.state) : totals.state
  // B9-20 (RES-02): the filter header shows while the list loads too (the skeleton then sits where the list will be, so
  // nothing jumps when it arrives) and over a saved copy offline; not over an empty, unknown or failed list.
  const ready = totals.state === 'loading' || totals.state === 'ready' || totals.state === 'offlineSaved'
  // No empty aside: it exists when something is spoiled or the filter header is shown.
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
            <Button variant="secondary" size="sm" icon="scan" iconOnly="narrow" onClick={openStockTake}>
              {strings.stockTake}
            </Button>
            <Button size="sm" icon="add" onClick={() => setAdding(true)}>
              {strings.add}
            </Button>
            <PantryOverflowMenu />
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
              onThrowOut={(id) => {
                const lot = spoiledLots.find((l) => l.id === id)
                if (lot) void flow.throwOut(lot, spoiledCalls)
              }}
              onKeep={(id) => {
                const lot = spoiledLots.find((l) => l.id === id)
                if (lot) void flow.keep(lot)
              }}
            />
            {ready ? (
              <PantryFilterHeader
                query={query}
                onQuery={setQuery}
                filtersAnchor={filtersAnchor}
                count={filters.count}
                panelOpen={panelOpen}
                panelId={panelId}
                onTogglePanel={() => setPanelOpen((open) => !open)}
                onOpenPanel={() => setPanelOpen(true)}
                mode={mode}
                onMode={filters.setMode}
                sort={sort}
                onSort={filters.setSort}
                chips={filters.chips}
                onRemoveChip={filters.remove}
              />
            ) : null}
          </aside>
        ) : null}

        <div className="stock-screen__main">
          {listState === 'loading' ? (
            <SkeletonGroup label={strings.loading}>
              <SkeletonList rows={6} />
            </SkeletonGroup>
          ) : listState === 'failed' ? (
            <ErrorState message={strings.errorMessage} onRetry={() => void Promise.all([totals.refetch(), pantry.lots.refetch()])} />
          ) : listState === 'offlineUnknown' ? (
            <LoadState title={strings.offlineTitle} text={strings.offlineHint} />
          ) : totals.state === 'empty' && leftovers.frozenCount === 0 ? (
            <EmptyState icon="stock" title={strings.empty} description={strings.emptyHint} />
          ) : mode === 'places' ? (
            sections.length === 0 ? (
              <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
            ) : (
              <PantryPlaceGroups
                sections={sections}
                places={pantry.places}
                groupByPlace={groupByPlace}
                today={today}
                system={system}
                placeOf={pantry.placeOf}
                restockFor={restockFor}
                onOpenLot={setOpenLot}
                onLeftover={(kind, leftover) => leftovers.flow.openSheet(kind, leftover)}
                onPutAway={setPuttingAway}
              />
            )
          ) : items.length === 0 ? (
            <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
          ) : (
            <ListGroup label={strings.listLabel}>
              {items.map((item) => (
                <IngredientLotsRow
                  key={item.ingredientId}
                  item={item}
                  lots={lotsOfIngredient(pantry.lots.data ?? [], item.ingredientId)}
                  places={pantry.places}
                  today={today}
                  system={system}
                  expanded={openIngredients.isOpen(item.ingredientId)}
                  onToggle={() => openIngredients.toggle(item.ingredientId)}
                  onOpenLot={setOpenLot}
                  restock={restockFor(item.ingredientId)}
                />
              ))}
            </ListGroup>
          )}
        </div>
      </div>

      <PantryFiltersPanel
        id={panelId}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        anchorRef={filtersAnchor}
        mode={mode}
        status={filters.status}
        onStatus={filters.setStatus}
        stock={filters.stock}
        onStock={filters.setStock}
        hasSupplies={hasSupplies}
        hasLeftovers={leftovers.frozenCount > 0}
        leftovers={filters.leftovers}
        onLeftovers={filters.setLeftovers}
        kinds={filters.kinds}
        onKind={filters.toggleKind}
        places={pantry.places}
        lots={pantry.lots.data ?? []}
        selectedPlaces={filters.places}
        onPlace={filters.togglePlace}
        groupByPlace={groupByPlace}
        onGroupByPlace={filters.setGroupByPlace}
        count={filters.count}
        onClear={filters.clear}
      />

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
          onThrowOut={(id) => {
            const lot = (lots.data ?? []).find((l) => l.id === id)
            if (lot) void flow.throwOut(lot, lotCalls)
          }}
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
        onClose={() => {
          setOpenLot(null)
          // B9-44 (TB-11): a sheet opened from ?lot= takes the parameter away when it closes, so the address no longer opens it.
          if (filters.lot !== null) filters.clearLot()
        }}
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
        onEdit={(lot) => setEditingLot(lot)}
        onDelete={(lot) => {
          setOpenLot(null)
          void attempt(async () => {
            await actions.deleteLot(lot.id)
            toast.show(strings.deleted(lot.ingredientName), { status: 'success' })
          })
        }}
        onUsedUp={(lot, used) => {
          setOpenLot(null)
          void attempt(async () => {
            await actions.usedUp(lot, used)
            toast.show(strings.usedUp.done(capitalise(lot.ingredientName)), { status: 'success' })
          })
        }}
      />

      <LotEditSheet
        lot={editingLot}
        today={today}
        onClose={() => setEditingLot(null)}
        onSubmit={(lot, patch) => {
          setEditingLot(null)
          void attempt(async () => {
            await actions.editLot(lot.id, patch)
            toast.show(strings.edited(lot.ingredientName), { status: 'success' })
          })
        }}
      />

      <LeftoverSheets flow={leftovers.flow} />

      <PutAwaySheet
        open={puttingAway !== null}
        onClose={() => {
          setPuttingAway(null)
          putAwayParam.clear()
        }}
        lots={puttingAway ?? []}
        places={pantry.places}
        today={today}
        system={system}
        onMove={putAway.putAway}
        onAllPutAway={() => toast.show(strings.putAway.allDone, { status: 'success' })}
        restockFor={restockFor}
      />

      <KeepDateSheet open={flow.changing !== null} lot={flow.changing} today={today} onClose={flow.closeChange} onKeep={flow.keepUntil} />

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
