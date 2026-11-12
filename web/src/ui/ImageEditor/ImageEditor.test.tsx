import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageEditor, type ImageEditorProps } from './ImageEditor'
import type { ImageEdit } from './lib/edit'

const user = userEvent.setup({ applyAccept: false })

// jsdom has no layout: every element reports 400 x 300 CSS px, so the 800 x 600 test picture is shown at half size (1 CSS px = 2 picture px).
beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, toJSON: () => ({}) })
})
afterEach(() => vi.restoreAllMocks())

const edit = (x: number, y: number, width: number, height: number, turns: ImageEdit['turns'] = 0): ImageEdit => ({ turns, crop: { x, y, width, height } })
const FULL = edit(0, 0, 800, 600)

/** A host that owns the value, as the read flow does (the editor itself is controlled). */
function Host(props: Partial<ImageEditorProps> & { start?: ImageEdit; onValue?: (e: ImageEdit) => void }) {
  const { start = FULL, onValue, ...rest } = props
  const [value, setValue] = useState(start)
  return (
    <ImageEditor
      src="blob:photo"
      width={800}
      height={600}
      aspect="free"
      onCancel={() => undefined}
      {...rest}
      value={value}
      onChange={(e) => {
        setValue(e)
        onValue?.(e)
      }}
    />
  )
}

/** The value is NOT kept by the host: what the editor shows must come from props only. */
function setupControlled(over: Partial<ImageEditorProps> = {}) {
  const props = { src: 'blob:photo', width: 800, height: 600, aspect: 'free' as const, value: FULL, onChange: vi.fn(), onCancel: vi.fn(), ...over }
  const view = render(<ImageEditor {...props} />)
  return { props, ...view }
}
const handle = (name: string) => screen.getByRole('button', { name: `Resize crop, ${name}` })
const status = () => screen.getByRole('status')

describe('ImageEditor: structure and accessible names', () => {
  it('is a group "Crop image" with the picture, the crop box, a read-out, Rotate left, Rotate right and Reset', () => {
    setupControlled()
    const group = screen.getByRole('group', { name: 'Crop image' })
    expect(group.querySelector('img')).toHaveAttribute('src', 'blob:photo')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    for (const name of ['Move crop area', 'Rotate left', 'Rotate right', 'Reset']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
  })

  it('has no Cancel or Use buttons of its own: the host brings them as children', () => {
    setupControlled()
    expect(screen.queryByRole('button', { name: /^(Cancel|Use )/ })).not.toBeInTheDocument()
  })

  it('free: eight handles; locked: the four corners', () => {
    setupControlled()
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(8)
    document.body.innerHTML = ''
    setupControlled({ aspect: 1, value: edit(100, 0, 600, 600) })
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })).toHaveLength(4)
  })

  it('the box and every handle are described by the read-out', () => {
    setupControlled()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveAccessibleDescription(/800 by 600 pixels/)
    expect(handle('bottom right corner')).toHaveAccessibleDescription(/800 by 600 pixels/)
  })

  it('the box and the handles are in the Tab order', async () => {
    setupControlled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveFocus()
    await user.tab()
    expect(screen.getAllByRole('button', { name: /^Resize crop, / })[0]).toHaveFocus()
  })

  it('busy disables everything and marks the group busy', () => {
    setupControlled({ busy: true })
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    expect(screen.getByRole('group', { name: 'Crop image' })).toHaveAttribute('aria-busy', 'true')
  })

  it('autoFocus puts the focus on the crop box', () => {
    setupControlled({ autoFocus: true })
    expect(screen.getByRole('button', { name: 'Move crop area' })).toHaveFocus()
  })
})

describe('ImageEditor: controlled value', () => {
  it('renders the value it is given: the read-out and the box position', () => {
    setupControlled({ value: edit(200, 150, 400, 300) })
    expect(status()).toHaveTextContent('Crop area: 400 by 300 pixels')
    const rect = screen.getByRole('button', { name: 'Move crop area' }).parentElement!
    expect(rect.style.insetInlineStart).toBe('25%')
    expect(rect.style.insetBlockStart).toBe('25%')
    expect(rect.style.inlineSize).toBe('50%')
    expect(rect.style.blockSize).toBe('50%')
  })

  it('a turned value is shown turned: the read-out has the turned size and the image is rotated', () => {
    setupControlled({ value: edit(0, 0, 600, 800, 1) })
    expect(status()).toHaveTextContent('Crop area: 600 by 800 pixels')
    expect(screen.getByRole('group', { name: 'Crop image' }).querySelector('img')!.style.transform).toContain('rotate(90deg)')
  })

  it('never changes by itself: without a new value nothing moves', async () => {
    const { props } = setupControlled()
    handle('bottom right corner').focus()
    await user.keyboard('{ArrowLeft}')
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
    expect(props.onChange).toHaveBeenCalledTimes(1)
  })
})

