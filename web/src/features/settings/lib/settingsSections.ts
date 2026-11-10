// The Settings index: which rows exist, where they lead, who sees them. Plain TypeScript, no React.
import type { IconName } from '../../../ui/icons'

export interface SettingsSection {
  id: 'household' | 'members' | 'mealSlots' | 'planningRules' | 'shops' | 'preferences' | 'notifications' | 'allowlist'
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
  id: 'household' | 'you' | 'admin'
  title: string
  sections: SettingsSection[]
}

/**
 * The index groups, in order, with the rows each Viewer sees (empty groups are dropped):
 *   Household: Household, Members, Meal Slots, Planning rules, Shops   (/settings/household, /members, /meal-slots, /planning, /shops)
 *   You:       Your preferences, Notifications                          (/settings/preferences, /notifications)
 *   Admin:     Allowlist (Admins only)                                  (/settings/allowlist)
 * There is no separate "Barcodes" row: Shop Barcodes and Weight Barcode Rules live under their Shop (docs/dev/design/wp11-settings-catalogue.md).
 */
export function settingsGroups(isAdmin: boolean): SettingsGroup[] {
  void isAdmin
  throw new Error('not implemented: WP11 settingsGroups')
}
