// SR5: the copy of the new-Product sheet is the spec's (13.5, 13.8) and the mockups'; the GLOSSARY words are used as defined.
import { describe, expect, it } from 'vitest'
import { newProductStrings as s } from './newProductStrings'

describe('newProductStrings', () => {
  it('has the spec\'s fixed copy', () => {
    expect([s.title, s.whichLine, s.somethingElse, s.moreLines, s.takePicture, s.choosePicture, s.retake, s.rename, s.moreThisShop, s.add]).toEqual([
      'What is this?',
      'Which Line is it?',
      'Something else',
      'More Lines',
      'Take a Picture',
      'Choose a Picture',
      'Retake',
      'Rename',
      'More: This Shop only',
      'Add',
    ])
  })
  it('builds the parameterised copy', () => {
    expect(s.addTicks('Eggs')).toBe('Add · ticks Eggs')
    expect(s.savedAs('Eggs 6 pieces')).toBe('Saved as “Eggs 6 pieces”, Any Shop.')
    expect(s.savedAsShop('Eggs 6 pieces', 'Coop')).toBe('Saved as “Eggs 6 pieces”, Coop only.')
    expect(s.newSupplyRow('dish')).toBe('New Supply “dish”')
    expect(s.newIngredientRow('dish')).toBe('New Ingredient “dish”')
    expect(s.barcodeNotKnown('8001234567890')).toBe('8001234567890 · not in Feeder yet')
    expect(s.eyebrow('Dish soap', 'supply')).toBe('Dish soap · Supply')
    expect(s.eyebrow('Eggs', 'food')).toBe('Eggs · Ingredient')
  })
  it('never says a word GLOSSARY lists under _Avoid_ for Shopping List lines, kinds or shops', () => {
    const text = JSON.stringify([Object.values(s).filter((v) => typeof v === 'string'), s.addTicks('x'), s.savedAs('x')]).toLowerCase()
    for (const avoid of ['grocery', 'store ', 'item ', 'consumable', 'household item']) expect(text).not.toContain(avoid)
  })
})
