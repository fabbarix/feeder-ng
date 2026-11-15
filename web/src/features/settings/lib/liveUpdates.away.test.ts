// B9-46 (PC-08): a household event {"changed":"away"} makes the Aways, Who's eating and the Meal Slots stale.
import { describe, expect, it } from 'vitest'
import { staleKeysFor } from './liveUpdates'

describe('staleKeysFor: away', () => {
  it('refetches the Aways and the date attendance (its away rows and portions)', () => {
    const keys = staleKeysFor({ changed: 'away' })
    expect(keys).toContainEqual(['household', 'away'])
    expect(keys).toContainEqual(['household', 'attendance'])
  })
})
