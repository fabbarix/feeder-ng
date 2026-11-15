// B9-20 (RES-02): the CSS contract of LoadState.css (read as text), from the mock's proposed block.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('LoadState.css')

describe('LoadState.css', () => {
  it('the art is a 96 px circle in the info tone', () => {
    const d = declarations(css, '.load-state__art')
    expect(d['inline-size']).toBe('96px')
    expect(d['block-size']).toBe('96px')
    expect(d['border-radius']).toBe('50%')
    expect(d['background']).toBe('var(--color-info-bg)')
    expect(d['color']).toBe('var(--color-info-fg)')
  })
  it('the title uses the title-2 role and the text is muted body at a 40ch measure', () => {
    expect(declarations(css, '.load-state__title')['font-size']).toBe('var(--text-title-2-size)')
    const text = declarations(css, '.load-state__text')
    expect(text['color']).toBe('var(--color-muted)')
    expect(text['max-inline-size']).toBe('40ch')
  })
  it('the status line is the meta role, muted', () => {
    const d = declarations(css, '.load-state__wait')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['color']).toBe('var(--color-muted)')
  })
  it('the tile version has a dashed outline on the surface at the tile radius', () => {
    const d = declarations(css, ".load-state[data-in='tile']")
    expect(d['border']).toBe('1px dashed var(--color-outline)')
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['border-radius']).toBe('var(--radius-tile)')
  })
  it('uses tokens only: no raw colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
  })
})
