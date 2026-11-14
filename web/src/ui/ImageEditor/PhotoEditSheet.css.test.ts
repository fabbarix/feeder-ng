import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'

const css = readUiCss('ImageEditor/PhotoEditSheet.css').replace(/\/\*[\s\S]*?\*\//g, '')
const rule = (selector: string) =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => m[1]!.split(',').some((sel) => sel.trim() === selector))
    .map((m) => m[2])
    .join(' ')

describe('PhotoEditSheet.css', () => {
  it('caps the frame lower than the editor does, so the whole editor fits the sheet without scrolling (1280 x 800, a phone)', () => {
    const frame = rule('.photo-edit-sheet .crop-editor__frame')
    expect(frame).toMatch(/max-block-size\s*:\s*45dvh/)
    expect(frame).toMatch(/inline-size\s*:\s*min\(100%,\s*calc\(45dvh \* var\(--crop-ratio, 1\)\)\)/)
  })

  it('leaves room inside the scrolling body for the focus rings and hit areas at its edges, with tokens', () => {
    const wrap = rule('.photo-edit-sheet')
    expect(wrap).toMatch(/padding-inline\s*:\s*var\(--space-2\)/)
    expect(wrap).toMatch(/padding-block-end\s*:\s*var\(--space-2\)/)
  })
})