describe('ImageEditor: onChange', () => {
  it('arrow keys on a handle report a nudged edit (1 % of the long side: 8; Shift x10)', async () => {
    const { props } = setupControlled()
    handle('bottom right corner').focus()
    await user.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 720, 600))
    await user.keyboard('{ArrowUp}')
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 800, 592))
  })

  it('arrow keys on the box move it', async () => {
    const { props } = setupControlled({ value: edit(100, 0, 600, 600) })
    screen.getByRole('button', { name: 'Move crop area' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(props.onChange).toHaveBeenLastCalledWith(edit(108, 0, 600, 600))
  })

  it('arrow keys do not scroll the page; Tab is left alone', () => {
    setupControlled()
    expect(fireEvent.keyDown(handle('top edge'), { key: 'ArrowDown' })).toBe(false)
    expect(fireEvent.keyDown(handle('top edge'), { key: 'Tab' })).toBe(true)
  })

  it('a pointer drag of a corner reports a resize scaled to picture pixels', () => {
    const { props } = setupControlled()
    const se = handle('bottom right corner')
    fireEvent.pointerDown(se, { clientX: 400, clientY: 300, pointerId: 1, pointerType: 'touch', button: 0 })
    fireEvent.pointerMove(se, { clientX: 350, clientY: 250, pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerUp(se, { clientX: 350, clientY: 250, pointerId: 1, pointerType: 'touch' })
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 700, 500))
  })

  it('a pointer drag of the box reports a move', () => {
    const { props } = setupControlled({ value: edit(100, 0, 600, 600) })
    const box = screen.getByRole('button', { name: 'Move crop area' })
    fireEvent.pointerDown(box, { clientX: 200, clientY: 150, pointerId: 1, pointerType: 'touch', button: 0 })
    fireEvent.pointerMove(box, { clientX: 210, clientY: 150, pointerId: 1, pointerType: 'touch' })
    expect(props.onChange).toHaveBeenLastCalledWith(edit(120, 0, 600, 600))
  })

  it('Rotate right and Rotate left report the turned edit', async () => {
    const { props } = setupControlled()
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 600, 800, 1))
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 600, 800, 3))
  })

  it('Reset reports no turn and the initial crop', async () => {
    const { props } = setupControlled({ value: edit(10, 10, 300, 200, 2) })
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(props.onChange).toHaveBeenLastCalledWith(FULL)
  })

  it('minSide is respected by the keyboard (160 stops the shrinking)', async () => {
    const { props } = setupControlled({ minSide: 160, value: edit(0, 0, 165, 600) })
    handle('right edge').focus()
    await user.keyboard('{ArrowLeft}')
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 160, 600))
  })

  it('without minSide the default minimum is 16', async () => {
    const { props } = setupControlled({ value: edit(0, 0, 20, 600) })
    handle('right edge').focus()
    await user.keyboard('{ArrowLeft}')
    expect(props.onChange).toHaveBeenLastCalledWith(edit(0, 0, 16, 600))
  })
})

describe('ImageEditor: a host that keeps the value', () => {
  it('the read-out says "Turned right. " after Rotate right, then plain again after a nudge', async () => {
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(status()).toHaveTextContent('Turned right. Crop area: 600 by 800 pixels')
    handle('bottom right corner').focus()
    await user.keyboard('{ArrowLeft}')
    expect(status()).toHaveTextContent('Crop area: 592 by 800 pixels')
    expect(status()).not.toHaveTextContent('Turned')
  })

  it('the read-out says "Turned left. " after Rotate left', async () => {
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'Rotate left' }))
    expect(status()).toHaveTextContent('Turned left. Crop area: 600 by 800 pixels')
  })

  it('Reset brings the whole picture back', async () => {
    render(<Host />)
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(status()).toHaveTextContent('Crop area: 800 by 600 pixels')
  })

  it('a locked aspect turns into a fresh centred crop', async () => {
    render(<Host aspect={1} start={edit(100, 0, 600, 600)} />)
    await user.click(screen.getByRole('button', { name: 'Rotate right' }))
    expect(status()).toHaveTextContent('Crop area: 600 by 600 pixels')
  })
})

describe('ImageEditor: Escape and children', () => {
  it('Escape from anywhere inside calls onCancel once and does not bubble', async () => {
    const outer = vi.fn()
    const { props } = setupControlled()
    document.addEventListener('keydown', outer)
    handle('top edge').focus()
    await user.keyboard('{Escape}')
    document.removeEventListener('keydown', outer)
    expect(props.onCancel).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('Escape does nothing while busy', async () => {
    const { props } = setupControlled({ busy: true })
    fireEvent.keyDown(screen.getByRole('group', { name: 'Crop image' }), { key: 'Escape' })
    expect(props.onCancel).not.toHaveBeenCalled()
  })

  it('children are rendered inside the group, after Reset', () => {
    setupControlled({ children: <button type="button">Use photo</button> })
    const group = screen.getByRole('group', { name: 'Crop image' })
    const use = screen.getByRole('button', { name: 'Use photo' })
    const reset = screen.getByRole('button', { name: 'Reset' })
    expect(group).toContainElement(use)
    expect(reset.compareDocumentPosition(use) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
