// fixture: a danger confirm built outside ConfirmDialog. Three elements violate; the rest is allowed.
import { BottomSheet } from '../../ui/BottomSheet'
import { Dialog } from '../../ui/Dialog'

export function A({ open }: { open: boolean }) {
  return (
    <>
      <Dialog open={open} onClose={() => {}} title="Delete Coop?" tone="danger" onCancel={() => {}}>
        Gone for good.
      </Dialog>
      <BottomSheet
        open={open}
        onClose={() => {}}
        title="Remove Sam?"
        tone="danger"
      >
        Sam leaves.
      </BottomSheet>
      <Dialog open={open} onClose={() => {}} title="Delete Pasta?" icon="delete" />
      {/* not a violation: an ordinary dialog */}
      <Dialog open={open} onClose={() => {}} title="Pick a day">
        Days.
      </Dialog>
    </>
  )
}
