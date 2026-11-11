import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

const css = readUiCss('ImagePicker/ImagePicker.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('ImagePicker.css', () => {
  it('exists and styles the picker, its preview and its panels', () => {
    for (const sel of ['.image-picker', '.image-picker__preview', '.image-picker__actions', '.image-picker__panel']) expect(css, sel).toContain(sel)
  })

  it('tokens only: no colour literals, no px font sizes', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(css).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
    expect(css).toMatch(/var\(--/)
  })

  it('the preview is cropped with object-fit: cover and never overflows its tile', () => {
    expect(css).toMatch(/object-fit\s*:\s*cover/)
    expect(css).toMatch(/max-inline-size\s*:\s*100%|inline-size\s*:\s*100%|width\s*:\s*100%/)
  })

  it('actions have 44 px hit targets', () => {
    expect(css).toMatch(/min-block-size\s*:\s*44px|min-height\s*:\s*44px/)
  })

  it('a visible keyboard focus ring', () => {
    expect(css).toMatch(/:focus-visible/)
  })

  it('anything animated honours prefers-reduced-motion', () => {
    if (/animation\s*:|@keyframes|transition\s*:/.test(css)) expect(css).toMatch(/prefers-reduced-motion/)
  })

  it('the panel is not the same colour as its secondary buttons (Use link must stand out, light and dark)', () => {
    const panel = [...css.matchAll(/\.image-picker__panel\s*\{([^}]*)\}/g)].map((m) => m[1]).join(' ')
    expect(panel).toMatch(/background\s*:\s*var\(--color-surface\)/)
    expect(panel).toMatch(/border\s*:[^;]*var\(--color-line\)/)
  })
})

describe('ImagePicker.css, hero size (IM2 review)', () => {
  it('caps the hero preview so it does not dominate a desktop page', () => {
    const hero = /\.image-picker__preview\[data-size='hero'\]\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    const cap = /max-inline-size\s*:\s*(\d+)px/.exec(hero)?.[1]
    expect(cap, 'a px max-inline-size').toBeDefined()
    expect(Number(cap)).toBeLessThanOrEqual(640)
    expect(Number(cap)).toBeGreaterThanOrEqual(320)
  })
  it('can hide the heading visually (the host shows its own)', () => {
    expect(readUiCss('fields/Field.css')).toMatch(/\.visually-hidden\s*\{[^}]*clip-path/)
  })
})
