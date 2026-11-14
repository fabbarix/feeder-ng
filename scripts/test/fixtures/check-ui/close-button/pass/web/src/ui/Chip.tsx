import { IconButton } from './IconButton'

export const Chip = ({ onRemove }: { onRemove: () => void }) => <IconButton icon="close" label="Remove" onClick={onRemove} />
