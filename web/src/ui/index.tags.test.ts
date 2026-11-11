// The ui barrel exports the Tag primitives (TG-UI).
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel: Tag primitives', () => {
  it.each(['TagDot', 'TagColourPicker', 'TagSelect', 'tagOptions'])('exports %s', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('function')
  })
})
