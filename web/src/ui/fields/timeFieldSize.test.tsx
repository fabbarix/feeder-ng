// R2-F (K1 (c)): "19:30" must not sit in a 500 px box. TimeField is size sm by default and takes the same size prop.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { TimeField } from './TimeField'

describe('TimeField sizing', () => {
  it('is sm by default and the group no longer forces inline-size: 100 %', () => {
    const { container } = render(<TimeField label="From" value="19:30" onChange={() => {}} />)
    expect(container.firstElementChild).toHaveAttribute('data-size', 'sm')
    expect(declarations(readUiCss('fields/TimeField.css'), '.time-field')['inline-size']).not.toBe('100%')
  })

  it('the group fills its frame (the frame caps it), so size="xs" gives 112 px of group', () => {
    const d = declarations(readUiCss('fields/TimeField.css'), '.time-field')
    expect(d['box-sizing'] ?? 'border-box').toBe('border-box')
    expect(d['align-self']).toBe('stretch')
  })
})
