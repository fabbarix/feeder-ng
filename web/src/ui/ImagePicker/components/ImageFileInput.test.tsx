// ImageFileInput: the hidden image file input shared by hosts with their own buttons (the photo read's Take photo / Choose photos).
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageFileInput, type ImageFileInputHandle } from './ImageFileInput'

const input = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type=file]')!
const a = new File(['a'], 'a.jpg', { type: 'image/jpeg' })
const b = new File(['b'], 'b.png', { type: 'image/png' })

afterEach(() => vi.restoreAllMocks())

describe('ImageFileInput: the input', () => {
  it('is one hidden file input taking any image, one file, no capture, by default', () => {
    const { container } = render(<ImageFileInput onFiles={() => {}} />)
    expect(container.querySelectorAll('input')).toHaveLength(1)
    const i = input(container)
    expect(i).toHaveAttribute('type', 'file')
    expect(i.hidden).toBe(true)
    expect(i).toHaveAttribute('accept', 'image/*')
    expect(i).not.toHaveAttribute('multiple')
    expect(i).not.toHaveAttribute('capture')
  })
  it('capture asks for the rear camera', () => {
    const { container } = render(<ImageFileInput capture onFiles={() => {}} />)
    expect(input(container)).toHaveAttribute('capture', 'environment')
  })
  it('multiple allows several files', () => {
    const { container } = render(<ImageFileInput multiple onFiles={() => {}} />)
    expect(input(container)).toHaveAttribute('multiple')
  })
  it('accept can be set (the picker\'s list on a computer)', () => {
    const { container } = render(<ImageFileInput accept=".jpg,.png" onFiles={() => {}} />)
    expect(input(container)).toHaveAttribute('accept', '.jpg,.png')
  })
  it('disabled disables the input', () => {
    const { container } = render(<ImageFileInput disabled onFiles={() => {}} />)
    expect(input(container)).toBeDisabled()
  })
})

describe('ImageFileInput: files', () => {
  it('passes the chosen files in order', async () => {
    const onFiles = vi.fn()
    const { container } = render(<ImageFileInput multiple onFiles={onFiles} />)
    await userEvent.upload(input(container), [b, a])
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([b, a])
  })
  it('passes an array, even for one file', async () => {
    const onFiles = vi.fn()
    const { container } = render(<ImageFileInput onFiles={onFiles} />)
    await userEvent.upload(input(container), a)
    expect(onFiles).toHaveBeenCalledWith([a])
  })
  it('resets the value so the same file can be chosen again', async () => {
    const onFiles = vi.fn()
    const { container } = render(<ImageFileInput onFiles={onFiles} />)
    await userEvent.upload(input(container), a)
    expect(input(container).value).toBe('')
    await userEvent.upload(input(container), a)
    expect(onFiles).toHaveBeenCalledTimes(2)
  })
  it('does not call onFiles for an empty choice', () => {
    const onFiles = vi.fn()
    const { container } = render(<ImageFileInput onFiles={onFiles} />)
    input(container).dispatchEvent(new Event('change', { bubbles: true }))
    expect(onFiles).not.toHaveBeenCalled()
  })
  it('uses the latest onFiles', async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { container, rerender } = render(<ImageFileInput onFiles={first} />)
    rerender(<ImageFileInput onFiles={second} />)
    await userEvent.upload(input(container), a)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})

describe('ImageFileInput: open()', () => {
  it('clicks the input', () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
    const ref = createRef<ImageFileInputHandle>()
    const { container } = render(<ImageFileInput ref={ref} capture onFiles={() => {}} />)
    ref.current!.open()
    expect(click).toHaveBeenCalledOnce()
    expect(click.mock.contexts[0]).toBe(input(container))
  })
  it('the handle keeps its identity across renders', () => {
    const ref = createRef<ImageFileInputHandle>()
    const { rerender } = render(<ImageFileInput ref={ref} onFiles={() => {}} />)
    const first = ref.current
    rerender(<ImageFileInput ref={ref} multiple onFiles={() => {}} />)
    expect(ref.current).toBe(first)
  })
})
