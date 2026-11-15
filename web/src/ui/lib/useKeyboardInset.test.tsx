// B9-19 (SHORT-04, SHORT 2): useKeyboardInset, mounted once in AppShell, sets data-keyboard="open" on <html> and --keyboard-inset
// while a text field has focus on a coarse pointer, and clears both 150 ms after focus leaves.
import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useKeyboardInset } from './useKeyboardInset'

function Probe() {
  useKeyboardInset()
  return (
    <>
      <input aria-label="Name" />
      <textarea aria-label="Description" />
      <input type="checkbox" aria-label="Done" />
      <button type="button">Save</button>
    </>
  )
}

const html = document.documentElement
const open = () => html.getAttribute('data-keyboard')
const inset = () => html.style.getPropertyValue('--keyboard-inset')

type VvListener = () => void
let vvListeners: Record<string, VvListener[]>
let vv: { height: number; offsetTop: number }
function stubEnvironment({ coarse = true, visualViewport = true }: { coarse?: boolean; visualViewport?: boolean } = {}) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('pointer: coarse') ? coarse : false, media: q, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal('innerHeight', 844)
  vvListeners = { resize: [], scroll: [] }
  vv = { height: 844, offsetTop: 0 }
  if (visualViewport) {
    vi.stubGlobal('visualViewport', {
      get height() {
        return vv.height
      },
      get offsetTop() {
        return vv.offsetTop
      },
      addEventListener: (t: string, cb: VvListener) => vvListeners[t]?.push(cb),
      removeEventListener: (t: string, cb: VvListener) => {
        const l = vvListeners[t]
        if (l) l.splice(l.indexOf(cb) >>> 0, 1)
      },
    })
  } else vi.stubGlobal('visualViewport', undefined)
}
const fire = (t: 'resize' | 'scroll') => act(() => vvListeners[t]!.slice().forEach((cb) => cb()))

beforeEach(() => {
  vi.useFakeTimers()
  stubEnvironment()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  html.removeAttribute('data-keyboard')
  html.style.removeProperty('--keyboard-inset')
})

const focus = (el: HTMLElement) => act(() => el.focus())
const blur = (el: HTMLElement) => act(() => el.blur())

describe('useKeyboardInset', () => {
  it('opens as soon as a text field takes focus on a coarse pointer', () => {
    const { getByLabelText } = render(<Probe />)
    expect(open()).toBeNull()
    focus(getByLabelText('Name'))
    expect(open()).toBe('open')
  })

  it('a textarea counts; a checkbox and a button do not', () => {
    const { getByLabelText, getByRole } = render(<Probe />)
    focus(getByLabelText('Description'))
    expect(open()).toBe('open')
    blur(getByLabelText('Description'))
    act(() => void vi.advanceTimersByTime(200))
    focus(getByLabelText('Done'))
    expect(open()).toBeNull()
    focus(getByRole('button', { name: 'Save' }))
    expect(open()).toBeNull()
  })

  it('does not open on a fine pointer (a desktop keeps its bar while typing)', () => {
    stubEnvironment({ coarse: false })
    const { getByLabelText } = render(<Probe />)
    focus(getByLabelText('Name'))
    expect(open()).toBeNull()
  })

  it('does not open without matchMedia (jsdom, old browsers): the desktop presentation', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { getByLabelText } = render(<Probe />)
    focus(getByLabelText('Name'))
    expect(open()).toBeNull()
  })

  it('closes 150 ms after focus leaves the field, not before (the restore delay)', () => {
    const { getByLabelText } = render(<Probe />)
    const name = getByLabelText('Name')
    focus(name)
    blur(name)
    act(() => void vi.advanceTimersByTime(149))
    expect(open()).toBe('open')
    act(() => void vi.advanceTimersByTime(1))
    expect(open()).toBeNull()
  })

  it('moving from one text field to the next never lets the bar flicker back', () => {
    const { getByLabelText } = render(<Probe />)
    focus(getByLabelText('Name'))
    focus(getByLabelText('Description')) // blur then focus in the same tick
    act(() => void vi.advanceTimersByTime(500))
    expect(open()).toBe('open')
  })

  it('--keyboard-inset follows the visual viewport while open and goes away with the keyboard', () => {
    const { getByLabelText } = render(<Probe />)
    const name = getByLabelText('Name')
    focus(name)
    vv.height = 544
    fire('resize')
    expect(inset()).toBe('300px')
    vv.height = 500
    vv.offsetTop = 20
    fire('scroll')
    expect(inset()).toBe('324px')
    blur(name)
    act(() => void vi.advanceTimersByTime(150))
    expect(inset()).toBe('')
    expect(open()).toBeNull()
  })

  it('--keyboard-inset is 0px while open on a browser that resizes the layout viewport itself (the visual viewport equals it)', () => {
    const { getByLabelText } = render(<Probe />)
    focus(getByLabelText('Name'))
    expect(inset()).toBe('0px')
  })

  it('works without a visual viewport: opens, inset 0px', () => {
    stubEnvironment({ visualViewport: false })
    const { getByLabelText } = render(<Probe />)
    focus(getByLabelText('Name'))
    expect(open()).toBe('open')
    expect(inset()).toBe('0px')
  })

  it('a visual viewport change with no field focused sets nothing (a pinch zoom is not a keyboard)', () => {
    render(<Probe />)
    vv.height = 400
    fire('resize')
    expect(inset()).toBe('')
    expect(open()).toBeNull()
  })

  it('unmount removes the attribute, the property and every listener', () => {
    const { getByLabelText, unmount } = render(<Probe />)
    focus(getByLabelText('Name'))
    expect(open()).toBe('open')
    unmount()
    expect(open()).toBeNull()
    expect(inset()).toBe('')
    expect(vvListeners.resize).toHaveLength(0)
    expect(vvListeners.scroll).toHaveLength(0)
  })

  it('a pending restore does not fire after unmount', () => {
    const { getByLabelText, unmount } = render(<Probe />)
    const name = getByLabelText('Name')
    focus(name)
    blur(name)
    unmount()
    expect(() => act(() => void vi.advanceTimersByTime(500))).not.toThrow()
    expect(open()).toBeNull()
  })
})
