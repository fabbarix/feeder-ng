import { IconButton } from './IconButton'

export const Toast = ({ onDismiss }: { onDismiss: () => void }) => <IconButton icon="close" label="Dismiss" onClick={onDismiss} />
