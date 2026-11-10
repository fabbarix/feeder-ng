import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { imagePickerStrings } from '../strings'
import { checkImageFile, ImageProblemError, problemFromError, problemMessage, type ImageProblemCode } from './problems'

const file = (type: string, size = 100) => ({ type, size })
const MB = 1 << 20

describe('checkImageFile', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])('%s is fine', (type) => expect(checkImageFile(file(type))).toBeNull())

  it.each(['image/gif', 'image/svg+xml', 'image/avif', 'application/pdf', 'text/plain', ''])('%j is unsupported', (type) =>
    expect(checkImageFile(file(type))).toBe('unsupported'),
  )

  it('a HEIC file with no type (Windows and Chrome often report none) is recognised by its name', () => {
    for (const name of ['IMG_0001.HEIC', 'IMG_0001.heic', 'photo.heif', 'photo.HEIF']) expect(checkImageFile({ type: '', size: 100, name }), name).toBeNull()
    for (const name of ['notes.txt', 'photo.heic.exe', 'heic', '']) expect(checkImageFile({ type: '', size: 100, name }), name).toBe('unsupported')
  })

  it('a name never overrules a known type', () => expect(checkImageFile({ type: 'application/pdf', size: 100, name: 'x.heic' })).toBe('unsupported'))

  it('an empty file is empty', () => expect(checkImageFile(file('image/png', 0))).toBe('empty'))

  it('8 MB exactly is fine, one byte more is too large', () => {
    expect(checkImageFile(file('image/png', 8 * MB))).toBeNull()
    expect(checkImageFile(file('image/png', 8 * MB + 1))).toBe('too_large')
  })

  it('takes the limit as a parameter (the Recipe Assistant may allow less or more)', () => {
    expect(checkImageFile(file('image/png', 5 * MB + 1), 5 * MB)).toBe('too_large')
    expect(checkImageFile(file('image/png', 12 * MB), 20 * MB)).toBeNull()
  })

  it('checks the type before the size', () => expect(checkImageFile(file('image/gif', 20 * MB))).toBe('unsupported'))
})

describe('problemFromError', () => {
  it('keeps the code of an ImageProblemError', () => expect(problemFromError(new ImageProblemError('unreadable'))).toBe('unreadable'))

  it.each([
    ['image_too_large', 'too_large'],
    ['image_too_large_pixels', 'too_many_pixels'],
    ['unsupported_image', 'unsupported'],
    ['image_url_invalid', 'link_invalid'],
    ['image_url_blocked', 'link_blocked'],
    ['image_url_unreachable', 'link_unreachable'],
    ['network', 'offline'],
    ['timeout', 'offline'],
  ])('the API code %s means %s', (apiCode, expected) => expect(problemFromError(new ApiError(0, apiCode, 'x'))).toBe(expected))

  it('anything else is a plain failure', () => {
    expect(problemFromError(new ApiError(500, 'internal', 'x'))).toBe('failed')
    expect(problemFromError(new Error('boom'))).toBe('failed')
    expect(problemFromError('nope')).toBe('failed')
  })
})

describe('problemMessage', () => {
  const codes: ImageProblemCode[] = [
    'unsupported', 'too_large', 'too_many_pixels', 'empty', 'unreadable', 'link_empty', 'link_invalid', 'link_blocked',
    'link_unreachable', 'clipboard_empty', 'clipboard_denied', 'clipboard_unsupported', 'camera_failed', 'offline', 'failed',
  ]

  it('every problem has its own sentence, and it comes from the strings file', () => {
    const seen = new Set<string>()
    for (const code of codes) {
      const message = problemMessage(code)
      expect(message, code).not.toBe('')
      expect(message).toBe(imagePickerStrings.problems[code])
      seen.add(message)
    }
    expect(seen.size).toBe(codes.length)
  })

  it('the size message names the limit, the type message names the formats, the blocked message says private', () => {
    expect(problemMessage('too_large')).toMatch(/8 MB/)
    expect(problemMessage('unsupported')).toMatch(/JPEG, PNG, WebP or HEIC/)
    expect(problemMessage('link_blocked')).toMatch(/private/i)
    expect(problemMessage('link_invalid')).toMatch(/https/)
  })

  it('the size message follows a custom limit', () => expect(problemMessage('too_large', 5 * MB)).toMatch(/5 MB/))

  it('tells how to paste when the clipboard button is denied (the keyboard route still works)', () => {
    expect(problemMessage('clipboard_denied')).toMatch(/Ctrl\+V/)
    expect(problemMessage('clipboard_unsupported')).toMatch(/Ctrl\+V/)
  })
})
