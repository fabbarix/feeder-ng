// DS-12 R-D: the string form of a toast splits a multi-sentence message into a headline and a body.
import { describe, expect, it } from 'vitest'
import { splitToastText } from './toastText'

describe('splitToastText', () => {
  it('keeps one sentence as the title', () => {
    expect(splitToastText('Saved')).toEqual({ title: 'Saved' })
    expect(splitToastText('Linked 2 Recipes.')).toEqual({ title: 'Linked 2 Recipes.' })
  })

  it('splits the first sentence off as the headline, words unchanged', () => {
    expect(splitToastText('That did not save. Try again.')).toEqual({ title: 'That did not save.', body: 'Try again.' })
  })

  it('keeps ! and ? on the headline', () => {
    expect(splitToastText('Cooked, nice one! 1.25 portions kept for Mon Dinner.')).toEqual({
      title: 'Cooked, nice one!',
      body: '1.25 portions kept for Mon Dinner.',
    })
  })

  it('never splits inside a number or before a lower-case word', () => {
    expect(splitToastText('Moved 1.25 portions to the Freezer')).toEqual({ title: 'Moved 1.25 portions to the Freezer' })
    expect(splitToastText('Use the Pantry, e.g. the Freezer')).toEqual({ title: 'Use the Pantry, e.g. the Freezer' })
  })

  it('keeps every later sentence in the body', () => {
    expect(splitToastText("Couldn't save Sam's Dislikes. Nothing changed. Try again.")).toEqual({
      title: "Couldn't save Sam's Dislikes.",
      body: 'Nothing changed. Try again.',
    })
  })
})
