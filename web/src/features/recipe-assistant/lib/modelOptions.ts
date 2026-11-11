// Model options for the shared Select (design 2.3). Pure: no React, so `leading` (the price badge) is added by the component.
import type { SelectOption } from '../../../ui/Select/lib'
import type { ModelInfo } from '../types'

export interface ModelOption extends SelectOption<string> {
  /** '$'..'$$$$' or '' (unknown); the component shows it as a Chip. */
  priceTier: string
  /** Deprecated or retired: the component marks it. */
  warning: boolean
}

const GROUP_ORDER = ['Recommended', 'Other models', 'Older models']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2027-03-12' -> '12 Mar 2027'; anything else is returned unchanged. */
function dayCopy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : iso
}

/** The second line of an option: "$ · Fastest · description", or the retirement date for a model on its way out. */
export function metaLine(model: ModelInfo): string {
  if (model.lifecycle !== 'active') {
    if (model.retiresAt) return `Retires ${dayCopy(model.retiresAt)}`
    return model.lifecycle === 'retired' ? 'Retired' : 'Retiring soon'
  }
  const parts = [model.priceTier, model.speedTier, model.description].filter((p) => p !== '')
  return parts.length > 0 ? parts.join(' · ') : 'Price not known'
}

const rank = (group: string) => {
  const i = GROUP_ORDER.indexOf(group)
  return i === -1 ? GROUP_ORDER.length : i
}

/**
 * The list in API order within the groups Recommended, Other models, Older models, then any other. A current model the
 * list does not have is appended as "Custom"; with no list (loading or failed) the current model is the only option.
 */
export function toModelOptions(models: ModelInfo[] | undefined, current: string): ModelOption[] {
  if (!models) {
    return current === '' ? [] : [{ value: current, label: current, meta: 'Saved model', keywords: [current], priceTier: '', warning: false }]
  }
  const options: ModelOption[] = models
    .map((m) => ({
      value: m.id,
      label: m.name,
      meta: metaLine(m),
      group: m.group,
      keywords: [m.id],
      priceTier: m.priceTier,
      warning: m.lifecycle !== 'active',
    }))
    .sort((a, b) => rank(a.group) - rank(b.group))
  if (current !== '' && !options.some((o) => o.value === current)) {
    options.push({ value: current, label: current, group: 'Custom', meta: 'Custom model ID', keywords: [current], priceTier: '', warning: false })
  }
  return options
}

export const isValidModelId = (id: string): boolean => /^[A-Za-z0-9._:@/-]{1,128}$/.test(id)

export const createModelLabel = (query: string): string => `Use model ID “${query}”`
