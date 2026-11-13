// H9: one Phosphor glyph for "Use" (take some of a Supply out of Stock): MinusCircle, registered as `use` in the shared registry
// (additive: no existing name changes). It reads as "take one out" without being the stepper's bare minus or the Delete bin.
import { MinusCircleIcon } from '@phosphor-icons/react/dist/csr/MinusCircle'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { icons, type IconName } from './icons'

const svg = (name: IconName) => {
  const { container, unmount } = render(<Icon name={name} />)
  const html = container.querySelector('svg')?.innerHTML
  unmount()
  return html
}

describe('use glyph', () => {
  it('is registered as Phosphor MinusCircle and draws', () => {
    expect(Object.keys(icons)).toContain('use')
    expect((icons as Record<string, unknown>).use).toBe(MinusCircleIcon)
    expect(svg('use' as IconName)).toBeTruthy()
  })
  it('is not the bare minus or the delete glyph', () => {
    for (const other of ['minus', 'delete'] as const) expect(svg('use' as IconName)).not.toBe(svg(other))
  })
})
