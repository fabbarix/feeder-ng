// A11Y-12 (B9-16): a TextArea grows with its text from 3 lines and stops at 12, where it scrolls. Where `field-sizing: content` is
// supported the CSS does it and the hook does nothing; elsewhere `useAutoGrow` sets the height from scrollHeight on every value change.
// Signature: useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, options?: { maxRows?: number }): void   (default maxRows 12)
import { render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutoGrow } from './useAutoGrow'

let scrollHeight = 0
let heightsAtMeasure: string[] = []
beforeEach(() => {
  scrollHeight = 0
  heightsAtMeasure = []
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLTextAreaElement) {
      heightsAtMeasure.push(this.style.height)
      return scrollHeight
    },
  })
  vi.stubGlobal('CSS', { supports: () => false })
})
afterEach(() => {
  delete (HTMLTextAreaElement.prototype as { scrollHeight?: unknown }).scrollHeight
  vi.unstubAllGlobals()
})

function Harness({ value, maxRows }: { value: string; maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useAutoGrow(ref, value, maxRows === undefined ? undefined : { maxRows })
  // 20 px lines and 12 px of padding above and below: 12 lines are 12 x 20 + 24 = 264 px
  return <textarea ref={ref} aria-label="Notes" value={value} readOnly style={{ lineHeight: '20px', paddingTop: '12px', paddingBottom: '12px' }} />
}
const area = () => document.querySelector('textarea')!

describe('useAutoGrow', () => {
  it('sets the height to the content (scrollHeight) while it is under 12 lines, and hides the scrollbar', () => {
    scrollHeight = 100
    render(<Harness value="a" />)
    expect(area().style.height).toBe('100px')
    expect(area().style.overflowY).toBe('hidden')
  })

  it('stops at 12 lines plus the padding (264 px here) and scrolls beyond', () => {
    scrollHeight = 500
    render(<Harness value={'x\n'.repeat(40)} />)
    expect(area().style.height).toBe('264px')
    expect(area().style.overflowY).toBe('auto')
  })

  it('the limit is an option: maxRows 5 is 5 x 20 + 24 = 124 px', () => {
    scrollHeight = 500
    render(<Harness value="x" maxRows={5} />)
    expect(area().style.height).toBe('124px')
  })

  it('measures from "auto", so deleting text shrinks the field again', () => {
    scrollHeight = 200
    const { rerender } = render(<Harness value="long" />)
    expect(area().style.height).toBe('200px')
    scrollHeight = 60
    heightsAtMeasure = []
    rerender(<Harness value="s" />)
    expect(heightsAtMeasure[0]).toBe('auto') // the first measure is taken with the old inline height cleared
    expect(area().style.height).toBe('60px')
  })

  it('follows the value on every change', () => {
    scrollHeight = 80
    const { rerender } = render(<Harness value="a" />)
    scrollHeight = 140
    rerender(<Harness value="a\nb\nc" />)
    expect(area().style.height).toBe('140px')
  })

  it('does nothing where field-sizing: content is supported (the CSS grows the field)', () => {
    vi.stubGlobal('CSS', { supports: (p: string, v: string) => p === 'field-sizing' && v === 'content' })
    scrollHeight = 300
    render(<Harness value="x" />)
    expect(area().style.height).toBe('')
    expect(area().style.overflowY).toBe('')
  })

  it('does not throw when there is no ref target yet', () => {
    function Empty() {
      const ref = useRef<HTMLTextAreaElement>(null)
      useAutoGrow(ref, 'x')
      return null
    }
    expect(() => render(<Empty />)).not.toThrow()
  })
})
