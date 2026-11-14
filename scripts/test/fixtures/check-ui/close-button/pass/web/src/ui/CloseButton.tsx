import { IconButton } from './IconButton'

export const CloseButton = ({ onClick }: { onClick: () => void }) => <IconButton icon="close" label="Close" shape="circle" onClick={onClick} />
