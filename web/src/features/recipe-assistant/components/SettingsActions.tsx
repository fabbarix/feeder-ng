import { Button } from '../../../ui'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

export interface SettingsActionsProps {
  /** Something changed: Cancel is available. */
  dirty: boolean
  /** Save is allowed (changed and not blocked). */
  canSave: boolean
  saving: boolean
  onSave: () => void
  onCancel: () => void
}

/** Interim sticky action bar (ui-review-2 L-03): replaced by ui/StickyActionBar when it lands. */
export function SettingsActions({ dirty, canSave, saving, onSave, onCancel }: SettingsActionsProps) {
  return (
    <div className="ra__actions" role="group" aria-label={raStrings.actionsLabel}>
      <Button variant="tertiary" disabled={!dirty || saving} onClick={onCancel}>
        {raStrings.cancel}
      </Button>
      <Button variant="primary" disabled={!canSave || saving} loading={saving} onClick={onSave}>
        {saving ? raStrings.saving : raStrings.save}
      </Button>
    </div>
  )
}
