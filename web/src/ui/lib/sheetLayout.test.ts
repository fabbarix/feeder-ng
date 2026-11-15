// B9-14 / SHORT-02 rule 5 and the P33 floor: the pure decisions behind the sheet layout (`ui/lib/sheetLayout.ts`, a new module).
//   footerShouldFlow({ panel, body, bodyScroll }): the footer follows the body (BottomSheet sets data-footer="flow") when the
//     body would show less than 40 % of the panel while its content is taller than what it shows. Heights are in px.
//   sheetBodyFloor(innerHeight): the body floor, min(96 px, 30 % of the viewport height), the number rule P33 judges by.
//   SHEET_FLOW_RATIO = 0.4; SHORT_VIEWPORT_QUERY = '(max-height: 499px)'; POPOVER_SHEET_QUERY = '(max-width: 767px), (max-height: 599px)'
import { describe, expect, it } from 'vitest'
import { footerShouldFlow, POPOVER_SHEET_QUERY, SHEET_FLOW_RATIO, SHORT_VIEWPORT_QUERY, sheetBodyFloor } from './sheetLayout'

describe('footerShouldFlow (SHORT-02 rule 5)', () => {
  it('flows at 39 % and not at 41 % (the content is taller than the body shows)', () => {
    expect(footerShouldFlow({ panel: 1000, body: 390, bodyScroll: 900 })).toBe(true)
    expect(footerShouldFlow({ panel: 1000, body: 410, bodyScroll: 900 })).toBe(false)
  })
  it('does not flow at exactly 40 % (the body keeps the share it is owed)', () => {
    expect(footerShouldFlow({ panel: 1000, body: 400, bodyScroll: 900 })).toBe(false)
  })
  it('does not flow when the body shows all its content, however small the panel makes it', () => {
    expect(footerShouldFlow({ panel: 1000, body: 200, bodyScroll: 200 })).toBe(false)
    expect(footerShouldFlow({ panel: 1000, body: 200, bodyScroll: 199 })).toBe(false)
  })
  it('does not flow for an empty or unmeasured panel', () => {
    expect(footerShouldFlow({ panel: 0, body: 0, bodyScroll: 0 })).toBe(false)
    expect(footerShouldFlow({ panel: 0, body: 0, bodyScroll: 500 })).toBe(false)
  })
  it('the ratio is 0.4', () => {
    expect(SHEET_FLOW_RATIO).toBe(0.4)
  })
})

describe('sheetBodyFloor (rule P33)', () => {
  it('is 96 px on a tall viewport and 30 % of the height on a short one', () => {
    expect(sheetBodyFloor(844)).toBe(96)
    expect(sheetBodyFloor(390)).toBeCloseTo(96, 5) // 117 -> capped at 96
    expect(sheetBodyFloor(256)).toBeCloseTo(76.8, 5) // the 400 % zoom size
    expect(sheetBodyFloor(0)).toBe(0)
  })
})

describe('the shared queries', () => {
  it('a short viewport is under 500 px tall; a popover becomes a sheet on a phone or a short viewport', () => {
    expect(SHORT_VIEWPORT_QUERY).toBe('(max-height: 499px)')
    expect(POPOVER_SHEET_QUERY).toBe('(max-width: 767px), (max-height: 599px)')
  })
})
