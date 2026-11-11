// R2-1: the shared `warning` glyph is a warning, not the hourglass of useSoon/goesOff.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { readSource } from '../features/plan/test-css'

const markup = (name: 'warning' | 'useSoon' | 'goesOff' | 'error') => render(<Icon name={name} />).container.querySelector('svg')!.innerHTML

describe('icon "warning"', () => {
  it('is not the hourglass and not the error circle', () => {
    expect(markup('warning')).not.toBe(markup('useSoon'))
    expect(markup('warning')).not.toBe(markup('goesOff'))
    expect(markup('warning')).not.toBe(markup('error'))
  })
  it('imports the Phosphor Warning glyph from its own module and no longer maps to HourglassMedium', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/from '@phosphor-icons\/react\/dist\/csr\/Warning'/)
    expect(src).toMatch(/\n\s*warning:\s*WarningIcon,/)
  })
  it('keeps the hourglass for useSoon and goesOff', () => {
    const src = readSource('ui/icons.ts')
    expect(src).toMatch(/useSoon:\s*HourglassMediumIcon/)
    expect(src).toMatch(/goesOff:\s*HourglassMediumIcon/)
  })
})
