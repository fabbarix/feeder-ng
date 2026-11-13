// DS-SHOP: "Includes Thu Dinner, not marked Cooked yet / Mark it" is said ONCE, in a notice above the list (system.md §3).
import { describe, expect, it } from 'vitest'
import { makeLine, makeList, makePast } from '../testData'
import { unconfirmedNotice } from './notice'

const lunch = (over = {}) => makePast({ date: '2026-11-04', mealSlotId: 1, mealSlotName: 'Lunch', ...over })

describe('unconfirmedNotice', () => {
  it('is null when no Line includes unconfirmed past meals', () => {
    expect(unconfirmedNotice(makeList())).toBeNull()
  })

  it('names the slots once, with the Mark it target (the oldest slot) and the number of Lines', () => {
    const list = makeList({ lines: [makeLine({ pastPlannedMeals: [makePast()] })] })
    expect(unconfirmedNotice(list)).toEqual({ text: 'Includes Tue Dinner, not marked Cooked yet', count: 1, markIt: { date: '2026-11-03', mealSlotId: 3 } })
  })

  it('joins the slots of every open Line, each slot once however many Lines include it', () => {
    const list = makeList({
      lines: [
        makeLine({ ingredientId: 1, pastPlannedMeals: [makePast()] }),
        makeLine({ ingredientId: 2, pastPlannedMeals: [makePast(), lunch({ courseName: '' })] }),
        makeLine({ ingredientId: 3 }),
      ],
    })
    const n = unconfirmedNotice(list)
    expect(n?.text).toBe('Includes Tue Dinner and Wed Lunch, not marked Cooked yet')
    expect(n?.count).toBe(2)
  })

  it('merges the Courses of one slot across Lines, without repeating one', () => {
    const list = makeList({
      lines: [
        makeLine({ ingredientId: 1, pastPlannedMeals: [makePast({ courseName: 'Main' })] }),
        makeLine({ ingredientId: 2, pastPlannedMeals: [makePast({ courseName: 'Main' }), makePast({ courseName: 'Side' })] }),
      ],
    })
    expect(unconfirmedNotice(list)?.text).toBe('Includes Tue Dinner (Main, Side), not marked Cooked yet')
  })

  it('Mark it opens the oldest slot among all Lines', () => {
    const list = makeList({
      lines: [makeLine({ ingredientId: 1, pastPlannedMeals: [lunch()] }), makeLine({ ingredientId: 2, pastPlannedMeals: [makePast()] })],
    })
    expect(unconfirmedNotice(list)?.markIt).toEqual({ date: '2026-11-03', mealSlotId: 3 })
  })

  it('ticked and Not needed Lines do not count: only what is still to get', () => {
    const list = makeList({
      lines: [makeLine({ ticked: true, quantity: 0, pastPlannedMeals: [makePast()] })],
      notNeeded: [makeLine({ ingredientId: 5, pastPlannedMeals: [makePast()] })],
    })
    expect(unconfirmedNotice(list)).toBeNull()
  })

  it('tolerates a list saved by an older version (no pastPlannedMeals)', () => {
    expect(unconfirmedNotice(makeList({ lines: [makeLine({ pastPlannedMeals: undefined })] }))).toBeNull()
  })
})
