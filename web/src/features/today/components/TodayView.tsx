import type { ReactElement, ReactNode } from 'react'
import { TileErrorBoundary } from '../../../app/TileErrorBoundary'
import { Button, EmptyState, ErrorState, LoadState, PageHeader } from '../../../ui'
import { SkeletonBlock } from '../../../ui/Skeleton'
import { halfTiles } from '../lib/halves'
import type { RememberedLayout } from '../lib/layoutMemory'
import { tileQueryKeys, tileTitle } from '../lib/tiles'
import { todayStrings as s } from '../strings'
import type { TileId, TodayLayout } from '../types'
import '../today.css'

export interface TodayViewProps {
  layout: TodayLayout
  loading?: boolean
  /** B9-44 (RES-05): the plan has no data yet: Today draws the remembered shape (`remembered`) instead of any tile. */
  planLoading?: boolean
  /**
   * B9-44 (RES-05): the plan is in but Today's other reads are not (Advance Steps, the streak, Lines to get, Stock): the plan's own tiles
   * at the top show, and the rest of the remembered shape stands in for the others until they all arrive, in their order.
   */
  holding?: boolean
  /** The shape of the last layout Today showed (lib/layoutMemory), drawn while the plan loads. */
  remembered?: RememberedLayout
  /** Subtitle under the title, the Household date ("Tue 10 Nov"); null = not known yet (first launch ever): a reserved meta skeleton. */
  dateLabel?: string | null
  /** One element per tile id (built by TodayScreen from the owning features' components). */
  tiles: Partial<Record<TileId, ReactNode>>
  /** Where the empty state's button goes. */
  onOpenPlan: () => void
  /** Where the error's Try again goes. */
  onRetry?: () => void
  /** B9-39 (RES-02): offline and the plan never loaded: the LoadState under the header, and no tile, no empty state, no error. */
  offlineUnknown?: boolean
  /** B9-39 (TB-01): the polite announcement "Lunch moved to To confirm." (empty when there is nothing to say). */
  announce?: string
  /** B9-44 (PC-02): the cook flows' ONE Stock-shortfall notice, under To confirm (it renders nothing when nothing was short). */
  notice?: ReactNode
}

/** Tiles that take the whole row in the skeleton too (the hero is its own block). */
const FULL: readonly TileId[] = ['shopping', 'setup', 'toConfirm', 'couldntPlan', 'spoiled', 'metrics']
const ASIDE: readonly TileId[] = ['advanceSteps', 'metrics']
/** The tiles that show as soon as the plan is in (the top of Today); the others wait for the rest of Today's reads. */
const TOP: readonly TileId[] = ['shopping', 'setup', 'nextMeal', 'toConfirm']
const FIRST_LAUNCH: RememberedLayout = { tiles: [{ id: 'nextMeal' }, { id: 'toConfirm', rows: 1 }] }

/**
 * Renders a layout (B9-44, TB-03, ADR 0026): heading "Today" with the Household date, then Today's own grid, a group named "Today" (also a
 * `.bento-grid`, with no minimum: its columns come from the container in today.css). One `.today__slot[data-tile]` per tile that has
 * something to render, each in a TileErrorBoundary (RES-09: a crashed tile says so and the rest works), and one `.today__aside` with the
 * aside's slots right after To confirm. While the plan loads it draws the remembered shape (RES-05) and no tile. When layout.empty, the
 * EmptyState shows above the grid (so the metric strip stays visible).
 */
