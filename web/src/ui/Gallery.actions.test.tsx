// B9-01 / DS-12: the Gallery shows the new action primitives in both schemes (DS-12 build notes: Gallery entries for both schemes).
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'

describe.each(['light', 'dark'] as const)('Gallery action primitives, %s', (scheme) => {
  const section = () => render(<Gallery />).container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!

  it('has a CloseButton and a DetailList heading', () => {
    const s = section()
    expect(within(s).getByRole('heading', { level: 3, name: 'CloseButton' })).toBeInTheDocument()
    expect(within(s).getByRole('heading', { level: 3, name: 'DetailList' })).toBeInTheDocument()
  })

  it('shows a circular CloseButton, a danger-secondary and a link Button', () => {
    const s = section()
    expect(s.querySelector('button.close-button')).not.toBeNull()
    expect(s.querySelector('button[data-variant="danger-secondary"]')).not.toBeNull()
    expect(s.querySelector('button[data-variant="link"]')).not.toBeNull()
  })

  it('shows DetailList rows for more than one tone', () => {
    const s = section()
    const tones = new Set([...s.querySelectorAll('.detail-list')].map((e) => e.getAttribute('data-tone')))
    expect(tones.size).toBeGreaterThan(1)
    expect(s.querySelector('.detail-list ul, ul.detail-list')).not.toBeNull()
  })
})
