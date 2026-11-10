import { describe, expect, it } from 'vitest'
import { notificationStrings } from './strings'

describe('notificationStrings', () => {
  const t = notificationStrings.types

  it('uses the Glossary terms Advance Step and Planned Meal', () => {
    expect(t.advanceStep.hint).toBe('When an Advance Step needs to start')
    expect(t.startCooking.hint).toBe('When it is time to start so the Planned Meal is ready on time')
    expect(t.confirmCooked.hint).toBe('2 hours after a Planned Meal, if you have not confirmed it')
  })

  it('never uses the avoided "prep-ahead"', () => {
    expect(JSON.stringify(notificationStrings).toLowerCase()).not.toContain('prep-ahead')
  })
})
