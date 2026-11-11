import { describe, expect, it } from 'vitest'
import * as ui from './index'
import type { MemberPillProps, WeekdayPickerProps } from './index'

describe('ui barrel (R15)', () => {
  it('exports WeekdayPicker, MemberPill and the weekday helpers', () => {
    expect(typeof ui.WeekdayPicker).toBe('function')
    expect(typeof ui.MemberPill).toBe('function')
    expect(ui.weekdayLongName(1, 'en')).toBe('Monday')
    expect(ui.weekdayOrder(1)[0]).toBe(1)
    expect(ui.sortIsoDays([3, 1])).toEqual([1, 3])
    const props: [WeekdayPickerProps, MemberPillProps] = [{ label: 'x', value: [], onChange: () => {} }, { name: 'A', colour: '#000000' }]
    expect(props).toHaveLength(2)
  })
})
