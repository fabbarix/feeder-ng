import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

describe('LeftoverActions.css', () => {
  it('has no rule for the old .leftover-row__place (the Storage Place is part of the row meta)', () => {
    expect(readUiCss('LeftoverActions/LeftoverActions.css')).not.toContain('leftover-row__place')
  })
  it('B9-45: the planned-for hint wraps, never ends in an ellipsis', () => {
    const css = readUiCss('LeftoverActions/LeftoverActions.css')
    const rule = /\.leftover-row__hint \{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toContain('white-space: normal')
    expect(rule).toContain('text-overflow: clip')
  })
})
