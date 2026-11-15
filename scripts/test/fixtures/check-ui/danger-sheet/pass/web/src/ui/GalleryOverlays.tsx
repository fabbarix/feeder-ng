// fixture: the primitives themselves (and the Gallery) may use the danger tone on a Dialog.
import { Dialog } from './Dialog'

export function ConfirmDialog({ open }: { open: boolean }) {
  return <Dialog open={open} onClose={() => {}} title="x" tone="danger" icon="delete" />
}
