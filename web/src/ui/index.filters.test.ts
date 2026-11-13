// hf-recipes-filter: the ui barrel exports the new shared primitives (docs/design/recipes-filter.md 7).
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel: filter header primitives', () => {
  it.each(['Popover', 'OptionList'])('exports %s', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('function')
  })
})
