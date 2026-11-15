// TagSwatch (B9-51, SET-11): the leading 40 px square of a Tags row, in the Tag's colour pair, with the Tag icon (fill). Decorative.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { TagSwatch } from './TagSwatch'

const IDS = ['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose']

describe('TagSwatch', () => {
  it.each(IDS)('%s: a decorative span carrying data-tag-colour and the Tag icon', (id) => {
    const { container } = render(<TagSwatch colour={id} />)
    const swatch = container.querySelector('.tag-lead')!
    expect(swatch).not.toBeNull()
    expect(swatch.tagName.toLowerCase()).toBe('span')
    expect(swatch).toHaveAttribute('data-tag-colour', id)
    expect(swatch).toHaveAttribute('aria-hidden', 'true')
    expect(swatch.querySelector('svg')).not.toBeNull()
    expect(swatch).toHaveTextContent('')
  })
  it('an unknown or missing colour is the neutral square: drawn, still decorative, no attribute', () => {
    for (const ui of [<TagSwatch key="a" colour="chartreuse" />, <TagSwatch key="b" />]) {
      const { container, unmount } = render(ui)
      const swatch = container.querySelector('.tag-lead')!
      expect(swatch).not.toBeNull()
      expect(swatch).not.toHaveAttribute('data-tag-colour')
      expect(swatch).toHaveAttribute('aria-hidden', 'true')
      unmount()
    }
  })
})

describe('TagSwatch.css (own file, so TagColour.css and its tests stay as they are)', () => {
  const css = readUiCss('TagColour/TagSwatch.css')
  it('exists', () => expect(css).not.toBe(''))
  it('is a 40 px square that never shrinks, rounded by the thumb radius token', () => {
    expect(declarations(css, '.tag-lead')).toMatchObject({ 'inline-size': '40px', 'block-size': '40px', 'border-radius': 'var(--radius-thumb)' })
    expect(declarations(css, '.tag-lead').flex).toMatch(/^(none|0 0 auto)$/)
  })
  it.each(IDS)('%s: the colour pair of the Tag pill, tokens only', (id) => {
    expect(declarations(css, `.tag-lead[data-tag-colour='${id}']`)).toMatchObject({ background: `var(--tag-${id}-bg)`, color: `var(--tag-${id}-fg)` })
  })
  it('uses no colour literal', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
  })
})
