/**
 * The Pantry screen (route /pantry, with /stock redirecting to it; the page is called Pantry, its contents are Stock): by default every
 * Stock Lot grouped by Storage Place (usePantry, PantryLotRow, LotSheet with "Move to"), or "By Ingredient" the per-Ingredient totals.
 *
 * Layout (ui-fix-plan 2.6, 5.7; docs/design/pantry-filter.md 3), top to bottom:
 * - `PageHeader title="Pantry"` with actions: secondary sm "Stock-take" (icon `scan`), primary sm "Add to Stock" (icon `add`, the one
 *   accent action) and the More menu ("Storage Places").
 * - L-06: from 1280 px a two-column `.stock-screen__layout`: a sticky `<aside aria-label="Filter Stock">` (SpoiledTile, then the filter
 *   header) beside `.stock-screen__main` (the list). One tree: on a phone the aside simply comes first.
 * - The filter header (pantry-filter), only when status is 'ready': row 1 Search Stock + Filters; row 2 the List control + Sort (By
 *   Storage Place); row 3 the active filter chips. The filters are chosen in the Filters panel and live in the URL (usePantryFilters).
 * - The list: the Storage Place groups, or a `ListGroup label="Stock"` of IngredientLotsRow. If the filters leave nothing: EmptyState
 *   "Nothing in Stock matches".
 * Status (from useStockTotals().status): loading -> Skeleton; error -> ErrorState with Try again; offline -> EmptyState "Stock is not
 * saved on this device yet"; empty -> EmptyState "Nothing in Stock yet" + hint; ready -> the list.
 * A failed change shows an error toast. No `<main>`: the shell provides it. No tile grid.
 */
import { useId, useMemo, useRef, useState, type ReactElement } from 'react'
import { ActiveFilterChips, BottomSheet, Button, EmptyState, ErrorState, FiltersButton, ListGroup, PageHeader, SearchField, Skeleton, useMediaQuery, useToast } from '../../../ui'
import { AddLotSheet } from '../components/AddLotSheet'
import { IngredientLotsRow } from '../components/IngredientLotsRow'
import { LotEditSheet } from '../components/LotEditSheet'
import { LotList } from '../components/LotList'
import { LotSheet } from '../components/LotSheet'
import { PantryFiltersPanel } from '../components/PantryFiltersPanel'
import { PantryModeControl } from '../components/PantryModeControl'
import { PantryOverflowMenu } from '../components/PantryOverflowMenu'
import { PantrySortSelect } from '../components/PantrySortSelect'
import { PantryLotRow } from '../components/PantryLotRow'
import { useOpenIngredients } from '../hooks/useOpenIngredients'
import { usePantry } from '../hooks/usePantry'
import { usePantryFilters } from '../hooks/usePantryFilters'
import { useStoragePlaces } from '../hooks/useStoragePlaces'
import type { StockLot } from '../types'
import { SetTotalSheet } from '../components/SetTotalSheet'
import { SpoiledTile } from '../components/SpoiledTile'
import { useIngredientChoices } from '../hooks/useIngredientChoices'
import { LeftoverRow } from '../../../ui/LeftoverActions/LeftoverRow'
import { LeftoverSheets } from '../../../ui/LeftoverActions/LeftoverSheets'
import { useStockActions, useSpoiledLots, useStockLots, useStockTotals } from '../hooks/useStock'
import { useStockTakeEntry } from '../hooks/useStockTakeEntry'
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

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [settingTotal, setSettingTotal] = useState(false)
  const [adding, setAdding] = useState(false)
  const lots = useStockLots(selectedId)
  // The household's date comes from the server with the lots; go-off wording uses it.
  const today = spoiled.today ?? lots.today ?? pantry.lots.today ?? ''
  // B5-LOW: the frozen Leftovers sit in the Storage Place sections (usePantry owns the flow).
  const leftovers = pantry.leftovers
  const sections = leftovers.sections

  const items = useMemo(() => filterTotals(sortTotals(totals.data ?? []), applied.status, query), [totals.data, applied.status, query])
  const selected = (totals.data ?? []).find((i) => i.ingredientId === selectedId) ?? null
  const spoiledLots = spoiled.data ?? []
  // The aside is a 24 rem column from 1280 px: the spoiled rows keep their actions under the text there.
  const twoColumns = useMediaQuery('(min-width: 1280px)')
  const ready = totals.status === 'ready'
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
            <Button variant="secondary" size="sm" icon="scan" onClick={openStockTake}>
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
              stacked={twoColumns}
              onThrowOut={(id) => void attempt(() => spoiled.throwOut(id))}
              onKeep={(id) => void attempt(() => spoiled.keep(id))}
            />
            {ready ? (
              <div className="filter-bar">
                <div className="filter-bar__row filter-bar__search-row">
                  <SearchField label={strings.searchLabel} value={query} onChange={setQuery} />
                  <FiltersButton
                    ref={filtersAnchor}
                    count={filters.count}
                    expanded={panelOpen}
                    controls={panelOpen ? panelId : undefined}
                    onClick={() => setPanelOpen((open) => !open)}
                  />
                </div>
                <div className="filter-bar__row filter-bar__view-row">
                  <PantryModeControl value={mode} onChange={filters.setMode} />
                  {mode === 'places' ? (
                    <div className="filter-bar__sort">
                      <PantrySortSelect value={sort} onChange={filters.setSort} />
                    </div>
                  ) : null}
                </div>
                <ActiveFilterChips chips={filters.chips} onRemove={filters.remove} onMore={() => setPanelOpen(true)} fallbackFocus={filtersAnchor} />
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
          ) : totals.status === 'empty' && leftovers.frozenCount === 0 ? (
            <EmptyState icon="stock" title={strings.empty} description={strings.emptyHint} />
          ) : mode === 'places' ? (
            sections.length === 0 ? (
              <EmptyState title={strings.noMatch} description={strings.noMatchHint} />
            ) : (
              <div className="pantry-groups">
                {sections.map((section) => {
                  const name = section.key === -1 ? strings.lotsLabel : section.name
                  // A group of Leftovers only has no Stock Lots to count.
                  const label = section.lots.length === 0 && section.leftovers.length > 0 ? name : strings.groupLabel(name, section.lots.length)
                  return (
                    <ListGroup key={section.key} label={label}>
                      {section.lots.map((lot) => (
                        <PantryLotRow
                          key={lot.id}
                          lot={lot}
                          today={today}
                          system={system}
                          placeName={groupByPlace ? undefined : (pantry.placeOf(lot)?.name ?? strings.unsorted)}
                          onOpen={setOpenLot}
                        />
                      ))}
                      {section.leftovers.map((leftover) => (
                        <LeftoverRow
                          key={`leftover-${leftover.id}`}
                          leftover={leftover}
                          today={today}
                          onAction={(kind, leftover) => leftovers.flow.openSheet(kind, leftover)}
                          showPlace={!groupByPlace}
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
        onEdit={(lot) => setEditingLot(lot)}
        onDelete={(lot) => {
          setOpenLot(null)
          void attempt(async () => {
            await actions.deleteLot(lot.id)
            toast.show(strings.deleted(lot.ingredientName), { status: 'success' })
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
