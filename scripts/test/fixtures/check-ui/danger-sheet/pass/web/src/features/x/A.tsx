// fixture: the allowed shapes. A danger confirm goes through ConfirmDialog or useConfirm; an ordinary Dialog or sheet is fine.
import { BottomSheet } from '../../ui/BottomSheet'
import { ConfirmDialog, useConfirm } from '../../ui/ConfirmDialog'
import { Dialog } from '../../ui/Dialog'

// <Dialog tone="danger"> in a comment is not code
export function A({ open }: { open: boolean }) {
  const { confirm } = useConfirm()
  return (
    <>
      <ConfirmDialog open={open} title="Delete Coop?" confirmLabel="Delete Coop" tone="danger" onConfirm={() => {}} onCancel={() => {}} />
      <Dialog open={open} onClose={() => {}} title="Pick a day" tone="default">
        Days.
      </Dialog>
      <BottomSheet open={open} onClose={() => {}} title="Edit Member">
        <button onClick={() => void confirm({ title: 'Remove Sam?', confirmLabel: 'Remove', tone: 'danger' })}>Remove</button>
      </BottomSheet>
    </>
  )
}
