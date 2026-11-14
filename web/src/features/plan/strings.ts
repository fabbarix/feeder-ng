// English UI strings of the planning feature. Glossary terms only (Planned Meal, Meal Slot, Recipe,
// Pinned, Cooked, Leftover, Use-by, Batch, Slot Rule, Variety Rule, Tag, Planning Horizon, Stock, Cool-down).
import { awayStrings } from './strings/away'
import { cookStrings } from './strings/cook'
import { gridStrings } from './strings/grid'
import { heroStrings } from './strings/hero'
import { rulesStrings } from './strings/rules'
import { sheetsStrings } from './strings/sheets'

// B9-08: the words live in one module per area (strings/); planStrings composes them, so every caller keeps importing it from here.
export const planStrings = {
  ...gridStrings,
  ...heroStrings,
  ...sheetsStrings,
  ...cookStrings,
  ...rulesStrings,
  ...awayStrings,
} as const
