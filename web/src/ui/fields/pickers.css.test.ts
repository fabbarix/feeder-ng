// R11a: the swatch and emoji pickers wrap onto further rows on phones (a flex row that wraps, never a clipped or scrolling strip),
// with 44 px emoji targets. Reads the stylesheets; jsdom has no layout.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'

const swatches = readUiCss('fields/ColorSwatches.css')
const emoji = readUiCss('fields/EmojiPicker.css')

describe('ColorSwatches.css', () => {
  it('wraps with a token gap, and the Custom swatch is a 40 px circle like the others (no text inside)', () => {
    const d = declarations(swatches, '.colour-swatches')
    expect(d['display']).toBe('flex')
    expect(d['flex-wrap']).toBe('wrap')
    expect(d['gap']).toMatch(/var\(--space-/)
    expect(swatches).not.toMatch(/colour-swatch__text/)
    expect(declarations(swatches, '.colour-swatch')['inline-size']).toBe('40px')
  })
})

describe('EmojiPicker.css', () => {
  it('exists, tokens only', () => {
    expect(emoji.trim().length).toBeGreaterThan(0)
    const code = emoji.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/)
    expect(code).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
  })

  it('wraps onto further rows with a token gap', () => {
    const d = declarations(emoji, '.emoji-picker')
    expect(d['display']).toBe('flex')
    expect(d['flex-wrap']).toBe('wrap')
    expect(d['gap']).toMatch(/var\(--space-/)
  })

  it('each choice is at least 44 px square, rings when checked, and has a focus ring', () => {
    const d = declarations(emoji, '.emoji-choice')
    expect(d['inline-size']).toBe('44px')
    expect(d['block-size']).toBe('44px')
    expect(declarations(emoji, ".emoji-choice[aria-checked='true']")['box-shadow']).toMatch(/var\(--color-accent\)/)
    expect(declarations(emoji, '.emoji-choice:focus-visible')['outline']).toMatch(/var\(--color-accent\)/)
  })
})
