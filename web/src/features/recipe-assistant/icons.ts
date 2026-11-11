// The icons this page uses (design 5.2); the names are local, the values are keys of ui/icons.ts.
import type { IconName } from '../../ui/icons'

export const raIcons = {
  key: 'key',
  connect: 'link',
  assistant: 'assistant',
  refresh: 'refresh',
} as const satisfies Record<string, IconName>
