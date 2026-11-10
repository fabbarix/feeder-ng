// The ONLY file allowed to import from @phosphor-icons/react, one /dist/csr/<Name> module per icon
// (docs/design/ui-fix-plan.md 3.4; guard rule `phosphor`). STUB: the Developer registers every
// icon of docs/dev/design/wp2-icons.md here, replacing this single entry.
import { HouseIcon } from '@phosphor-icons/react/dist/csr/House'

export const icons = {
  today: HouseIcon,
} as const

export type IconName = keyof typeof icons
