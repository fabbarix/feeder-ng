import { describe, expect, it } from 'vitest'
import { readUiCss } from '../../test-utils'

const css = readUiCss('ImagePicker/components/CropEditor.css').replace(/\/\*[\s\S]*?\*\//g, '')
/** The declarations of every rule whose selector list contains exactly `selector` (so `.x:focus-visible` is not `.x`). */
const rule = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1]!.split(',').some((sel) => sel.trim() === selector))
    .map((m) => m[2])
    .join(' ')

describe('CropEditor.css', () => {
  it('styles the editor, the stage, the crop box and the handles', () => {
    for (const sel of ['.crop-editor', '.crop-editor__stage', '.crop-editor__box', '.crop-editor__handle']) expect(css, sel).toContain(sel)
  })

  it('handles are at least 44 px to hit (iPad), however small they look', () => {
    const handle = rule('.crop-editor__handle')
    expect(handle).toMatch(/(min-inline-size|min-width|inline-size|width)\s*:\s*(44px|var\(--[\w-]*(tap|target|hit)[\w-]*\))/)
    expect(handle).toMatch(/(min-block-size|min-height|block-size|height)\s*:\s*(44px|var\(--[\w-]*(tap|target|hit)[\w-]*\))/)
  })

  it('the box and the handles do not scroll or zoom the page while dragged (pointer events)', () => {
    expect(rule('.crop-editor__handle')).toMatch(/touch-action\s*:\s*none/)
    expect(rule('.crop-editor__box')).toMatch(/touch-action\s*:\s*none/)
  })

  it('a visible keyboard focus ring on the box and the handles', () => {
    expect(css).toMatch(/\.crop-editor__(handle|box)[^{]*:focus-visible/)
  })

  it('tokens only: no colour literals, no px font sizes', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(css).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
    expect(css).toMatch(/var\(--/)
  })

  it('the picture fits its tile and is never stretched', () => {
    expect(css).toMatch(/max-inline-size\s*:\s*100%|inline-size\s*:\s*100%|width\s*:\s*100%/)
    expect(css).toMatch(/user-select\s*:\s*none|-webkit-user-drag|pointer-events\s*:\s*none/)
  })

  it('anything animated honours prefers-reduced-motion', () => {
    if (/animation\s*:|@keyframes|transition\s*:/.test(css)) expect(css).toMatch(/prefers-reduced-motion/)
  })
})
