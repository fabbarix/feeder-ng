// B9-07: the sweeps of B9-08, B9-09 and B9-10 import the breakpoint API from the ui barrel ('../../../ui'); this pins the names.
// useMediaQuery stays exported (non-width queries such as (pointer: coarse) still use it) but no feature calls it with a width.
import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel: the breakpoint API', () => {
  it.each(['useBreakpoint', 'useNarrow', 'breakpointQuery'])('exports %s as a function', (name) => {
    expect(typeof (ui as Record<string, unknown>)[name]).toBe('function')
  })
  it('exports the table and the narrow band', () => {
    expect((ui as Record<string, unknown>).BREAKPOINTS).toEqual({ tablet: 37.5, md: 48, desktop: 64, desktopWide: 80, wide: 90 })
    expect((ui as Record<string, unknown>).NARROW).toBe(23.5)
  })
  it('still exports useMediaQuery for non-width queries', () => {
    expect(typeof ui.useMediaQuery).toBe('function')
  })
})
