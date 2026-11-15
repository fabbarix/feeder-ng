// B9-15 (SET-07, TB-06): the Household's currency, chosen by name ("Euro") instead of typed as an ISO code. Always searchable: the name
// and the code both match. "Common" first, then every currency by name; a stored code Intl does not list is still shown.
import { useMemo } from 'react'
import type { FieldSize } from '../fields/Field'
import { Select } from './Select'
import { currencyOptions } from './options'
import { selectStrings } from './strings'

export interface CurrencySelectProps {
  /** The ISO 4217 code. */
  value: string
  onChange: (code: string) => void
  /** Default "Currency". */
  label?: string
  /** Default sm. */
  size?: FieldSize
  helper?: string
  error?: string
  disabled?: boolean
  required?: boolean
  /** Tests: the codes to list and the locale of their names. Default: Intl and the browser's locale. */
  codes?: string[]
  locale?: string
}

export function CurrencySelect({ value, onChange, label = selectStrings.currency, size = 'sm', codes, locale, ...field }: CurrencySelectProps) {
  const options = useMemo(() => currencyOptions({ codes, locale, include: value || undefined }), [codes, locale, value])
  return <Select<string> {...field} label={label} size={size} entityName={selectStrings.currencyEntity} searchable options={options} value={value || null} onChange={onChange} />
}