export function TodayView({
  layout,
  loading = false,
  planLoading = false,
  holding = false,
  remembered,
  dateLabel,
  tiles,
  onOpenPlan,
  onRetry,
  offlineUnknown = false,
  announce = '',
  notice,
}: TodayViewProps): ReactElement {
  const subtitle = dateLabel === null ? <SkeletonBlock variant="meta" /> : dateLabel
  if (offlineUnknown) {
    return (
      <section className="today">
        <PageHeader title={s.title} subtitle={subtitle} />
        <LoadState title={s.offlineUnknownTitle} text={s.offlineUnknownText} />
      </section>
    )
  }
  const all = layout.tiles.map((t) => t.id).filter((id) => Boolean(tiles[id]))
  const shown = holding ? all.filter((id) => TOP.includes(id)) : all
  const aside = (layout.aside ?? []).filter((id) => shown.includes(id))
  const halves = halfTiles(shown)
  const slot = (id: TileId) => (
    <div
      key={id}
      className="today__slot"
      data-tile={id}
      data-half-last-2={id === halves.two.at(-1) ? 'true' : undefined}
      data-half-last-3={id === halves.three.at(-1) ? 'true' : undefined}
    >
      <TileErrorBoundary title={tileTitle(id)} queryKeys={tileQueryKeys(id)}>
        {tiles[id]}
      </TileErrorBoundary>
    </div>
  )
  return (
    <section className="today" aria-busy={loading ? true : undefined}>
      <PageHeader title={s.title} subtitle={subtitle} />
      {/* TB-01: a slot that joins To confirm takes no focus; this says so. Always in the page, so a change is announced. */}
      <p className="to-confirm__announce" aria-live="polite">
        {announce}
      </p>
      {layout.failed && !loading ? <ErrorState message={s.loadError} onRetry={onRetry} /> : null}
      {layout.empty && !loading ? (
        <EmptyState title={s.emptyTitle} description={s.emptyHint} action={<Button onClick={onOpenPlan}>{s.emptyAction}</Button>} />
      ) : null}
      <div
        className="bento-grid today__grid"
        role="group"
        aria-label={s.gridLabel}
        data-halves-odd={!planLoading && halves.two.length % 2 === 1 ? 'true' : undefined}
        data-halves-3={planLoading ? undefined : String(halves.three.length)}
      >
        {planLoading ? (
          <TodaySkeleton remembered={remembered ?? FIRST_LAUNCH} />
        ) : (
          <>
            {shown.filter((id) => !aside.includes(id)).flatMap((id) => {
              const out = [slot(id)]
              if (id === 'toConfirm' && notice) out.push(noticeOf(notice))
              if (id === 'toConfirm' && aside.length > 0) out.push(asideOf(aside, slot))
              return out
            })}
            {notice && !shown.includes('toConfirm') ? noticeOf(notice) : null}
            {aside.length > 0 && !shown.includes('toConfirm') ? asideOf(aside, slot) : null}
            {holding ? <TodaySkeleton remembered={{ tiles: (remembered ?? FIRST_LAUNCH).tiles.filter((t) => !TOP.includes(t.id)) }} /> : null}
          </>
        )}
      </div>
    </section>
  )
}

function noticeOf(notice: ReactNode): ReactElement {
  return (
    <div key="notice" className="today__notice">
      {notice}
    </div>
  )
}

function asideOf(aside: TileId[], slot: (id: TileId) => ReactElement): ReactElement {
  return (
    <div key="aside" className="today__aside">
      {aside.map(slot)}
    </div>
  )
}

/** RES-05: the remembered shape: the hero block, each tile's header and rows of 56 px, the metric tile; one hidden "Loading Today". */
function TodaySkeleton({ remembered }: { remembered: RememberedLayout }): ReactElement {
  const block = (id: TileId, rows = 0) =>
    id === 'nextMeal' ? (
      <span key={id} className="today-skeleton__hero" data-tile={id} data-full="true" aria-hidden="true" />
    ) : id === 'metrics' ? (
      <span key={id} className="today-skeleton__metric" data-tile={id} data-full="true" aria-hidden="true" />
    ) : (
      <span key={id} className="today-skeleton__tile" data-tile={id} data-full={FULL.includes(id) ? 'true' : undefined} aria-hidden="true">
        <span className="today-skeleton__head">
          <SkeletonBlock variant="line" />
        </span>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className="today-skeleton__row">
            <SkeletonBlock variant="row" />
          </span>
        ))}
      </span>
    )
  const all = remembered.tiles
  const aside = all.filter((t) => ASIDE.includes(t.id))
  const items: ReactElement[] = []
  for (const t of all) {
    if (ASIDE.includes(t.id)) continue
    items.push(block(t.id, t.rows ?? 0))
    if (t.id === 'toConfirm' && aside.length > 0) items.push(<span key="aside" className="today__aside">{aside.map((a) => block(a.id, a.rows ?? 0))}</span>)
  }
  if (aside.length > 0 && !all.some((t) => t.id === 'toConfirm')) items.push(<span key="aside" className="today__aside">{aside.map((a) => block(a.id, a.rows ?? 0))}</span>)
  return (
    <div className="today-skeleton" role="status">
      <span className="visually-hidden">{s.loadingToday}</span>
      {items}
    </div>
  )
}
