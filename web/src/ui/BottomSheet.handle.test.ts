// R2-F (G-02): from 768 px a BottomSheet is a centred dialog; the 36x4 grab handle promises a drag that does not exist, so it is hidden.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('BottomSheet.css')

describe('sheet handle (G-02)', () => {
  it('is drawn on phones (the base rule keeps its 36x4 size)', () => {
    expect(declarations(css, '.sheet__grip')).toMatchObject({ 'inline-size': '36px', 'block-size': '4px' })
    expect(declarations(css, '.sheet__grip')).not.toHaveProperty('display')
  })

  it('is hidden in the same 768 px media block that turns the sheet into a dialog', () => {
    const start = css.search(/@media\s*\(min-width:\s*768px\)/)
    expect(start).toBeGreaterThan(-1)
    const block = css.slice(start, css.indexOf('@media', start + 10) === -1 ? undefined : css.indexOf('@media', start + 10))
    expect(block).toMatch(/\.sheet\s*\{/)
    expect(block).toMatch(/\.sheet__grip\s*\{[^}]*display:\s*none/)
  })

  it('the dialog panel loses the handle gap too (padding-top equals the sheet padding, not 8 px + 12 px margin)', () => {
    const start = css.search(/@media\s*\(min-width:\s*768px\)/)
    expect(css.slice(start)).toMatch(/\.sheet__panel\s*\{[^}]*padding-block-start:\s*var\(--space-5\)/)
  })
})
