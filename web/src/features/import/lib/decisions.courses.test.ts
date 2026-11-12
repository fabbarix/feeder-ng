// CRS E2: the Course answers of an Import Review (docs/dev/design/crs-e2.md 4.2).
import { describe, expect, it } from 'vitest'
import type { Decisions } from '../types'
import { chooseCourseAdd, chooseCourseSkip, chooseCourseUnarchive, chooseCourseUse, chooseExisting, dropAdminCourseAnswers, emptyDecisions } from './decisions'

const base = (): Decisions => emptyDecisions()

describe('emptyDecisions', () => {
  it('has an empty list of Course answers', () => {
    expect(emptyDecisions().courses).toEqual([])
  })
})

describe('Course answers', () => {
  it('use names an active Course', () => {
    expect(chooseCourseUse(base(), 'soup', 3).courses).toEqual([{ key: 'soup', action: 'use', courseId: 3 }])
  })
  it('skip, add and unarchive carry no Course id', () => {
    expect(chooseCourseSkip(base(), 'soup').courses).toEqual([{ key: 'soup', action: 'skip' }])
    expect(chooseCourseAdd(base(), 'soup').courses).toEqual([{ key: 'soup', action: 'add' }])
    expect(chooseCourseUnarchive(base(), 'brunch').courses).toEqual([{ key: 'brunch', action: 'unarchive' }])
  })
  it('a new answer for the same key replaces the old one, in place', () => {
    let d = chooseCourseSkip(base(), 'soup')
    d = chooseCourseUse(d, 'dip', 2)
    d = chooseCourseAdd(d, 'soup')
    expect(d.courses).toEqual([{ key: 'soup', action: 'add' }, { key: 'dip', action: 'use', courseId: 2 }])
  })
  it('a use after an add drops the add (no stale courseId or action)', () => {
    const d = chooseCourseUse(chooseCourseAdd(base(), 'soup'), 'soup', 1)
    expect(d.courses).toEqual([{ key: 'soup', action: 'use', courseId: 1 }])
  })
  it('leaves the other answers alone and does not mutate its input', () => {
    const d = chooseExisting(base(), 'onion', 5)
    const copy = structuredClone(d)
    const next = chooseCourseSkip(d, 'soup')
    expect(d).toEqual(copy)
    expect(next.ingredients).toEqual(d.ingredients)
    expect(next).not.toBe(d)
  })
})

describe('dropAdminCourseAnswers', () => {
  it('takes out add and unarchive and keeps use and skip and every other answer', () => {
    let d = chooseExisting(base(), 'onion', 5)
    d = chooseCourseAdd(d, 'soup')
    d = chooseCourseUnarchive(d, 'brunch')
    d = chooseCourseUse(d, 'dip', 2)
    d = chooseCourseSkip(d, 'tea')
    const out = dropAdminCourseAnswers(d)
    expect(out.courses).toEqual([{ key: 'dip', action: 'use', courseId: 2 }, { key: 'tea', action: 'skip' }])
    expect(out.ingredients).toEqual(d.ingredients)
    expect(d.courses).toHaveLength(4)
  })
})
