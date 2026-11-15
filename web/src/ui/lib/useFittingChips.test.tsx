// B9-15 (SET-06): useFittingChips and its measure helpers move to ui/lib so the Select panel can use them; the FilterBar path re-exports
// them, so every import written before the move keeps working.
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as moved from './useFittingChips'
import * as old from '../FilterBar/useFittingChips'
import * as filterBar from '../FilterBar'

describe('ui/lib/useFittingChips', () => {
  it('lives in ui/lib and the FilterBar path re-exports the same functions', () => {
    expect(typeof moved.useFittingChips).toBe('function')
    expect(typeof moved.measureChipLine).toBe('function')
    expect(old.useFittingChips).toBe(moved.useFittingChips)
    expect(old.measureChipLine).toBe(moved.measureChipLine)
    expect(filterBar.useFittingChips).toBe(moved.useFittingChips)
    expect(filterBar.measureChipLine).toBe(moved.measureChipLine)
  })
  it('behaves as before: unmeasured shows every chip, a measure puts the rest into "+N"', () => {
    const line = { current: document.createElement('div') }
    expect(renderHook(() => moved.useFittingChips(line, 3)).result.current).toEqual({ visible: 3, hidden: 0 })
    const measure = (): moved.ChipLineMetrics => ({ available: 180, widths: [80, 100], gap: 8, plusWidth: 32 })
    expect(renderHook(() => moved.useFittingChips(line, 2, measure)).result.current).toEqual({ visible: 1, hidden: 1 })
  })
})
