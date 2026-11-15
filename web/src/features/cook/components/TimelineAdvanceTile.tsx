import type { ReactNode } from 'react'
import { Icon, Tile } from '../../../ui'
import { advanceLine } from '../lib/advance'
import type { AdvanceGroup } from '../lib/timeline'
import { cookStrings } from '../strings'
import { AdvanceChip, AdvanceLine, AdvanceRows, type AdvanceRowItem } from './AdvanceParts'

export interface TimelineAdvanceTileProps {
  groups: AdvanceGroup[]
  /** The Advance Step's own scope and Recipe Step index. */
  onMarkDone: (scope: string, step: number) => void
  /** B9-40 (SHORT-01): the chip and sheet of short landscape. */
  compact?: boolean
  /** B9-40 (PC-03): on an item after the first the Advance Steps of every Course are one info line (lib/advance advanceLine over all of them). */
  collapsed?: boolean
}

function rows(group: AdvanceGroup, onMarkDone: (scope: string, step: number) => void): AdvanceRowItem[] {
  return group.items.map((item) => ({
    key: `${item.scope}/${item.step}`,
    text: item.text,
    done: item.done,
    leadTimeMinutes: item.leadTimeMinutes,
    baseRecipe: item.baseRecipe,
    onMarkDone: () => onMarkDone(item.scope, item.step),
  }))
}

function Groups({ groups, onMarkDone }: Pick<TimelineAdvanceTileProps, 'groups' | 'onMarkDone'>): ReactNode {
  return groups.map((group) =>
    group.named ? (
      <section key={group.courseId} role="group" aria-label={group.courseName}>
        <h3 className="cook-advance__course">{group.courseName}</h3>
        <AdvanceRows label={group.courseName} items={rows(group, onMarkDone)} />
      </section>
    ) : (
      <div key={group.courseId}>
        <AdvanceRows label={cookStrings.advanceHeading} items={rows(group, onMarkDone)} />
      </div>
    ),
  )
}

/**
 * The Advance Steps of every Course above the timeline, in the info tone (DS 3), grouped by Course (a named group has its Course
 * name as a sub-heading). Nothing when nothing is pending. `collapsed`: one info line over every Course; `compact`: the chip.
 */
export function TimelineAdvanceTile({ groups, onMarkDone, compact = false, collapsed = false }: TimelineAdvanceTileProps): ReactNode {
  const all = groups.flatMap((g) => g.items)
  const summary = { done: all.filter((i) => i.done), pending: all.filter((i) => !i.done) }
  if (compact) {
    return (
      <AdvanceChip pending={summary.pending.length}>
        <Groups groups={groups} onMarkDone={onMarkDone} />
      </AdvanceChip>
    )
  }
  if (collapsed) return <AdvanceLine text={advanceLine(summary)} />
  if (summary.pending.length === 0) return null
  return (
    <Tile as="section" variant="status" status="info" span="full" className="cook-advance">
      <h2 className="cook-advance__heading">
        <Icon name="advanceStep" size={16} />
        {cookStrings.advanceHeading}
      </h2>
      <Groups groups={groups} onMarkDone={onMarkDone} />
    </Tile>
  )
}
