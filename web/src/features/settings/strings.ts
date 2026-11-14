// English copy for Settings, split by area: strings/{hub,members,household,slots,allowlist,preferences,courses}.ts. settingsStrings
// is the union of the first six (coursesStrings is its own object), so every import keeps working; a later package edits one area module.
import { settingsAllowlistStrings } from './strings/allowlist'
import { settingsHouseholdStrings } from './strings/household'
import { settingsHubStrings } from './strings/hub'
import { settingsMembersStrings } from './strings/members'
import { settingsPreferencesStrings } from './strings/preferences'
import { settingsSlotsStrings } from './strings/slots'

export const settingsStrings = {
  ...settingsHubStrings,
  ...settingsMembersStrings,
  ...settingsHouseholdStrings,
  ...settingsSlotsStrings,
  ...settingsAllowlistStrings,
  ...settingsPreferencesStrings,
}
