// WP-E/G: stage copy and the poll / back-off policy (ra-e-import.md section 4.2).
import { describe, expect, it } from 'vitest'
import type { ReadState } from '../types'
import { elapsedNote, errorBackoff, isTerminal, MAX_POLL_FAILURES, POLL_DEADLINE_MS, pollDelay, shouldGiveUp, stageCopy, stagesFor } from './readProgress'

describe('isTerminal', () => {
  it.each<[ReadState, boolean]>([
    ['fetching', false], ['preparing', false], ['reading', false], ['checking', false], ['images', false],
    ['done', true], ['failed', true], ['cancelled', true],
  ])('%s -> %s', (state, final) => expect(isTerminal(state)).toBe(final))
})

describe('stageCopy (the plan\'s wording)', () => {
  it.each<[ReadState, string]>([
    ['fetching', 'Opening the page…'],
    ['preparing', 'Preparing the photos…'],
    ['reading', 'Reading the recipe…'],
    ['checking', 'Checking the result…'],
    ['images', 'Fetching photos…'],
  ])('%s -> %s', (state, text) => expect(stageCopy(state)).toBe(text))
  it('is empty for a final state (nothing is announced after the read ends)', () => {
    for (const s of ['done', 'failed', 'cancelled'] as const) expect(stageCopy(s)).toBe('')
  })
})

describe('stagesFor', () => {
  it('a page: opening, reading, checking, fetching photos', () => {
    expect(stagesFor('url')).toEqual(['fetching', 'reading', 'checking', 'images'])
  })
  it('pasted text starts at reading', () => {
    expect(stagesFor('text')).toEqual(['reading', 'checking', 'images'])
  })
  it('photos: preparing, reading, checking (no photo fetching: the result keeps no image URLs)', () => {
    expect(stagesFor('photo')).toEqual(['preparing', 'reading', 'checking'])
  })
  it('never lists a final state', () => {
    for (const k of ['url', 'text', 'photo'] as const) expect(stagesFor(k).some(isTerminal)).toBe(false)
  })
})

describe('elapsedNote', () => {
  it('is null for the first 19 seconds', () => {
    expect(elapsedNote(0)).toBeNull()
    expect(elapsedNote(19)).toBeNull()
  })
  it('says "Still working… N s" from 20 s, and minutes from 60 s', () => {
    expect(elapsedNote(20)).toBe('Still working… 20 s')
    expect(elapsedNote(45)).toBe('Still working… 45 s')
    expect(elapsedNote(75)).toBe('Still working… 1 min 15 s')
  })
})

describe('pollDelay', () => {
  it('starts quick and settles at 2 s', () => {
    expect([0, 1, 2, 3, 4, 5].map(pollDelay)).toEqual([500, 500, 1000, 1000, 1500, 2000])
    expect(pollDelay(6)).toBe(2000)
    expect(pollDelay(500)).toBe(2000)
  })
  it('never shrinks', () => {
    for (let i = 1; i < 30; i++) expect(pollDelay(i)).toBeGreaterThanOrEqual(pollDelay(i - 1))
  })
})

describe('errorBackoff and shouldGiveUp', () => {
  it('doubles from 1 s, at most 8 s', () => {
    expect([1, 2, 3, 4, 5, 9].map(errorBackoff)).toEqual([1000, 2000, 4000, 8000, 8000, 8000])
  })
  it('gives up after 5 failed polls in a row', () => {
    expect(MAX_POLL_FAILURES).toBe(5)
    expect(shouldGiveUp({ failures: 4, elapsedMs: 1000 })).toBe(false)
    expect(shouldGiveUp({ failures: 5, elapsedMs: 1000 })).toBe(true)
  })
  it('gives up past the server\'s 180 s cap (plus margin) whatever happened', () => {
    expect(POLL_DEADLINE_MS).toBe(200_000)
    expect(shouldGiveUp({ failures: 0, elapsedMs: POLL_DEADLINE_MS - 1 })).toBe(false)
    expect(shouldGiveUp({ failures: 0, elapsedMs: POLL_DEADLINE_MS })).toBe(true)
  })
})
