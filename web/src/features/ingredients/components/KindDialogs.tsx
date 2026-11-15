import { Button, ConfirmDialog, DetailList, DetailRow, Dialog } from '../../../ui'
import type { UseKindChange } from '../hooks/useKindChange'
import { kindInUseReasons, kindInUseTitle } from '../lib/kind'
import { displayName } from '../lib/names'
import { strings } from '../strings'
import type { IngredientKind } from '../types'

export interface KindDialogsProps {
  kind: IngredientKind
  name: string
  change: UseKindChange
}

/**
 * The dialogs of a kind change (the change itself is in the page's More menu, SET-05): the confirm before food becomes a Supply,
 * and a refusal's reasons as rows (R-E).
 */
export function KindDialogs({ kind, name, change }: KindDialogsProps) {
  const target: IngredientKind = kind === 'food' ? 'supply' : 'food'
  return (
    <>
      <ConfirmDialog
        open={change.pending !== null}
        title={strings.kind.toSupplyTitle(displayName(name))}
        body={strings.kind.toSupplyBody}
        confirmLabel={strings.kind.changeToSupply}
        onConfirm={() => void change.confirm()}
        onCancel={change.cancel}
      />
      <Dialog
        open={change.refusal !== null}
        onClose={change.dismissRefusal}
        title={kindInUseTitle(change.refusal?.kind ?? target)}
        actions={<Button onClick={change.dismissRefusal}>{strings.kind.gotIt}</Button>}
      >
        <DetailList>
          {kindInUseReasons(change.refusal?.reasons ?? []).map((reason) => (
            <DetailRow key={reason} label={reason} />
          ))}
        </DetailList>
      </Dialog>
    </>
  )
}
