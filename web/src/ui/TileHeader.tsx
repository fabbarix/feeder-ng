import type { ReactNode } from 'react'
import type { StatusName } from '../theme/palette'
import { Chip } from './Chip'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { SectionTitle } from './SectionTitle'
import './TileHeader.css'

/** The badge tone: neutral, info, or a status (warn included). */
export type TileHeaderTone = 'neutral' | 'info' | StatusName

export interface TileHeaderProps {
  icon: IconName
  /** The badge tone; default neutral. On a status tile the badge is a surface disc with the icon in the tone. */
  tone?: TileHeaderTone
  title: ReactNode
  /** Title level, as authored; default h2. */
  as?: 'h2' | 'h3'
  /** A count Chip after the title (0 is shown). */
  count?: number
  /** The count's accessible name when the number alone does not say what it counts, e.g. "3 items". */
  countLabel?: string
  /** A trailing IconButton, Menu or link. */
  action?: ReactNode
}

/**
 * The title row of a tile (DS-07, system.md 9: the To confirm row): a 2rem icon badge in the tile's tone or neutral, the
 * SectionTitle on one line, a count Chip and an optional trailing action. The tile owns the section and its outline.
 */
export function TileHeader({ icon, tone = 'neutral', title, as = 'h2', count, countLabel, action }: TileHeaderProps) {
  return (
    <div className="tile-header">
      <span className="tile-header__badge" data-tone={tone}>
        <Icon name={icon} size={20} />
      </span>
      <SectionTitle as={as}>{title}</SectionTitle>
      {count === undefined ? null : (
        <Chip kind="count" label={countLabel}>
          {count}
        </Chip>
      )}
      {action ? <div className="tile-header__action">{action}</div> : null}
    </div>
  )
}
