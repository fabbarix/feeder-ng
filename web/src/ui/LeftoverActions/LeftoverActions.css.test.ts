import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

describe('LeftoverActions.css', () => {
  it('has no rule for the old .leftover-row__place (the Storage Place is part of the row meta)', () => {
    expect(readUiCss('LeftoverActions/LeftoverActions.css')).not.toContain('leftover-row__place')
  })
})
