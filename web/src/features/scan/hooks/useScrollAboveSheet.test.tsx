// B9-35 (SSP-06): useScrollAboveSheet gains "scroll the newest row into view": useScrollAboveSheet(pricingKey, fresh).
//   `fresh` is useJustScanned's value ({ key, pulse }). When it changes to a new value (a typed or read scan puts a row on top) the row
//   marked data-fresh is scrolled into view with scrollIntoView({ block: 'nearest' }) (smooth, or 'auto' with reduced motion); the row's
//   scroll-margin-block-end (scan.css: var(--nav-clearance)) keeps it above the bottom bar. While a Price entry is open the existing
//   scroll above the sheet applies instead. null (or an unchanged value) scrolls nothing.
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JustScanned } from './useJustScanned'
import { useScrollAboveSheet } from './useScrollAboveSheet'

const scrollIntoView = vi.fn()
let frame: FrameRequestCallback[] = []

beforeEach(() => {
  scrollIntoView.mockReset()
  frame = []
  Element.prototype.scrollIntoView = scrollIntoView
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frame.push(cb)
    return frame.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  document.body.innerHTML = '<ul><li class="list-row" data-fresh="a" id="new">New</li><li class="list-row" id="old">Old</li></ul>'
})
afterEach(() => vi.restoreAllMocks())

const flush = () => frame.splice(0).forEach((cb) => cb(0))
const fresh = (pulse: 'a' | 'b', key = '7'): JustScanned => ({ key, pulse })

describe('useScrollAboveSheet: the newest row', () => {
  it('scrolls the fresh row into view, nearest, when a scan lands', () => {
    renderHook(() => useScrollAboveSheet(null, fresh('a')))
    flush()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(document.getElementById('new'))
    expect(scrollIntoView.mock.calls[0]![0]).toMatchObject({ block: 'nearest' })
  })

  it('a rescan of the same row (the pulse flips) scrolls again; a rerender with the same value does not', () => {
    const { rerender } = renderHook((p: { f: JustScanned | null }) => useScrollAboveSheet(null, p.f), { initialProps: { f: fresh('a') as JustScanned | null } })
    flush()
    rerender({ f: fresh('a') })
    flush()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    rerender({ f: fresh('b') })
    flush()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('nothing fresh (the stored session coming back, an Undo) scrolls nothing', () => {
    renderHook(() => useScrollAboveSheet(null, null))
    flush()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('smooth by default, instant with reduced motion', () => {
    renderHook(() => useScrollAboveSheet(null, fresh('a')))
    flush()
    expect(scrollIntoView.mock.calls[0]![0]).toMatchObject({ behavior: 'smooth' })
    scrollIntoView.mockReset()
    window.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    renderHook(() => useScrollAboveSheet(null, fresh('b')))
    flush()
    expect(scrollIntoView.mock.calls[0]![0]).toMatchObject({ behavior: 'auto' })
  })

  it('while a Price entry is open the fresh row does not scroll (the row above the sheet wins)', () => {
    renderHook(() => useScrollAboveSheet('7', fresh('a')))
    flush()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('does not scroll when no row is marked fresh (nothing to find)', () => {
    document.body.innerHTML = '<ul><li class="list-row">Old</li></ul>'
    renderHook(() => useScrollAboveSheet(null, fresh('a')))
    flush()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
