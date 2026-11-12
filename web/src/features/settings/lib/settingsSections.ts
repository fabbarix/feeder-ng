// The Settings index: which rows exist, where they lead, who sees them. Plain TypeScript, no React.
import type { IconName } from '../../../ui/icons'
import { settingsStrings } from '../strings'

export interface SettingsSection {
  id: 'ingredients' | 'products' | 'household' | 'members' | 'mealSlots' | 'courses' | 'planningRules' | 'tags' | 'shops' | 'storagePlaces' | 'accessRequests' | 'preferences' | 'notifications' | 'allowlist' | 'recipeAssistant'
  /** Row title (a GLOSSARY term or UI name; copy lives in strings.ts as settingsStrings.index.sections[id]). */
  title: string
  /** One-line description under the title. */
  meta: string
  icon: IconName
  path: string
  /** Shown to Admins only. */
  adminOnly?: boolean
}

export interface SettingsGroup {
  id: 'catalogue' | 'household' | 'you' | 'admin'
  title: string
  sections: SettingsSection[]
}

const copy = settingsStrings.index.sections

const SECTIONS: Array<SettingsSection & { group: SettingsGroup['id'] }> = [
  { group: 'household', id: 'household', ...copy.household, icon: 'household', path: '/settings/household' },
  { group: 'household', id: 'members', ...copy.members, icon: 'members', path: '/settings/members' },
  { group: 'household', id: 'mealSlots', ...copy.mealSlots, icon: 'mealSlots', path: '/settings/meal-slots' },
  { group: 'household', id: 'courses', ...copy.courses, icon: 'dinner', path: '/settings/courses' },
  { group: 'household', id: 'planningRules', ...copy.planningRules, icon: 'planningRules', path: '/settings/planning' },
  { group: 'household', id: 'tags', ...copy.tags, icon: 'tag', path: '/settings/tags' },
  { group: 'household', id: 'shops', ...copy.shops, icon: 'shops', path: '/settings/shops' },
  { group: 'household', id: 'storagePlaces', ...copy.storagePlaces, icon: 'stock', path: '/settings/storage-places' },
  { group: 'household', id: 'accessRequests', ...copy.accessRequests, icon: 'timer', path: '/settings/access-requests' },
  { group: 'you', id: 'preferences', ...copy.preferences, icon: 'appearance', path: '/settings/preferences' },
  { group: 'you', id: 'notifications', ...copy.notifications, icon: 'notifications', path: '/settings/notifications' },
  { group: 'admin', id: 'allowlist', ...copy.allowlist, icon: 'allowlist', path: '/settings/allowlist', adminOnly: true },
  { group: 'admin', id: 'recipeAssistant', ...copy.recipeAssistant, icon: 'assistant', path: '/settings/recipe-assistant', adminOnly: true },
]

const GROUP_ORDER: Array<{ id: SettingsGroup['id']; title: string }> = [
  { id: 'household', title: settingsStrings.index.groups.household },
  { id: 'you', title: settingsStrings.index.groups.you },
  { id: 'admin', title: settingsStrings.index.groups.admin },
]

/**
 * The index groups, in order, with the rows each Viewer sees (empty groups are dropped):
 *   Household: Household, Members, Meal Slots, Planning rules, Tags, Shops, Sign-in requests   (/settings/household, /members, /meal-slots, /planning, /tags, /shops, /access-requests)
 *   You:       Your preferences, Notifications                          (/settings/preferences, /notifications)
 *   Admin:     Allowlist, Recipe Assistant (Admins only)                (/settings/allowlist, /settings/recipe-assistant)
 * There is no separate "Barcodes" row: Shop Barcodes and Weight Barcode Rules live under their Shop (docs/dev/design/wp11-settings-catalogue.md).
 */
export function settingsGroups(isAdmin: boolean): SettingsGroup[] {
  return GROUP_ORDER.map((group) => ({
    id: group.id,
    title: group.title,
    sections: SECTIONS.filter((s) => s.group === group.id && (isAdmin || !s.adminOnly)).map(({ group: _group, ...section }) => section),
  })).filter((group) => group.sections.length > 0)
}
