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

  it('no ancestor of the handles clips them: the 44 px hit areas and the focus outline overhang the picture', () => {
    // handle -> rect -> frame -> stage -> editor; only the picture layer ("canvas") may clip.
    for (const sel of ['.crop-editor__handle', '.crop-editor__box', '.crop-editor__rect', '.crop-editor__frame', '.crop-editor__stage', '.crop-editor']) {
      expect(rule(sel), `${sel} must not clip`).not.toMatch(/overflow(-x|-y|-inline|-block)?\s*:\s*(hidden|clip|auto|scroll)/)
    }
    expect(rule('.crop-editor__canvas')).toMatch(/overflow\s*:\s*hidden/)
    expect(rule('.crop-editor__stage')).toMatch(/padding/)
  })

  it('the dimming shade lives in the clipped canvas, not in the (unclipped) crop rectangle', () => {
    expect(rule('.crop-editor__rect')).not.toMatch(/box-shadow/)
    expect(rule('.crop-editor__shade')).toMatch(/box-shadow/)
  })

  it('a rotated (portrait) stage never grows taller than the viewport share', () => {
    expect(rule('.crop-editor__frame')).toMatch(/max-block-size\s*:\s*60dvh/)
  })

  it('the action buttons keep their label on one line (Use crop at 390 px wraps the row, not the label)', () => {
    expect(css).toMatch(/\.crop-editor__actions[^{]*\.button[^{]*\{[^}]*white-space\s*:\s*nowrap/)
  })
})
