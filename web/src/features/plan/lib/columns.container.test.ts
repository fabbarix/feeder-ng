// R2-2 (L-05): the Plan week is chosen by the grid container's width. 7 columns when the container is 1100 px or more (the week in one row from a 1440 px viewport).
import { describe, expect, it } from 'vitest'
import { planColumnsForContainer } from './columns'

describe('planColumnsForContainer', () => {
  it.each([
    [358, 2], // 390 px phone minus gutters
    [559, 2],
    [560, 4],
    [640, 4], // 820 px tablet beside the 88 px rail
    [1099, 4],
    [1100, 7], // threshold: below the 1136 px of a 1440 px viewport beside the 240 px rail (32 px gutters), with scrollbar room
    [1121, 7], // 1440 px with a 15 px scrollbar
    [1136, 7], // 1440 px desktop beside the 240 px rail: the week fits one row
    [1480, 7], // the wide page at 1920: day tiles of about 200 px
  ])('a %i px container has %i columns', (width, columns) => {
    expect(planColumnsForContainer(width)).toBe(columns)
  })
})
