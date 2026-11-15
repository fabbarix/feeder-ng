// B9-44 (TB-09, TB-11): the Leftovers tile on Today, in its own file (re-exported from TodayTiles).
import { useId, type ReactNode } from 'react'
import { ListRow, Tile, TileHeader, TileHeaderLink, TileRows } from '../../../ui'
import { LeftoverItems } from '../../../ui/LeftoverActions/LeftoverItems'
import type { LeftoverActionKind, LeftoverAnswer } from '../../../lib/leftovers/types'
import type { Leftover as LeftoverFull } from '../../../lib/leftovers/types'
import type { LeftoverFlow } from '../../../lib/leftovers/useLeftoverFlow'
import { tileRows } from '../../../lib/leftovers/rows'
import { asLeftover, leftoverRows } from '../lib/leftovers'
import { planStrings as s } from '../strings'
import type { Leftover } from '../types'
import '../plan.css'

/** The TileHeader badge tone, spread (the native-controls check reads a tone attribute on a Tile-named element as the legacy prop). */
const LEFTOVER_BADGE = { tone: 'leftover' } as const

export interface LeftoversTileProps {
  leftovers: Leftover[]
  today: string
  /** The tile's tone: "info" while a question is open (round 2), else the Leftover tone. */
  tone?: 'info' | 'leftover'
  /** B5-LOW: the rows act in place: a question answers (after the dry run); pressing a row opens its Leftover's actions (TB-11). */
  flow?: LeftoverFlow
}

/**
 * Today: the Leftovers, soonest Use-by first. A status tile in the Leftover tone with the shared header (a leftover badge, the title
 * "Leftovers" that names the section, a count, the link "Pantry ›" to the Pantry's Leftovers). Its rows are ListRows in a `ul`
 * ("Use by Thu · 2 portions", DS 5, in the spoil tone when due today or tomorrow); with a flow, pressing anywhere on a row opens the
 * Leftover's actions (Had it, Threw it out, Freeze it), and a question keeps its inline answers. Renders nothing when there are none.
 */
export function LeftoversTile({ leftovers, today, flow, tone = 'leftover' }: LeftoversTileProps): ReactNode {
  const titleId = useId()
  // With a flow the frozen Leftovers that are not to answer stay on the Pantry: the tile lists what it shows.
  const full = leftovers.map(asLeftover)
  const shown = flow ? tileRows(full, today, flow.plannedFor) : []
  const rows = flow ? [] : leftoverRows(leftovers, today)
  const count = flow ? shown.length : rows.length
  if (count === 0) return null
  return (
    <Tile as="section" variant="status" status={tone} className="plan-leftovers" aria-labelledby={titleId}>
      <TileHeader
        icon="leftover"
        {...LEFTOVER_BADGE}
        title={s.leftoversTileTitle}
        titleId={titleId}
        count={count}
        countLabel={s.leftoversCount(count)}
        action={<TileHeaderLink to="/pantry?leftovers=1" label={s.pantryLink} context={s.leftoversTileTitle} />}
      />
      <TileRows className="plan-leftovers__list">
        {flow ? (
          <LeftoverItems
            leftovers={full}
            today={today}
            busy={flow.busy}
            plannedFor={flow.plannedFor}
            onAction={(kind: LeftoverActionKind, l: LeftoverFull) => flow.openSheet(kind, l)}
            onAnswer={(l: LeftoverFull, answer: LeftoverAnswer) => void flow.answer(l, answer)}
            onPress={(l: LeftoverFull) => flow.openDetails(l.id)}
          />
        ) : (
          rows.map((row) => <ListRow key={row.id} title={row.recipeName} meta={s.leftoverRowMeta(row.portions, row.useBy)} />)
        )}
      </TileRows>
    </Tile>
  )
}
