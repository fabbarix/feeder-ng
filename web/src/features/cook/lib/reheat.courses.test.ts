// CRS F (spec 11): a Reheat item starts the SAME Reheat timer as the Reheat screen, so the two never run twice.
import { describe, expect, it } from 'vitest'
import { reheatTimerOfCourse } from './reheat'
import { timer } from '../timeline-fixtures'

const reheat = (scope: string, over = {}) => timer({ id: 9, scope, step: null, label: 'Reheat', ...over })

describe('reheatTimerOfCourse', () => {
  it('finds the free Reheat timer of the Course\'s scope', () => {
    const t = reheat('meal:2026-11-10/4/3')
    expect(reheatTimerOfCourse([timer(), t], 'meal:2026-11-10/4/3', 1)).toBe(t)
  })

  it('finds the main Course\'s timer whichever form the scope has (two-part now, three-part after C3)', () => {
    const t = reheat('meal:2026-11-10/4')
    expect(reheatTimerOfCourse([t], 'meal:2026-11-10/4/1', 1)).toBe(t)
    expect(reheatTimerOfCourse([reheat('meal:2026-11-10/4/1')], 'meal:2026-11-10/4', 1)).not.toBeNull()
  })

  it('ignores another Course\'s Reheat timer, a Step timer and any other label', () => {
    expect(reheatTimerOfCourse([reheat('meal:2026-11-10/4/2')], 'meal:2026-11-10/4/3', 1)).toBeNull()
    expect(reheatTimerOfCourse([timer({ scope: 'meal:2026-11-10/4/3', step: 0 })], 'meal:2026-11-10/4/3', 1)).toBeNull()
    expect(reheatTimerOfCourse([reheat('meal:2026-11-10/4/3', { label: 'Rest' })], 'meal:2026-11-10/4/3', 1)).toBeNull()
  })

  it('finds it in any state (a paused or finished one still exists)', () => {
    expect(reheatTimerOfCourse([reheat('meal:2026-11-10/4/3', { state: 'finished' })], 'meal:2026-11-10/4/3', 1)).not.toBeNull()
  })
})
