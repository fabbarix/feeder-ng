// Sort-drag: the shared `drag` glyph for sortable handles (docs/dev/design/sort-drag.md section 7).
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { readSource } from '../features/plan/test-css'

const markup = (name: 'drag' | 'more') => render(<Icon name={name} />).container.querySelector('svg')!.innerHTML

describe('icon "drag"', () => {
  it('is registered and differs from the three-dot "more" glyph', () => {
    expect(markup('drag')).not.toBe('')
    expect(markup('drag')).not.toBe(markup('more'))
  })
  it('imports Phosphor DotsSixVertical from its own module', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/from '@phosphor-icons\/react\/dist\/csr\/DotsSixVertical'/)
    expect(src).toMatch(/\n\s*drag:\s*DotsSixVerticalIcon,/)
  })
})
