// TagDot (TG-UI): the colour dot alone, decorative.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagDot } from './TagDot'

const IDS = ['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose']

describe('TagDot', () => {
  it.each(IDS)('%s: a decorative span carrying data-tag-colour', (id) => {
    const { container } = render(<TagDot colour={id} />)
    const dot = container.querySelector('.tag-dot')!
    expect(dot).not.toBeNull()
    expect(dot.tagName.toLowerCase()).toBe('span')
    expect(dot).toHaveAttribute('data-tag-colour', id)
    expect(dot).toHaveAttribute('aria-hidden', 'true')
    expect(dot).toHaveTextContent('')
  })
  it('an unknown id is the neutral dot: drawn, still decorative, no attribute', () => {
    const { container } = render(<TagDot colour="chartreuse" />)
    const dot = container.querySelector('.tag-dot')!
    expect(dot).not.toBeNull()
    expect(dot).not.toHaveAttribute('data-tag-colour')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
  it('no colour is the neutral dot too', () => {
    const { container } = render(<TagDot />)
    expect(container.querySelector('.tag-dot')).not.toHaveAttribute('data-tag-colour')
  })
})
