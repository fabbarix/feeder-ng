// Gallery: the Tag primitives (TG-UI). Each scheme shows the Tag chips, TagDot, TagColourPicker and TagSelect.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from './Gallery'

const IDS = ['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose']

describe('Gallery: Tag primitives (TG-UI)', () => {
  it.each(['light', 'dark'] as const)('has Tag chips, TagDot, TagColourPicker and TagSelect sections in the %s scheme', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    for (const name of ['Tag chips', 'TagDot', 'TagColourPicker', 'TagSelect']) {
      expect(within(section).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it.each(['light', 'dark'] as const)('shows a Tag chip, a filter chip and a dot of every colour in the %s scheme', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    for (const id of IDS) {
      expect(section.querySelector(`.chip[data-kind="tag"][data-tag-colour="${id}"]`), `${id} tag chip`).not.toBeNull()
      expect(section.querySelector(`.tag-dot[data-tag-colour="${id}"]`), `${id} dot`).not.toBeNull()
    }
    expect(section.querySelector('.chip[data-kind="filter"][data-tag-colour][aria-pressed="true"]')).not.toBeNull()
    expect(section.querySelector('.chip[data-kind="filter"][data-tag-colour][aria-pressed="false"]')).not.toBeNull()
  })

  it('shows a Tag colour radiogroup of ten and a Tag select', () => {
    render(<Gallery />)
    const groups = screen.getAllByRole('radiogroup', { name: 'Tag colour' })
    expect(groups.length).toBeGreaterThanOrEqual(2)
    expect(within(groups[0]!).getAllByRole('radio')).toHaveLength(10)
    expect(screen.getAllByRole('combobox', { name: /^Tag$/ }).length).toBeGreaterThanOrEqual(2)
  })
})
