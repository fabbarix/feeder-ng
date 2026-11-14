import type { ReactNode } from 'react'
import type { ChipStatus } from './Chip'
import type { IconName } from './icons'

// STUB (B9-02 test author): the developer replaces this with the real primitive (DS-07). It exists only so the tests compile.
export interface TileHeaderProps {
  icon: IconName
  /** The badge tone: a status or `neutral`. Default neutral. */
  tone?: 'neutral' | 'warn' | ChipStatus
  title: ReactNode
  /** Title level; default h2. */
  as?: 'h2' | 'h3'
  /** A count Chip after the title. */
  count?: number
  /** A trailing IconButton or Menu. */
  action?: ReactNode
}

export function TileHeader(_props: TileHeaderProps): ReactNode {
  return null
}
