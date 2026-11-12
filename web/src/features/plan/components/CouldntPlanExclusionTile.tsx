import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Button, ListGroup, MemberPill, Tile } from '../../../ui'
import { optOutLine, recordAction, recordDetail, recordText, type ExplanationGroup, type RecordPart } from '../lib/couldntExclusions'
import { planStrings as s } from '../strings'
import type { ExclusionRecord } from '../types'
import '../plan.css'

export interface CouldntPlanExclusionTileProps {
  group: ExplanationGroup
  expanded: boolean
  onToggle: () => void
  /** The id of the cell to focus (the URL hash), when it is in this group. */
  focusId?: string | null
}

/**
 * One explanation: the cells, who eats it, who opts out, and one row per Exclusion with its links. The cells are behind
 * "Show all N" when there are several; a Tile of one cell always shows its line. Renders only (lib/couldntExclusions).
 */
export function CouldntPlanExclusionTile({ group, expanded, onToggle, focusId = null }: CouldntPlanExclusionTileProps): ReactNode {
  const headingId = useId()
  const listId = useId()
  const ref = useRef<HTMLElement>(null)
  const single = group.items.length <= 1
  const showList = single || expanded

  // The cell the URL hash names takes focus once its list is on screen (the Tile opened for it).
  useEffect(() => {
    if (!focusId || !showList) return
    const line = ref.current?.querySelector<HTMLElement>(`[id="${focusId}"]`)
    if (!line) return
    line.focus()
    line.scrollIntoView?.({ block: 'center' })
  }, [focusId, showList])

  const optOut = optOutLine(group)
  return (
    <Tile as="section" ref={ref} aria-labelledby={headingId} variant="status" status="spoil" overline={s.couldntPlanTitle} overlineIcon="exclusion" className="plan-couldnt">
      <h2 id={headingId} className="plan__tile-title">
        {group.summary}
      </h2>
      {single ? null : (
        <div className="plan__row">
          <Button variant="tertiary" size="sm" aria-expanded={expanded} aria-controls={expanded ? listId : undefined} onClick={onToggle}>
            {expanded ? s.couldntExclusions.hideList : s.couldntExclusions.showAll(group.items.length)}
          </Button>
        </div>
      )}
      {showList ? (
        <ul id={listId} aria-label={s.couldntExclusions.whereApplies} className="plan__list">
          {group.items.map((item) => (
            <li key={item.key} id={item.id} tabIndex={-1}>
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="plan__caption">{s.couldntExclusions.whoEatsIt}</p>
      <ul aria-label={s.couldntExclusions.whoEatsIt} className="plan__pills">
        {group.attendance.map((m) => (
          <li key={m.id}>
            <MemberPill name={m.name} colour={m.colour} glyph={m.avatar} photoUrl={m.photoUrl} />
          </li>
        ))}
      </ul>
      {optOut ? <p className="plan__muted">{optOut}</p> : null}
      {group.exclusions === null ? (
        <p className="plan__muted">{s.couldntExclusions.stillWorking}</p>
      ) : (
        <ListGroup label={s.couldntExclusions.exclusions}>
          {group.exclusions.map((record, i) => (
            <ExclusionRow key={i} record={record} />
          ))}
          {group.moreExclusions > 0 ? <li className="plan__muted">{s.couldntExclusions.moreExclusions(group.moreExclusions)}</li> : null}
        </ListGroup>
      )}
    </Tile>
  )
}

/** The Recipes and names of a first line: links where the parts have a `to`. */
function Parts({ parts }: { parts: RecordPart[] }): ReactNode {
  return parts.map((p, i) => {
    if (p.to) return <Link key={i} to={p.to}>{p.text}</Link>
    if (p.strong) return <strong key={i}>{p.text}</strong>
    return <span key={i}>{p.text}</span>
  })
}

/** One Exclusion: the Member's Avatar, the first line, what an Ingredient rules out, and "Review garlic". */
function ExclusionRow({ record }: { record: ExclusionRecord }): ReactNode {
  const detail = recordDetail(record)
  const action = recordAction(record)
  return (
    <li className="list-row" data-height="auto">
      <span className="list-row__leading">
        <Avatar name={record.member.name} imageUrl={record.member.photoUrl} size="md" colour={record.member.colour} glyph={record.member.avatar} />
      </span>
      <span className="list-row__text">
        <span className="list-row__title">
          <Parts parts={recordText(record)} />
        </span>
        {detail ? <span className="list-row__meta">{detail}</span> : null}
      </span>
      {action ? (
        <span className="list-row__trailing">
          <Link to={action.to}>{action.label}</Link>
        </span>
      ) : null}
    </li>
  )
}
