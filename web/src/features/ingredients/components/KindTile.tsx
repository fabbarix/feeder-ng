import { ConfirmDialog, Button, Dialog, Tile } from '../../../ui'
import { kindInUseReasons, kindInUseTitle } from '../lib/kind'
import { displayName } from '../lib/names'
import type { UseKindChange } from '../hooks/useKindChange'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

export interface KindTileProps {
  kind: IngredientKind
  name: string
  change: UseKindChange
}

/** The Kind Tile of an Ingredient page: what it is, and the one change it can make (a Supply asks first; a refusal is shown in words). */
export function KindTile({ kind, name, change }: KindTileProps) {
  const target: IngredientKind = kind === 'food' ? 'supply' : 'food'
  const title = displayName(name)
  return (
    <Tile as="section" aria-label={strings.kind.label}>
      <p className="kind-tile__text">{kind === 'supply' ? strings.kind.thisIsSupply : strings.kind.thisIsFood}</p>
      <Button variant="tertiary" onClick={() => change.request(target)}>
        {target === 'supply' ? strings.kind.changeToSupply : strings.kind.changeToFood}
      </Button>
      {change.failure ? <p role="alert">{change.failure}</p> : null}
      <ConfirmDialog
        open={change.pending !== null}
        title={strings.kind.toSupplyTitle(title)}
        body={strings.kind.toSupplyBody}
        confirmLabel={strings.kind.changeToSupply}
        onConfirm={() => void change.confirm()}
        onCancel={change.cancel}
      />
      <Dialog
        open={change.refusal !== null}
        onClose={change.dismissRefusal}
        title={kindInUseTitle(change.refusal?.kind ?? target)}
        actions={
          <Button onClick={change.dismissRefusal}>{strings.kind.gotIt}</Button>
        }
      >
        <ul className="kind-tile__reasons">
          {kindInUseReasons(change.refusal?.reasons ?? []).map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </Dialog>
    </Tile>
  )
}
