import { describe, expect, it } from 'vitest'
import {
  actionError, answerToast, freezeNote, freezeTitle, freezeToast, fromLeftoverLabel, hadItTitle, hadItToast, leftoverStrings,
  portionsLabel, questionText, replannedNote, takeOutNote, takeOutTitle, takeOutToast, threwOutToast, throwOutTitle, useByPhrase,
} from './copy'

const T = '2026-11-12'

describe('portionsLabel', () => {
  it('says portion for one and portions otherwise', () => {
    expect(portionsLabel(1)).toBe('1 portion')
    expect(portionsLabel(2)).toBe('2 portions')
    expect(portionsLabel(1.5)).toBe('1.5 portions')
    expect(portionsLabel(0.5)).toBe('0.5 portions')
  })
})

describe('sheet copy', () => {
  it('titles', () => {
    expect(hadItTitle('Chilli')).toBe('How many portions of Chilli did you have?')
    expect(throwOutTitle('Chilli')).toBe('Throw out Chilli?')
    expect(freezeTitle('Chilli')).toBe('Freeze Chilli')
    expect(takeOutTitle('Chilli')).toBe('Take Chilli out of the freezer?')
  })
  it('fixed lines and button labels use the GLOSSARY words', () => {
    expect(leftoverStrings.hadIt).toBe('Had it')
    expect(leftoverStrings.threwOut).toBe('Threw it out')
    expect(leftoverStrings.wasntThere).toBe("Wasn't there")
    expect(leftoverStrings.freezeIt).toBe('Freeze it')
    expect(leftoverStrings.takeOut).toBe('Take out')
    expect(leftoverStrings.wasteNote).toBe('This counts as waste: the zero-waste streak starts again today.')
    expect(leftoverStrings.addFreezerFirst).toBe('Add a Freezer first')
    expect(leftoverStrings.fromTheFreezer).toBe('From the freezer')
    expect(leftoverStrings.fromTheFreezerHint).toBe('From the freezer: take it out the day before')
  })
  it('notes under the Storage Place field', () => {
    expect(freezeNote('2027-02-10', 90, T)).toBe('Use by 10 Feb in the freezer (90 days)')
    expect(takeOutNote('2026-11-15', 3, T)).toBe('Use by Sun once out (3 days)')
  })
  it('names a Planned Meal that is planned again (from the server dry run, which has no portions)', () => {
    expect(replannedNote({ date: '2026-11-13', mealSlotId: 2, mealSlotName: 'Lunch', courseId: 1 })).toBe('Fri Lunch was going to have it; it is planned again.')
  })
})

describe('question and Use-by phrases', () => {
  it('asks the decided question', () => {
    expect(questionText('Chilli', '2026-11-10', T)).toBe("Chilli was to be used by Tue. Had it, threw it out, or wasn't there?")
  })
  it('useByPhrase', () => {
    expect(useByPhrase('2026-11-12', T)).toBe('Use by today')
    expect(useByPhrase('2026-11-13', T)).toBe('Use by tomorrow')
    expect(useByPhrase('2026-11-14', T)).toBe('Use by Sat')
    expect(useByPhrase('2027-02-10', T)).toBe('Use by 10 Feb')
  })
})

describe('toasts', () => {
  it('Had it names the portions and what is left', () => {
    expect(hadItToast('Chilli', 2, 1)).toBe('Noted: 2 portions of Chilli. 1 left.')
    expect(hadItToast('Chilli', 1, 0)).toBe('Noted: 1 portion of Chilli. None left.')
  })
  it('Threw it out, Freeze it, Take out and the answers', () => {
    expect(threwOutToast('Chilli', 3)).toBe('Threw out 3 portions of Chilli.')
    expect(freezeToast('Chilli', 'Garage Freezer', '2027-02-10', T)).toBe('Chilli is in Garage Freezer. Use by 10 Feb.')
    expect(takeOutToast('Chilli', '2026-11-15', T)).toBe('Chilli is out of the freezer. Use by Sun.')
    expect(answerToast('Chilli', 'had_it')).toBe('Noted: Chilli was had.')
    expect(answerToast('Chilli', 'threw_out')).toBe('Threw out Chilli.')
    expect(answerToast('Chilli', 'wasnt_there')).toBe("Chilli removed: it wasn't there.")
  })
})

describe('From links', () => {
  it('names the day the Leftover was cooked', () => {
    expect(fromLeftoverLabel('2026-11-09', 'Chilli')).toBe("From Mon's Chilli")
  })
})

describe('actionError', () => {
  it('maps the API codes', () => {
    expect(actionError({ status: 409, code: 'leftover_past_use_by' }, 'Chilli')).toBe('Chilli is past its Use-by, so it cannot be frozen.')
    expect(actionError({ status: 409, code: 'leftover_frozen' }, 'Chilli')).toBe('Chilli is already frozen.')
    expect(actionError({ status: 409, code: 'leftover_not_frozen' }, 'Chilli')).toBe('Chilli is not frozen.')
    expect(actionError({ status: 409, code: 'leftover_not_to_answer' }, 'Chilli')).toBe('Chilli was already answered.')
    expect(actionError({ status: 422, code: 'portions_invalid' }, 'Chilli')).toBe('There are not that many portions of Chilli left.')
    expect(actionError({ status: 422, code: 'storage_place_not_freezer' }, 'Chilli')).toBe('Pick a Storage Place of kind freezer.')
    expect(actionError({ status: 422, code: 'storage_place_freezer' }, 'Chilli')).toBe('Pick a Storage Place that is not a freezer.')
    expect(actionError({ status: 422, code: 'storage_place_unknown' }, 'Chilli')).toBe('That Storage Place is gone. Pick another.')
    expect(actionError({ status: 422, code: 'leftover_too_small' }, 'Chilli')).toBe('There are too few portions of Chilli left for that Planned Meal.')
    expect(actionError({ status: 404, code: 'not_found' }, 'Chilli')).toBe('Chilli is gone.')
  })
  it('falls back to a plain line', () => {
    expect(actionError({ status: 500, code: 'internal' }, 'Chilli')).toBe("Couldn't save that for Chilli. Try again.")
  })
})
