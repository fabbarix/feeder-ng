import { describe, expect, it } from 'vitest'
import { courseNameKey, courseNameMessages, validateCourseName } from './names'

describe('courseNameKey', () => {
  it('trims, collapses inner whitespace and lower-cases', () => {
    expect(courseNameKey('  Side   dish ')).toBe('side dish')
    expect(courseNameKey('MAIN')).toBe('main')
    expect(courseNameKey('Side\t\n dish')).toBe('side dish')
  })
  it('counts accents: "Entrée" and "Entree" are two names', () => {
    expect(courseNameKey('Entrée')).toBe('entrée')
    expect(courseNameKey('Entrée')).not.toBe(courseNameKey('Entree'))
  })
})

describe('validateCourseName', () => {
  const others = [
    { id: 1, name: 'Main' },
    { id: 2, name: 'Side dish' },
  ]
  it('accepts a free name and returns it trimmed', () => {
    expect(validateCourseName('  Cheese ', others)).toEqual({ ok: true, name: 'Cheese' })
  })
  it('refuses an empty or blank name', () => {
    expect(validateCourseName('', others)).toEqual({ ok: false, reason: 'empty', message: courseNameMessages.empty })
    expect(validateCourseName('   ', others)).toMatchObject({ ok: false, reason: 'empty' })
  })
  it('accepts 40 characters and refuses 41', () => {
    expect(validateCourseName('a'.repeat(40), others)).toMatchObject({ ok: true })
    expect(validateCourseName('a'.repeat(41), others)).toEqual({ ok: false, reason: 'too_long', message: courseNameMessages.too_long })
  })
  it('counts characters, not bytes', () => {
    expect(validateCourseName('é'.repeat(40), others)).toMatchObject({ ok: true })
  })
  it('refuses a name another Course already has, with case and spacing ignored', () => {
    expect(validateCourseName('main', others)).toEqual({ ok: false, reason: 'taken', message: courseNameMessages.taken })
    expect(validateCourseName(' SIDE   dish', others)).toMatchObject({ ok: false, reason: 'taken' })
  })
  it('lets a Course keep its own name when renamed (selfId)', () => {
    expect(validateCourseName('Main', others, 1)).toMatchObject({ ok: true, name: 'Main' })
    expect(validateCourseName('Main', others, 2)).toMatchObject({ ok: false, reason: 'taken' })
  })
})
