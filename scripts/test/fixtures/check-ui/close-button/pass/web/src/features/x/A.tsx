import { CloseButton } from '../../ui/CloseButton'
import { IconButton } from '../../ui/IconButton'

export const A = ({ onClose }: { onClose: () => void }) => (
  <header>
    <CloseButton onClick={onClose} />
    <IconButton icon="add" label="Add" onClick={onClose} />
  </header>
)
