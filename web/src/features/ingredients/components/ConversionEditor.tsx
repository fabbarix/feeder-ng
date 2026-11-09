import type { BaseUnit, UnitSystem } from '../../../lib/units'
import type { Conversion } from '../types'

export interface ConversionEditorProps {
  conversions: readonly Conversion[]
  base: BaseUnit
  system: UnitSystem
  onAdd: (c: Conversion) => void
  onRemove: (unit: string) => void
}

/**
 * "Unit Conversions": a line per conversion (formatConversion) with a "Remove <unit>" button, or
 * strings.noConversions; then the add form: Unit, "Amount in g|ml|piece" (always the metric Base Unit
 * label, since the stored value is metric), "Add conversion". Errors from useConversionForm show inline (role alert).
 */
export function ConversionEditor(props: ConversionEditorProps) {
  void props
  return null
}
