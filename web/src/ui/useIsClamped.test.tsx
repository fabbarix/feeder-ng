// B9-27 (RX-05): useIsClamped(ref, deps?) says whether a line-clamped text is cut: its scroll height is taller than its box.
// jsdom lays nothing out, so the element's sizes are set by the test.
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef } from 'react'
import { useIsClamped } from './useIsClamped'

const sizes = { scrollHeight: 0, clientHeight: 0 }
function Probe({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const clamped = useIsClamped(ref, [text])
  return (
    <p ref={ref} data-testid="p" data-clamped={String(clamped)}>
      {text}
    </p>
  )
}
const define = (el: HTMLElement) => {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => sizes.scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => sizes.clientHeight })
}
afterEach(() => vi.unstubAllGlobals())

describe('useIsClamped', () => {
  it('is false when the text fits its box', () => {
    sizes.scrollHeight = 60
    sizes.clientHeight = 60
    const { getByTestId } = render(<Probe text="short" />)
    expect(getByTestId('p')).toHaveAttribute('data-clamped', 'false')
  })
  it('is true when the text is taller than its box (the clamp cuts it)', () => {
    const proto = HTMLElement.prototype
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 120 })
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 60 })
    const { getByTestId } = render(<Probe text="a long text" />)
    expect(getByTestId('p')).toHaveAttribute('data-clamped', 'true')
    delete (proto as unknown as Record<string, unknown>).scrollHeight
    delete (proto as unknown as Record<string, unknown>).clientHeight
  })
  it('measures again when the box is resized', () => {
    let notify: () => void = () => {}
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb
        }
        observe() {}
        disconnect() {}
      },
    )
    sizes.scrollHeight = 60
    sizes.clientHeight = 60
    const { getByTestId } = render(<Probe text="resizes" />)
    define(getByTestId('p'))
    expect(getByTestId('p')).toHaveAttribute('data-clamped', 'false')
    sizes.scrollHeight = 120
    act(() => notify())
    expect(getByTestId('p')).toHaveAttribute('data-clamped', 'true')
  })
})
