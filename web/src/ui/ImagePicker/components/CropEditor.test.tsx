import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CropEditor, type CropEditorProps } from './CropEditor'

const user = userEvent.setup({ applyAccept: false })

// jsdom has no layout: every element reports 400 x 300 CSS px, so the 800 x 600 test picture is shown at half size (1 CSS px = 2 picture px).
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON: () => ({}) })
})
afterEach(() => vi.restoreAllMocks())

function setup(over: Partial<CropEditorProps> = {}) {
  const props = { src: 'blob:photo', width: 800, height: 600, aspect: 'free' as const, onApply: vi.fn(), onCancel: vi.fn(), ...over }
  render(<CropEditor {...props} />)
  return props
}
const handle = (name: string) => screen.getByRole('button', { name: `Resize crop, ${name}` })
const status = () => screen.getByRole('status')

describe('CropEditor: structure', () => {
  it('is a labelled group with the picture, the crop box, a read-out and the actions', () => {
    setup()
    const group = screen.getByRole('group', { name: 'Crop image' })
    expect(group.querySelector('img')).toHaveAttribute('src', 'blob:photo')
    expect(screen.queryByRole('img')).not.toBeInTheDocument() // the picture is decorative: the controls and the read-out say everything
    expect(screen.getByRole('button', { name: 'Move crop area' })).toBeInTheDocument()
    for (const name of ['Rotate left', 'Rotate right', 'Reset', 'Cancel', 'Use crop']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
  })

  it('free: eight resize handles; locked: the four corners only', () => {
    setup()
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(8)
    document.body.innerHTML = ''
    setup({ aspect: 4 / 3 })
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Resize crop, top edge' })).not.toBeInTheDocument()
  })

  it('a locked aspect starts as the largest centred area of that shape', () => {
    setup({ aspect: 1 })
    expect(status()).toHaveTextContent('Crop area: 600 by 600 pixels')
  })

  it('the box and every handle are described by the read-out (screen readers hear the size as they resize)', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveAccessibleDescription(/800 by 600 pixels/)
    expect(handle('bottom right corner')).toHaveAccessibleDescription(/800 by 600 pixels/)
  })

  it('the box and the handles are in the Tab order (real buttons)', async () => {
    setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveFocus()
    await user.tab()
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })[0]).toHaveFocus()
  })

  it('busy disables everything and marks the group busy', () => {
    setup({ busy: true })
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Crop image' })).toHaveAttribute('aria-busy', 'true')
  })
})

describe('CropEditor: keyboard', () => {
  it('arrow keys on a handle resize (1% of the long side, 10x with Shift) and Use crop applies it', async () => {
    const p = setup()
    handle('bottom right corner').focus()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}') // 800 px long side -> step 8, Shift 80
    expect(status()).toHaveTextContent('Crop area: 720 by 600 pixels')
    await user.keyboard('{ArrowUp}')
    expect(status()).toHaveTextContent('Crop area: 720 by 592 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 0, crop: { x: 0, y: 0, width: 720, height: 592 } })
  })

  it('arrow keys on the box move it, up to the edges', async () => {
    const p = setup({ aspect: 1 }) // 600 x 600 at x = 100
    screen.getByRole('button', { name: 'Move crop area' }).focus()
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{ArrowRight}')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 0, crop: { x: 188, y: 0, width: 600, height: 600 } })
  })

  it('the keyboard keeps a locked aspect', async () => {
    setup({ aspect: 1 })
    handle('bottom right corner').focus()
    await user.keyboard('{ArrowLeft}')
    expect(status()).toHaveTextContent('Crop area: 592 by 592 pixels')
  })

  it('Escape cancels from anywhere inside the editor; arrow keys do not scroll the page', async () => {
    const p = setup()
    handle('top edge').focus()
    const down = fireEvent.keyDown(handle('top edge'), { key: 'ArrowDown' })
    expect(down).toBe(false) // preventDefault was called
    await user.keyboard('{Escape}')
    expect(p.onCancel).toHaveBeenCalledTimes(1)
    expect(p.onApply).not.toHaveBeenCalled()
  })
})

describe('CropEditor: pointer (mouse, pen and touch share pointer events)', () => {
  const down = (el: Element, x: number, y: number) => fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch', button: 0 })
  const move = (el: Element, x: number, y: number) => fireEvent.pointerMove(el, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' })
  const up = (el: Element, x: number, y: number) => fireEvent.pointerUp(el, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' })

  it('dragging a corner resizes by the distance on screen scaled to picture pixels', async () => {
    const p = setup()
    const se = handle('bottom right corner')
    down(se, 400, 300)
    move(se, 350, 250) // -50 css px = -100 picture px on both axes
    up(se, 350, 250)
    expect(status()).toHaveTextContent('Crop area: 700 by 500 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 0, crop: { x: 0, y: 0, width: 700, height: 500 } })
  })

  it('dragging the box moves it', async () => {
    const p = setup({ aspect: 1 })
    const box = screen.getByRole('button', { name: 'Move crop area' })
    down(box, 200, 150)
    move(box, 210, 150)
    up(box, 210, 150)
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 0, crop: { x: 120, y: 0, width: 600, height: 600 } })
  })

  it('moves after the pointer is released change nothing', () => {
    setup()
    const se = handle('bottom right corner')
    down(se, 400, 300)
    up(se, 400, 300)
    move(se, 300, 200)
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
  })
})

describe('CropEditor: rotate, reset, apply, cancel', () => {
  it('Rotate right turns the picture: the read-out follows and Use crop reports the turn', async () => {
    const p = setup()
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(status()).toHaveTextContent('Crop area: 600 by 800 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 1, crop: { x: 0, y: 0, width: 600, height: 800 } })
  })

  it('Rotate left is a counter-clockwise turn', async () => {
    const p = setup()
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 3, crop: { x: 0, y: 0, width: 600, height: 800 } })
  })

  it('with a locked aspect a turn starts the crop again for the turned picture', async () => {
    const p = setup({ aspect: 1 })
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(status()).toHaveTextContent('Crop area: 600 by 600 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).toHaveBeenCalledWith({ turns: 1, crop: { x: 0, y: 100, width: 600, height: 600 } })
  })

  it('Use crop with nothing changed does not apply: it just closes', async () => {
    const p = setup()
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).not.toHaveBeenCalled()
    expect(p.onCancel).toHaveBeenCalledTimes(1)
  })

  it('Reset undoes the turn and the crop', async () => {
    const p = setup()
    handle('bottom right corner').focus()
    await user.keyboard('{ArrowLeft}')
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
    await user.click(screen.getByRole('button', { name: 'Use crop' }))
    expect(p.onApply).not.toHaveBeenCalled()
  })

  it('Cancel closes without applying', async () => {
    const p = setup()
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(p.onCancel).toHaveBeenCalledTimes(1)
    expect(p.onApply).not.toHaveBeenCalled()
  })
})
