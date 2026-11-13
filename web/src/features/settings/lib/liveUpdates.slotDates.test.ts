// B5-F1: a household event {"changed":"slotDates"} refreshes "Dates that differ".
import { describe, expect, it } from 'vitest'
import { staleKeysFor } from './liveUpdates'

describe('staleKeysFor: slotDates', () => {
  it('refetches the plan read behind "Dates that differ"', () => {
    expect(staleKeysFor({ changed: 'slotDates' })).toContainEqual(['plan', 'dates-that-differ'])
  })
})
