import type { IconName } from '../icons'

const TAG_ICONS = new Map<string, IconName>([
  ['pasta', 'pasta'],
  ['fish', 'fish'],
  ['chicken', 'chicken'],
  ['pizza', 'pizza'],
  ['soup', 'soup'],
  ['vegetarian', 'vegetarian'],
])

/** Icon for a Tag (docs/design/ui-fix-plan.md 4.15): whole-name, case-insensitive match, else `other`. */
export function tagIcon(tag: string | undefined): IconName {
  if (tag === undefined) return 'other'
  return TAG_ICONS.get(tag.trim().toLowerCase()) ?? 'other'
}
