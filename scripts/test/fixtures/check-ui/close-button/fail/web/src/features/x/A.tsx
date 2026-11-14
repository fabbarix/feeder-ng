import { IconButton } from '../../ui/IconButton'

export const A = ({ onClose }: { onClose: () => void }) => (
  <header>
    <IconButton icon="close" label="Close" onClick={onClose} />
    <IconButton
      icon="close"
      label="Dismiss"
      onClick={onClose}
    />
  </header>
)
