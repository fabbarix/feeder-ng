// PhotoSources: where photos come from (docs/dev/design/photo-read.md section 5, "PhotoSources"; decision 1: the phone's own camera app, no live view).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCEPT } from '../../../ui'
import type { PhotoSourceOptions } from '../hooks/usePhotoSources'
import { PhotoSources } from './PhotoSources'

const phone: PhotoSourceOptions = { showTakePhoto: true, libraryAccept: 'image/*', multiple: true, pasteAndDrop: false }
const computer: PhotoSourceOptions = { showTakePhoto: false, libraryAccept: ACCEPT, multiple: true, pasteAndDrop: true }
const view = (options = phone, over: Partial<Parameters<typeof PhotoSources>[0]> = {}) => {
  const onFiles = vi.fn()
  const out = render(<PhotoSources options={options} canAdd onFiles={onFiles} {...over} />)
  return { onFiles, ...out }
}
const inputs = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type=file]'))
const jpg = new File(['x'], 'a.jpg', { type: 'image/jpeg' })

afterEach(() => vi.restoreAllMocks())

describe('PhotoSources on a phone', () => {
  it('offers Take photo (primary) and Choose photos, and nothing about paste or drop', () => {
    view()
    expect(screen.getByRole('button', { name: 'Take photo' })).toHaveAttribute('data-variant', 'primary')
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Choose files' })).toBeNull()
    expect(screen.queryByText(/paste or drop/i)).toBeNull()
  })

  it('has a hidden capture input for the rear camera (single, any image) and a hidden library input (several, no capture)', () => {
    const { container } = view()
    const [capture, library] = [inputs(container).find((i) => i.hasAttribute('capture')), inputs(container).find((i) => !i.hasAttribute('capture'))]
    expect(capture).toBeDefined()
    expect(capture).toHaveAttribute('capture', 'environment')
    expect(capture).toHaveAttribute('accept', 'image/*')
    expect(capture).not.toHaveAttribute('multiple')
    expect(library).toHaveAttribute('accept', 'image/*')
    expect(library).toHaveAttribute('multiple')
    for (const i of inputs(container)) expect(i.hidden || i.getAttribute('aria-hidden') === 'true' || i.tabIndex === -1).toBe(true)
  })

  it('Take photo opens the capture input; Choose photos opens the library input', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const { container } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Take photo' }))
    expect(click.mock.contexts.at(-1)).toBe(inputs(container).find((i) => i.hasAttribute('capture')))
    await userEvent.click(screen.getByRole('button', { name: 'Choose photos' }))
    expect(click.mock.contexts.at(-1)).toBe(inputs(container).find((i) => !i.hasAttribute('capture')))
  })

  it('reports a camera photo with origin "camera" and chosen photos, in order, with origin "file"', async () => {
    const { container, onFiles } = view()
    const b = new File(['y'], 'b.jpg', { type: 'image/jpeg' })
    await userEvent.upload(inputs(container).find((i) => i.hasAttribute('capture'))!, jpg)
    expect(onFiles).toHaveBeenLastCalledWith([jpg], 'camera')
    await userEvent.upload(inputs(container).find((i) => !i.hasAttribute('capture'))!, [jpg, b])
    expect(onFiles).toHaveBeenLastCalledWith([jpg, b], 'file')
  })
})

describe('PhotoSources on a computer', () => {
  it('offers Choose files inside a drop zone, with the paste and drop hint, and no Take photo', () => {
    view(computer)
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeInTheDocument()
    expect(screen.getByText('or paste or drop a picture here')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Choose photos' })).toBeNull()
  })

  it('takes several files at once, from the picker\'s accept list, never with a capture input', async () => {
    const { container, onFiles } = view(computer)
    expect(inputs(container).some((i) => i.hasAttribute('capture'))).toBe(false)
    const input = inputs(container)[0]!
    expect(input).toHaveAttribute('multiple')
    expect(input).toHaveAttribute('accept', ACCEPT)
    await userEvent.upload(input, [jpg, new File(['y'], 'b.png', { type: 'image/png' })])
    expect(onFiles).toHaveBeenCalledWith([jpg, expect.objectContaining({ name: 'b.png' })], 'file')
  })
})

describe('PhotoSources when nothing more can be added', () => {
  it.each([
    ['phone', phone, ['Take photo', 'Choose photos']],
    ['computer', computer, ['Choose files']],
  ])('turns every %s source off and says why', (_n, options, names) => {
    view(options, { canAdd: false })
    for (const name of names) {
      const button = screen.getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription("That's 4 photos, the most a read takes.")
    }
  })
  it('says nothing about the limit while photos can be added', () => {
    view()
    expect(screen.queryByText("That's 4 photos, the most a read takes.")).toBeNull()
  })
  it('is off as a whole while the step is locked (disabled)', () => {
    view(phone, { disabled: true })
    expect(screen.getByRole('button', { name: 'Take photo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Choose photos' })).toBeDisabled()
  })
})
