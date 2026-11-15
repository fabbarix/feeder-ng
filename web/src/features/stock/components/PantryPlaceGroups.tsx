// The Pantry's Storage Place view (SSP-03): one titled group per Storage Place (kind icon, name, round count), Not sorted last with
// its one action "Put away"; ungrouped, one list named for assistive technology only. Render and wiring only.
import type { ReactElement } from 'react'
import { Button, ListGroup } from '../../../ui'
import { LeftoverRow } from '../../../ui/LeftoverActions/LeftoverRow'
import type { Leftover, LeftoverActionKind } from '../../../lib/leftovers/types'
import type { UnitSystem } from '../../../lib/units'
import { groupHeading } from '../lib/groupHeading'
import type { PantrySection } from '../lib/pantryLeftovers'
import type { Restock } from '../lib/supplies'
import { stockStrings as strings } from '../strings'
import type { StockLot, StoragePlace } from '../types'
import { PantryLotRow } from './PantryLotRow'

export interface PantryPlaceGroupsProps {
  sections: PantrySection[]
  places: StoragePlace[]
  groupByPlace: boolean
  today: string
  system: UnitSystem
  placeOf: (lot: StockLot) => StoragePlace | null
  restockFor: (ingredientId: number) => Restock | null
  onOpenLot: (lot: StockLot) => void
  onLeftover: (kind: LeftoverActionKind, leftover: Leftover) => void
  /** Opens the Put away sheet over the Not sorted Lots. */
  onPutAway: (lots: StockLot[]) => void
}

export function PantryPlaceGroups({ sections, places, groupByPlace, today, system, placeOf, restockFor, onOpenLot, onLeftover, onPutAway }: PantryPlaceGroupsProps): ReactElement {
  const rows = (section: PantrySection) => (
    <>
      {section.lots.map((lot) => (
        <PantryLotRow
          key={lot.id}
          lot={lot}
          today={today}
          system={system}
          placeName={groupByPlace ? undefined : (placeOf(lot)?.name ?? strings.unsorted)}
          restock={restockFor(lot.ingredientId)}
          onOpen={onOpenLot}
        />
      ))}
      {section.leftovers.map((leftover) => (
        <LeftoverRow key={`leftover-${leftover.id}`} leftover={leftover} today={today} onAction={onLeftover} showPlace={!groupByPlace} />
      ))}
    </>
  )
  return (
    <div className="pantry-groups">
      {sections.map((section) => {
        // Ungrouped: one list, its heading is the screen's own (no group title).
        if (section.key === -1) {
          return (
            <ListGroup key={section.key} label={strings.groupLabel(strings.lotsLabel, section.lots.length)}>
              {rows(section)}
            </ListGroup>
          )
        }
        const heading = groupHeading(section, places)
        return (
          <ListGroup
            key={section.key}
            title={heading.title}
            icon={heading.icon}
            count={heading.count}
            countLabel={heading.countLabel}
            action={
              heading.unsorted && section.lots.length > 0 ? (
                <Button variant="secondary" size="sm" icon="moveDown" onClick={() => onPutAway(section.lots)}>
                  {strings.putAway.action}
                </Button>
              ) : undefined
            }
          >
            {rows(section)}
          </ListGroup>
        )
      })}
    </div>
  )
}
