// B9-41 (SSP-15): the info tile of an in-store code at a Shop with no Weight Barcode Rule: what it looks like, why it matters, and the way in
// ("Set up the rule" for an Admin, "Ask the Admin to set one up." for a User). The sheet's first description. Render only.
import { Button } from '../../../ui'
import { Icon } from '../../../ui/Icon'
import { Tile } from '../../../ui/Tile'
import { newProductStrings } from '../newProductStrings'

export interface WeightCodeNoteProps {
  id?: string
  shopName: string
  admin: boolean
  onSetUp: () => void
}

export function WeightCodeNote({ id, shopName, admin, onSetUp }: WeightCodeNoteProps) {
  const s = newProductStrings.weightCode
  return (
    <Tile as="section" variant="status" status="info" className="weight-code-note" id={id}>
      <Icon name="info" size={20} />
      <div>
        <p className="weight-code-note__title">{s.title(shopName)}</p>
        <p className="weight-code-note__text">{s.text(shopName)}</p>
        {admin ? (
          <div className="weight-code-note__actions">
            <Button variant="secondary" size="sm" onClick={onSetUp}>
              {s.setUp}
            </Button>
          </div>
        ) : (
          <p className="weight-code-note__text">{s.askAdmin}</p>
        )}
      </div>
    </Tile>
  )
}
