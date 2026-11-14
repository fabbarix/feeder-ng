import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { Dialog } from '../../ui/Dialog'
import { uiStrings } from '../../ui/strings'

export const A = ({ onClose }: { onClose: () => void }) => (
  <>
    <BottomSheet open onClose={onClose} onCancel={onClose} title="Mark as cooked" footer={<Button>Cooked</Button>}>
      body
    </BottomSheet>
    <Dialog open onClose={onClose} onCancel={onClose} title="Freeze?" actions={<Button>Freeze</Button>} />
  </>
)

/** A page form (not a sheet or a dialog) keeps its own Cancel. */
export const Page = ({ onBack }: { onBack: () => void }) => (
  <form>
    <Button variant="secondary" onClick={onBack}>
      {uiStrings.cancel}
    </Button>
  </form>
)
