// The icons this page uses. R14 adds `key`, `connect`, `assistant` and `refresh` to ui/icons.ts (design 5.2); until it
// merges these point at the glyphs that exist. Swap the four values then (the names are the final ones).
import type { IconName } from '../../ui/icons'

export const raIcons = {
  key: 'allowlist',
  connect: 'link',
  assistant: 'agentPrompt',
  refresh: 'regenerate',
} as const satisfies Record<string, IconName>
