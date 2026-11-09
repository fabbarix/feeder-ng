import { describe, expect, it } from 'vitest'
import { PLANNER_ANCHORS, plannerStyleLabel, snapPlannerStyle } from './plannerStyle'

describe('plannerStyleLabel', () => {
  it('names the three anchors', () => {
    expect(plannerStyleLabel(0)).toBe('Use what we have')
    expect(plannerStyleLabel(0.5)).toBe('Variety')
    expect(plannerStyleLabel(1)).toBe('Favourites')
  })

  it('describes positions between anchors', () => {
    expect(plannerStyleLabel(0.25)).toBe('Between Use what we have and Variety')
    expect(plannerStyleLabel(0.8)).toBe('Between Variety and Favourites')
  })

  it('the middle anchor is the default', () => {
    expect(PLANNER_ANCHORS.map((a) => a.position)).toEqual([0, 0.5, 1])
  })
})

describe('snapPlannerStyle', () => {
  it('clamps to 0..1', () => {
    expect(snapPlannerStyle(-1)).toBe(0)
    expect(snapPlannerStyle(3)).toBe(1)
  })

  it('snaps to an anchor within 0.04', () => {
    expect(snapPlannerStyle(0.47)).toBe(0.5)
    expect(snapPlannerStyle(0.53)).toBe(0.5)
    expect(snapPlannerStyle(0.97)).toBe(1)
    expect(snapPlannerStyle(0.03)).toBe(0)
  })

  it('keeps other positions, rounded to 2 decimals', () => {
    expect(snapPlannerStyle(0.3)).toBe(0.3)
    expect(snapPlannerStyle(0.3333333)).toBe(0.33)
    expect(snapPlannerStyle(0.7)).toBe(0.7)
  })
})
