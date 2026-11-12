// Hotfix 4.2: the eight handles sit on the corners and edge middles of the crop rectangle, in rendered CSS px, for tall, wide and turned
// pictures, after a turn and after a resize. jsdom has no layout, so the geometry is derived from what the editor renders: the frame's
// shape (--crop-ratio), the crop rectangle's percentages, the handles being CHILDREN of that rectangle, and the offsets the stylesheet gives
// each [data-handle]. A handle that is not a child of the rectangle (or whose offsets are not 0, 50% or 100%) cannot sit on the crop.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readUiCss } from '../test-utils'
import { ImageEditor } from './ImageEditor'
import type { Handle } from './lib/crop'
import { initialEdit, type ImageEdit } from './lib/edit'

const css = readUiCss('ImageEditor/ImageEditor.css').replace(/\/\*[\s\S]*?\*\//g, '')
const user = userEvent.setup({ applyAccept: false })
afterEach(() => vi.restoreAllMocks())

const NAMES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
/** The stylesheet's offset of each handle in its crop rectangle, as fractions of the rectangle (inset-inline-start, inset-block-start). */
function cssOffsets(): Record<Handle, [number, number]> {
  const out = {} as Record<Handle, [number, number]>
  for (const name of NAMES) {
    const m = new RegExp(`\\.crop-editor__handle\\[data-handle='${name}'\\]\\s*\\{([^}]*)\\}`).exec(css)
    const body = m?.[1] ?? ''
    const frac = (prop: string) => {
      const v = new RegExp(`${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)(%|px)?`).exec(body)
      return v ? (v[2] === '%' ? Number(v[1]) / 100 : Number(v[1]) === 0 ? 0 : NaN) : NaN
    }
    out[name] = [frac('inset-inline-start'), frac('inset-block-start')]
  }
  return out
}

/** The editor in a host that owns the value; the picture is `natural` pixels, the frame is `viewWidth` CSS px wide. */
function Host({ natural, start }: { natural: { width: number; height: number }; start: ImageEdit }) {
  const [value, setValue] = useState(start)
  return <ImageEditor src="blob:p" width={natural.width} height={natural.height} aspect="free" value={value} onChange={setValue} onCancel={() => undefined} />
}

const pct = (v: string) => parseFloat(v) / 100
/** Where each handle is, in CSS px from the frame's top-left, derived from the DOM the editor rendered. */
function handlePositions(viewWidth: number) {
  const frame = document.querySelector<HTMLElement>('.crop-editor__frame')!
  const ratio = Number(frame.style.getPropertyValue('--crop-ratio'))
  const frameW = viewWidth
  const frameH = viewWidth / ratio
  const rect = document.querySelector<HTMLElement>('.crop-editor__rect')!
  const rl = pct(rect.style.insetInlineStart) * frameW
  const rt = pct(rect.style.insetBlockStart) * frameH
  const rw = pct(rect.style.inlineSize) * frameW
  const rh = pct(rect.style.blockSize) * frameH
  const offsets = cssOffsets()
  const pos = {} as Record<Handle, { x: number; y: number }>
  for (const name of NAMES) {
    const el = rect.querySelector(`[data-handle='${name}']`)
    if (!el) throw new Error(`handle ${name} is not a child of the crop rectangle`)
    pos[name] = { x: rl + offsets[name][0] * rw, y: rt + offsets[name][1] * rh }
  }
  return { pos, frameW, frameH }
}

/** The handle positions the crop implies: picture px of the TURNED picture scaled to the frame. */
function expected(crop: ImageEdit['crop'], bounds: { width: number; height: number }, viewWidth: number) {
  const s = viewWidth / bounds.width
  const { x, y, width, height } = crop
  const left = x * s, top = y * s, right = (x + width) * s, bottom = (y + height) * s
  const midX = (left + right) / 2, midY = (top + bottom) / 2
  return { nw: [left, top], n: [midX, top], ne: [right, top], e: [right, midY], se: [right, bottom], s: [midX, bottom], sw: [left, bottom], w: [left, midY] } as Record<Handle, [number, number]>
}

const CASES = [
  { label: 'a tall photo (2268 x 3226)', natural: { width: 2268, height: 3226 }, turns: 0 as const },
  { label: 'a wide photo (4000 x 3000)', natural: { width: 4000, height: 3000 }, turns: 0 as const },
  { label: 'a photo turned a quarter (2268 x 3226 shown as 3226 x 2268)', natural: { width: 2268, height: 3226 }, turns: 1 as const },
]

function check(crop: ImageEdit['crop'], bounds: { width: number; height: number }, viewWidth: number) {
  const { pos, frameW, frameH } = handlePositions(viewWidth)
  const want = expected(crop, bounds, viewWidth)
  for (const name of NAMES) {
    expect(pos[name].x, `${name} x`).toBeCloseTo(want[name][0], 1)
    expect(pos[name].y, `${name} y`).toBeCloseTo(want[name][1], 1)
    // inside the editor frame (the stage pads half a handle on every side for the part that overhangs the edge)
    expect(pos[name].x, `${name} inside, x`).toBeGreaterThanOrEqual(-0.01)
    expect(pos[name].x, `${name} inside, x`).toBeLessThanOrEqual(frameW + 0.01)
    expect(pos[name].y, `${name} inside, y`).toBeGreaterThanOrEqual(-0.01)
    expect(pos[name].y, `${name} inside, y`).toBeLessThanOrEqual(frameH + 0.01)
  }
}

describe('ImageEditor handles: corners and edge middles of the crop, at 390 px', () => {
  it('the stylesheet places each handle at 0, 50% or 100% of the crop rectangle, and the handle is a child of that rectangle', () => {
    const o = cssOffsets()
    expect(o).toEqual({ nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] })
  })

  for (const c of CASES) {
    const bounds = c.turns % 2 === 1 ? { width: c.natural.height, height: c.natural.width } : c.natural
    it(`${c.label}: the whole picture, then a smaller crop`, () => {
      const start: ImageEdit = { turns: c.turns, crop: { x: 0, y: 0, width: bounds.width, height: bounds.height } }
      const { unmount } = render(<Host natural={c.natural} start={start} />)
      check(start.crop, bounds, 390)
      unmount()
      const smaller: ImageEdit = { turns: c.turns, crop: { x: Math.round(bounds.width * 0.1), y: Math.round(bounds.height * 0.2), width: Math.round(bounds.width * 0.6), height: Math.round(bounds.height * 0.5) } }
      render(<Host natural={c.natural} start={smaller} />)
      check(smaller.crop, bounds, 390)
    })
  }

  it('after Rotate right the handles follow the turned crop', async () => {
    const natural = { width: 2268, height: 3226 }
    const start = initialEdit(natural, 'free')
    render(<Host natural={natural} start={start} />)
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    const bounds = { width: 3226, height: 2268 }
    const frame = document.querySelector<HTMLElement>('.crop-editor__frame')!
    expect(Number(frame.style.getPropertyValue('--crop-ratio'))).toBeCloseTo(bounds.width / bounds.height, 3)
    check({ x: 0, y: 0, width: bounds.width, height: bounds.height }, bounds, 390)
  })

  it('a window resize changes the scale only: the same percentages place the handles at the new size, at 412 px as at 390', () => {
    const natural = { width: 2268, height: 3226 }
    const crop = { x: 100, y: 200, width: 1500, height: 2000 }
    render(<Host natural={natural} start={{ turns: 0, crop }} />)
    for (const w of [390, 412, 320, 820]) check(crop, natural, w)
  })
})
