// The lists of a Couldn't plan Exclusion tile (CouldntPlanExclusionTile): the cells it applies to, who eats it (Member pills) and one row
// per Exclusion. Split out of the tile file (B9-55): rows, pills and focusable cells, not bullet sentences. Renders only.
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, ListGroup, ListRow, MemberPill } from '../../../ui'
import { recordAction, recordDetail, recordText, type ExplanationGroup, type RecordPart } from '../lib/couldntExclusions'
import { planStrings as s } from '../strings'
import type { ExclusionRecord } from '../types'

/** The cells the explanation applies to; each is focusable (tabindex -1) so the URL hash can land on it. */
export function ExclusionCells({ id, items }: { id: string; items: ExplanationGroup['items'] }): ReactNode {
  return (
    <ul id={id} aria-label={s.couldntExclusions.whereApplies} className="plan__list">
      {items.map((item) => (
        <li key={item.key} id={item.id} tabIndex={-1}>
          {item.text}
        </li>
      ))}
    </ul>
  )
}

/** Who eats it: one Member pill each. */
export function EaterPills({ members }: { members: ExplanationGroup['attendance'] }): ReactNode {
  return (
    <ul aria-label={s.couldntExclusions.whoEatsIt} className="plan__pills">
      {members.map((m) => (
        <li key={m.id}>
          <MemberPill name={m.name} colour={m.colour} glyph={m.avatar} photoUrl={m.photoUrl} />
        </li>
      ))}
    </ul>
  )
}

/** One ListRow per Exclusion, then "and N more Exclusions". */
export function ExclusionRecords({ records, more }: { records: ExclusionRecord[]; more: number }): ReactNode {
  return (
    <ListGroup label={s.couldntExclusions.exclusions}>
      {records.map((record) => (
        <ExclusionRow key={exclusionKey(record)} record={record} />
      ))}
      {more > 0 ? <li className="plan__muted">{s.couldntExclusions.moreExclusions(more)}</li> : null}
    </ListGroup>
  )
}

/** A stable key within one Tile: a Member's Exclusion of one Ingredient, or the Recipes they rule out directly. */
function exclusionKey(record: ExclusionRecord): string {
  const what = record.ingredient ? `ingredient-${record.ingredient.id}` : `recipes-${record.recipes.map((r) => r.id).join('-')}`
  return `${record.member.id}-${what}`
}

/** The Recipes and names of a first line: links where the parts have a `to`. */
function Parts({ parts }: { parts: RecordPart[] }): ReactNode {
  return parts.map((p, i) => {
    if (p.to) return <Link key={`${i}-${p.text}`} to={p.to}>{p.text}</Link>
    return p.strong ? <strong key={`${i}-${p.text}`}>{p.text}</strong> : <span key={`${i}-${p.text}`}>{p.text}</span>
  })
}

/** One Exclusion: the Member's Avatar, the first line, what an Ingredient rules out, and "Review garlic". */
function ExclusionRow({ record }: { record: ExclusionRecord }): ReactNode {
  const detail = recordDetail(record)
  const action = recordAction(record)
  return (
    <ListRow
      wrapTitle
      title={<Parts parts={recordText(record)} />}
      meta={detail ?? undefined}
      leading={<Avatar name={record.member.name} imageUrl={record.member.photoUrl} size="md" colour={record.member.colour} glyph={record.member.avatar} />}
      trailing={
        action ? (
          <Link className="button" data-variant="secondary" data-size="sm" to={action.to}>
            {action.label}
          </Link>
        ) : undefined
      }
    />
  )
}
