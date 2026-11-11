// Features that need a radiogroup of their own import useRovingRadios from the ui barrel, not from ui/fields.
import { describe, expect, it } from 'vitest'
import * as ui from '../index'

describe('ui barrel', () => {
  it('exports useRovingRadios', () => {
    expect(typeof (ui as Record<string, unknown>).useRovingRadios).toBe('function')
  })
})
