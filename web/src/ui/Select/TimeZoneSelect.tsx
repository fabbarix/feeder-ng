// B9-15 (SET-07): the Household's time zone, chosen by city instead of typed as an IANA name. Always searchable: the city, the IANA name
// and the offset ("UTC+1") all match. The device's zone is listed first; a stored zone Intl does not list is still shown.
import { useMemo } from 'react'
import type { FieldSize } from '../fields/Field'
import { Select } from './Select'
import { deviceTimeZone, timeZoneOptions } from './options'
import { selectStrings } from './strings'

export interface TimeZoneSelectProps {
  /** The IANA name. */
  value: string
  onChange: (iana: string) => void
  /** Default "Time zone". */
  label?: string
  size?: FieldSize
  helper?: string
  error?: string
  disabled?: boolean
  required?: boolean
  /** Tests: the zones to list, the moment of the clocks, the device's zone. Default: Intl and now. */
  zones?: string[]
  now?: Date
  deviceZone?: string
}

export function TimeZoneSelect({ value, onChange, label = selectStrings.timeZone, zones, now, deviceZone, ...field }: TimeZoneSelectProps) {
  const device = deviceZone ?? deviceTimeZone()
  // The clocks are read when the list is built; `now` is a dependency only when a test passes one.
  const options = useMemo(() => timeZoneOptions({ zones, now, deviceZone: device, include: value || undefined }), [zones, now, device, value])
  return <Select<string> {...field} label={label} entityName={selectStrings.timeZoneEntity} searchable options={options} value={value || null} onChange={onChange} />
}
