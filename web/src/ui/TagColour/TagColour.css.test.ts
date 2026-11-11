// TagColour.css (TG-UI): the dot and the swatches take their colour from the Tag tokens only.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const IDS = ['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose']
const css = readUiCss('TagColour/TagColour.css')

describe('TagColour.css', () => {
  it('exists', () => expect(css).not.toBe(''))
  it('the dot is an 8 px circle, neutral until a colour is set', () => {
    expect(declarations(css, '.tag-dot')).toMatchObject({ 'inline-size': '8px', 'block-size': '8px', 'border-radius': '50%' })
    expect(declarations(css, '.tag-dot').background).toMatch(/^var\(--color-/)
  })
  it.each(IDS)('%s dot: its dot token', (id) => {
    expect(declarations(css, `.tag-dot[data-tag-colour='${id}']`)).toMatchObject({ background: `var(--tag-${id}-dot)` })
  })
  it('a swatch is a 40 px circle', () => {
    expect(declarations(css, '.tag-swatch')).toMatchObject({ 'inline-size': '40px', 'block-size': '40px', 'border-radius': '50%' })
  })
  it.each(IDS)('%s swatch: tinted by its dot token, tick in its text token', (id) => {
    expect(declarations(css, `.tag-swatch[data-tag-colour='${id}']`)).toMatchObject({ background: `var(--tag-${id}-dot)` })
  })
  it('the chosen swatch has a ring and the focus ring is visible', () => {
    expect(declarations(css, ".tag-swatch[aria-checked='true']")['box-shadow']).toContain('var(--color-accent)')
    expect(declarations(css, '.tag-swatch:focus-visible').outline).toContain('var(--color-accent)')
  })
  it('uses no colour literal: tokens only', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(/i)
  })
})
