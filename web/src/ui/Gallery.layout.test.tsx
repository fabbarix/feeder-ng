// R2-L: the dev Gallery shows Page (three widths) and StickyActionBar in both schemes.
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'

describe('Gallery: layout primitives', () => {
  it.each(['light', 'dark'] as const)('%s section lists Page and StickyActionBar', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    for (const name of ['Page', 'StickyActionBar']) {
      expect(within(section).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
    for (const w of ['narrow', 'default', 'wide']) expect(section.querySelector(`[data-page-width="${w}"]`), w).not.toBeNull()
    expect(section.querySelector('.sticky-action-bar')).not.toBeNull()
  })
})
