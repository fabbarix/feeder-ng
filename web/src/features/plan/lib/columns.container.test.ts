// R2-2 (L-05): the Plan week is chosen by the grid container's width. 7 columns only when each day tile gets about 160 px+.
import { describe, expect, it } from 'vitest'
import { planColumnsForContainer } from './columns'

describe('planColumnsForContainer', () => {
  it.each([
    [358, 2], // 390 px phone minus gutters
    [559, 2],
    [560, 4],
    [640, 4], // 820 px tablet beside the 88 px rail
    [1160, 4], // 1440 px desktop beside the 240 px rail: stays 4, not seven 140 px tiles
    [1199, 4],
    [1200, 7],
    [1480, 7], // the wide page at 1920: day tiles of about 200 px
  ])('a %i px container has %i columns', (width, columns) => {
    expect(planColumnsForContainer(width)).toBe(columns)
  })
})
