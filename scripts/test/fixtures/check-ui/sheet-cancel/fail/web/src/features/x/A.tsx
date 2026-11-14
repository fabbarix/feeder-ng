import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { uiStrings } from '../../ui/strings'

export const A = ({ onClose }: { onClose: () => void }) => (
  <>
    <BottomSheet
      open
      onClose={onClose}
      title="Mark as cooked"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {uiStrings.cancel}
          </Button>
          <Button>Cooked</Button>
        </>
      }
    >
      body
    </BottomSheet>
    <Dialog
      open
      onClose={onClose}
      title="Freeze?"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>{uiStrings.cancel}</Button>
          <Button>Freeze</Button>
        </>
      }
    />
  </>
)
