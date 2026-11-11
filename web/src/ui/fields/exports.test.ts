// R2-F: the barrel exports the new primitives and types (R14, R2-L and adoption packages import from ../ui).
import { describe, expect, it } from 'vitest'
import * as ui from '../index'

describe('ui barrel (R2-F)', () => {
  it('exports FieldRow and FormActions', () => {
    expect(typeof (ui as Record<string, unknown>).FieldRow).toBe('function')
    expect(typeof (ui as Record<string, unknown>).FormActions).toBe('function')
  })

  it('exports the TimeField and TextField/TextArea primitives that the adoption packages use with size', () => {
    for (const name of ['TextField', 'TextArea', 'TimeField', 'NumberField', 'DateField', 'SearchField', 'Select', 'Stepper']) {
      expect(typeof (ui as Record<string, unknown>)[name], name).toBe('function')
    }
  })
})
