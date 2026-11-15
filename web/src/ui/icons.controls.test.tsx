// B9-16 (A11Y-06, RX-02): two aliases in the registry. `selected` is the Check before the label of a chosen Segmented option or a
// pressed ChoiceChip; `caretDown` is the Disclosure's caret. Both are registered in icons.ts (the only file that imports Phosphor).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { readSource } from '../features/plan/test-css'

const markup = (name: 'selected' | 'caretDown' | 'add' | 'remove') => render(<Icon name={name} />).container.querySelector('svg')!.innerHTML

describe('icons used by the controls', () => {
  it('selected is the Phosphor Check from its own module', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/\n\s*selected:\s*CheckIcon,/)
    expect(markup('selected')).not.toBe('')
  })

  it('caretDown is the Phosphor CaretDown from its own module', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/from '@phosphor-icons\/react\/dist\/csr\/CaretDown'/)
    expect(src).toMatch(/\n\s*caretDown:\s*CaretDownIcon,/)
  })

  it('the two glyphs are not each other and not the plus or the cross', () => {
    const glyphs = [markup('selected'), markup('caretDown'), markup('add'), markup('remove')]
    expect(new Set(glyphs).size).toBe(4)
  })
})
