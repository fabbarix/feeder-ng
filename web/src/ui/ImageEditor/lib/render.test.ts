import { describe, expect, it } from 'vitest'
import { outputSize, rectInSource, type Rect } from './crop'
import type { ImageEdit } from './edit'
import { drawPlan } from './render'
import { turnedSize, type Turns } from './turns'

const WORKING = { width: 4000, height: 3000 }
const MAX = 2576

const fullCrop = (turns: Turns): Rect => ({ x: 0, y: 0, ...turnedSize(WORKING.width, WORKING.height, turns) })
const cornerCrop = (turns: Turns): Rect => ({ x: 0, y: 0, width: 800, height: 500 + turns * 10 })

describe('drawPlan', () => {
  describe.each([0, 1, 2, 3] as const)('turns %i', (turns) => {
    describe.each([
      ['the whole picture', fullCrop],
      ['a corner crop', cornerCrop],
    ])('%s', (_name, makeCrop) => {
      const edit: ImageEdit = { turns, crop: makeCrop(turns) }
      const plan = () => drawPlan(WORKING, edit, MAX)

      it('the canvas is the crop fitted to maxSide, never above it', () => {
        const { canvas } = plan()
        expect(canvas).toEqual(outputSize(edit.crop, MAX))
        expect(Math.max(canvas.width, canvas.height)).toBeLessThanOrEqual(MAX)
      })
      it('the source is the crop in working-copy pixels', () => {
        expect(plan().source).toEqual(rectInSource(edit.crop, turns, WORKING.width, WORKING.height))
      })
      it('rotates by turns x 90 degrees', () => {
        expect(plan().rotate).toBe(turns * 90)
      })
      it('the destination is the canvas before the rotation: width and height swapped for odd turns, centred on the canvas centre', () => {
        const { canvas, dest } = plan()
        const odd = turns % 2 === 1
        const dw = odd ? canvas.height : canvas.width
        const dh = odd ? canvas.width : canvas.height
        expect(dest).toEqual({ x: -dw / 2, y: -dh / 2, width: dw, height: dh })
      })
    })
  })

  it('never enlarges a small crop', () => {
    expect(drawPlan({ width: 800, height: 600 }, { turns: 0, crop: { x: 0, y: 0, width: 800, height: 600 } }, MAX).canvas).toEqual({ width: 800, height: 600 })
  })

  it('shrinks a large crop so the long side is maxSide', () => {
    const { canvas } = drawPlan(WORKING, { turns: 0, crop: { x: 0, y: 0, width: 4000, height: 3000 } }, MAX)
    expect(canvas).toEqual({ width: 2576, height: 1932 })
  })
})
