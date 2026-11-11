// R15 send-back: the desktop week grid's cells contain their content (the page is only 720 px wide, so a cell is ~80 px).
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../../../ui/test-utils'

const css = readUiCss('../features/settings/settings.css')
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
const d = (sel: string) => declarations(css, sel)

describe('settings.css: Meal Slot grid cells contain their content', () => {
  it('the table is fixed-layout and the cells may shrink below their content', () => {
    expect(d('.meal-grid')['table-layout']).toBe('fixed')
    expect(d('.meal-grid td')['min-inline-size']).toBe('0')
  })
  it('a cell clips or wraps what is too wide instead of letting it spill into the next column', () => {
    expect(d('.meal-grid td')['overflow']).toMatch(/^(clip|hidden)$/)
    expect(d('.meal-grid__slot')['min-inline-size']).toBe('0')
    expect(d('.meal-grid__slot')['inline-size']).toBe('100%')
  })
  it('the chip wraps: no nowrap, free height, and the time on its own line', () => {
    const chip = d('.meal-grid .chip')
    expect(chip['white-space']).toBe('normal')
    expect(chip['block-size']).toBe('auto')
    expect(chip['min-inline-size']).toBe('0')
    expect(d('.meal-grid .meal-chip__time')['display']).toBe('block')
  })
  it('the pills wrap and the Nobody-attending pill may wrap its text', () => {
    expect(d('.meal-grid .attendee-pills')['flex-wrap']).toBe('wrap')
    expect(d('.meal-grid .nobody-pill')['max-inline-size']).toBe('100%')
    expect(d('.meal-grid .nobody-pill')['white-space']).toBe('normal')
  })
  it('narrow cells collapse the pills to avatars only (a container query on the grid wrapper)', () => {
    expect(d('.meal-grid-wrap')['container-type']).toBe('inline-size')
    expect(bare).toMatch(/@container[^{]*\{[^]*\.member-pill__name[^{]*\{[^}]*display\s*:\s*none/)
  })
  it('the row header column is narrow enough to leave room for seven day columns at 720 px', () => {
    const w = d(".meal-grid th[scope='row']")['inline-size']!
    expect(w).toMatch(/^\d+(\.\d+)?rem$/)
    expect(parseFloat(w)).toBeLessThanOrEqual(5)
  })
})

describe('the Meal Slot sheet does not scroll sideways at 390 px', () => {
  it('the attendance row leaves room for the 6 px hit area that the stepper icon buttons stick out by', () => {
    expect(parseInt(d('.attendance__row')['padding-inline-end'] ?? '0', 10)).toBeGreaterThanOrEqual(6)
  })
})
