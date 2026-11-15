import type { ReactNode } from 'react'
import { Chip } from '../../../ui'

/** B9-46 (PC-08): in a Meal Slot's header, "Ben away" (a part-day Away, info text) or the info chip "Everyone is away". */
export function SlotAwayLabel({ text, everyone }: { text: string; everyone: boolean }): ReactNode {
  return (
    <span className="plan-slot-head__away" data-tone="info" data-everyone={everyone ? 'true' : undefined}>
      {everyone ? (
        <Chip kind="state" status="info">
          {text}
        </Chip>
      ) : (
        text
      )}
    </span>
  )
}
