import { useId, useState, type ReactNode } from 'react'
import { BentoGrid } from '../../../ui/BentoGrid'
import { Button } from '../../../ui/Button'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import type { ListEntry } from '../lib/lines'
import { shopStrings } from '../strings'

export interface NotNeededGroupProps {
  entries: ListEntry[]
  /** "Needed after all" on one entry */
  onNeededAfterAll?: (entry: ListEntry) => void
  /** the Ingredient's Picture slot, as ShoppingBody gives the other tiles */
  lead?: (entry: ListEntry) => ReactNode
}

/**
 * B5-SH: the collapsed "Not needed (N)" group at the end of the list. Closed, it shows only its toggle; opened, each
 * Line shows its quantity, its unconfirmed past meals and "Needed after all". No tick control: a Not needed Line is
 * neither open nor ticked. Render only.
 */
export function NotNeededGroup({ entries, onNeededAfterAll, lead }: NotNeededGroupProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  if (entries.length === 0) return null
  return (
    <section className="shop-not-needed">
      <button type="button" className="shop-not-needed__toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}>
        {shopStrings.notNeededGroup(entries.length)}
        <Icon name="chevron" size={20} className="shop-not-needed__chevron" />
      </button>
      {open ? (
        <div role="group" aria-label={shopStrings.notNeeded} id={panelId}>
          <div className="shop-lines">
            <BentoGrid columns={2}>
              {entries.map((entry) => (
                <Tile as="article" key={entry.key} className="line-tile" data-state="not-needed" data-lead={lead ? 'true' : undefined}>
                  {lead ? <span className="line-tile__lead">{lead(entry)}</span> : null}
                  <div className="line-tile__body">
                    <p className="line-tile__title">{entry.title}</p>
                    {entry.quantityText ? <p className="line-tile__quantity">{entry.quantityText}</p> : null}
                    {entry.hint ? <p className="line-tile__hint">{entry.hint}</p> : null}
                  </div>
                  {onNeededAfterAll ? (
                    <span className="line-tile__end">
                      <Button variant="tertiary" size="sm" aria-label={shopStrings.neededAfterAllFor(entry.title)} onClick={() => onNeededAfterAll(entry)}>
                        {shopStrings.neededAfterAll}
                      </Button>
                    </span>
                  ) : null}
                </Tile>
              ))}
            </BentoGrid>
          </div>
        </div>
      ) : null}
    </section>
  )
}
