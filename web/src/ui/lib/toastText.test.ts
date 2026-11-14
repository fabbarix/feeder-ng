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

// Main-session ruling 5: the split is a bridge, so it must never split wrongly. A case it cannot split safely stays one line.
describe('splitToastText: never a wrong split', () => {
  it('does not split after an abbreviation; a later real boundary still splits', () => {
    expect(splitToastText('Saved Dr. Oetker Pizza')).toEqual({ title: 'Saved Dr. Oetker Pizza' })
    expect(splitToastText('Use the Pantry, e.g. The Freezer')).toEqual({ title: 'Use the Pantry, e.g. The Freezer' })
    expect(splitToastText('Bought at St. Albans Market')).toEqual({ title: 'Bought at St. Albans Market' })
    expect(splitToastText('Added 1 tbsp. Salt to the Recipe')).toEqual({ title: 'Added 1 tbsp. Salt to the Recipe' })
    expect(splitToastText('Saved Dr. Oetker Pizza. Undo it from the Recipe.')).toEqual({
      title: 'Saved Dr. Oetker Pizza.',
      body: 'Undo it from the Recipe.',
    })
  })

  it('does not split after an initial', () => {
    expect(splitToastText('Linked J. Smith to Tue Dinner')).toEqual({ title: 'Linked J. Smith to Tue Dinner' })
  })

  it('keeps decimals inside their sentence: "1.5 kg"', () => {
    expect(splitToastText('Used 1.5 kg of Flour. 0.5 kg left in Stock.')).toEqual({
      title: 'Used 1.5 kg of Flour.',
      body: '0.5 kg left in Stock.',
    })
    expect(splitToastText('Moved 1.5 kg to the Freezer')).toEqual({ title: 'Moved 1.5 kg to the Freezer' })
  })

  it('keeps times inside their sentence: "18.30", "7 p.m."', () => {
    expect(splitToastText('Lunch starts at 12.30. Tue Dinner moved.')).toEqual({ title: 'Lunch starts at 12.30.', body: 'Tue Dinner moved.' })
    expect(splitToastText('Dinner starts at 7 p.m. Tue')).toEqual({ title: 'Dinner starts at 7 p.m. Tue' })
  })

  it('a name ending in a full stop followed by lower-case words stays one line; a quoted name never splits', () => {
    expect(splitToastText('Added Yum Inc. to the Plan')).toEqual({ title: 'Added Yum Inc. to the Plan' })
    expect(splitToastText('Saved “Mum’s Pie.” Tue Dinner')).toEqual({ title: 'Saved “Mum’s Pie.” Tue Dinner' })
  })

  it('a single sentence, with or without its full stop, stays one line', () => {
    expect(splitToastText('Swapped Tue Breakfast')).toEqual({ title: 'Swapped Tue Breakfast' })
    expect(splitToastText('  Swapped Tue Breakfast.  ')).toEqual({ title: 'Swapped Tue Breakfast.' })
  })

  it('a trailing ellipsis is one line; an ellipsis before a new sentence ends the headline', () => {
    expect(splitToastText('Reading the photo…')).toEqual({ title: 'Reading the photo…' })
    expect(splitToastText('Reading the photo...')).toEqual({ title: 'Reading the photo...' })
    expect(splitToastText('Reading the photo... This can take a minute.')).toEqual({
      title: 'Reading the photo...',
      body: 'This can take a minute.',
    })
  })
})
