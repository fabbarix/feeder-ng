// b9-w2b: a floating popover's floor is the top of the floating bottom bar while it shows (834×1194: the bar's top is 1112).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { floatingFloor, floorFrom, parsePx, readNavTop } from './floatingFloor'

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect

function bar(r: DOMRect, navTop?: string): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = 'bottom-bar'
  if (navTop !== undefined) nav.style.setProperty('--nav-top', navTop)
  nav.getBoundingClientRect = () => r
  document.body.append(nav)
  return nav
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('floorFrom (pure)', () => {
  it('is the viewport bottom without a bar', () => expect(floorFrom(1194, null)).toBe(1194))
  it('is the bar top with one: 1194 - 82 = 1112 at 834×1194', () => expect(floorFrom(1194, 82)).toBe(1112))
  it('ignores a value of zero, below zero or not inside the viewport', () => {
    for (const v of [0, -4, 1194, 2000, Number.NaN]) expect(floorFrom(1194, v)).toBe(1194)
  })
})

describe('parsePx (pure)', () => {
  it('reads a px length', () => {
    expect(parsePx('82px')).toBe(82)
    expect(parsePx(' 81.5px ')).toBe(81.5)
  })
  it('an unresolved calc() or another unit is null', () => {
    for (const v of ['', 'calc(var(--nav-height) + var(--nav-inset))', '5rem', '82']) expect(parsePx(v)).toBeNull()
  })
})

describe('readNavTop and floatingFloor (DOM)', () => {
  it('measures the bar while --nav-top does not resolve to px (today)', () => {
    bar(rect(12, 1112, 810, 70), 'calc(var(--nav-height) + var(--nav-inset))')
    expect(readNavTop(1194)).toBe(82)
    expect(floatingFloor(document.body, 1194)).toBe(1112)
  })
  it('reads --nav-top once it resolves to px (B9-19)', () => {
    bar(rect(12, 1100, 810, 70), '90px')
    expect(readNavTop(1194)).toBe(90)
    expect(floatingFloor(null, 1194)).toBe(1104)
  })
  it('a hidden bar (display: none from 1024) and a page without one leave the viewport bottom', () => {
    expect(floatingFloor(document.body, 900)).toBe(900)
    bar(rect(0, 0, 0, 0))
    expect(readNavTop(900)).toBeNull()
    expect(floatingFloor(document.body, 900)).toBe(900)
  })
  it('a trigger inside an open sheet uses the whole viewport: the sheet covers the bar', () => {
    bar(rect(12, 1112, 810, 70))
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    const trigger = dialog.appendChild(document.createElement('button'))
    document.body.append(dialog)
    expect(floatingFloor(trigger, 1194)).toBe(1194)
  })
})
