// B9-19 (SHORT-04): keyboard detection as pure functions. The on-screen keyboard is "up" while a text field has focus on a coarse
// pointer; its height is what the visual viewport lost.
import { describe, expect, it } from 'vitest'
import { isTextEntry, keyboardInset, keyboardOpen, KEYBOARD_RESTORE_MS } from './keyboard'

const input = (type?: string, attrs: Record<string, string> = {}) => {
  const el = document.createElement('input')
  if (type !== undefined) el.setAttribute('type', type)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  return el
}

describe('isTextEntry', () => {
  it.each(['text', 'search', 'email', 'url', 'tel', 'password', 'number'])('an <input type=%s> is text entry', (type) => {
    expect(isTextEntry(input(type))).toBe(true)
  })

  it('an <input> without a type (text) and a <textarea> are text entry', () => {
    expect(isTextEntry(input())).toBe(true)
    expect(isTextEntry(document.createElement('textarea'))).toBe(true)
  })

  it.each(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'hidden', 'date', 'time', 'datetime-local'])(
    'an <input type=%s> is not text entry (no keyboard comes up)',
    (type) => {
      expect(isTextEntry(input(type))).toBe(false)
    },
  )

  it('a button, a link and a plain div are not text entry', () => {
    expect(isTextEntry(document.createElement('button'))).toBe(false)
    expect(isTextEntry(document.createElement('a'))).toBe(false)
    expect(isTextEntry(document.createElement('div'))).toBe(false)
  })

  it('a contenteditable element is text entry (the attribute is read: jsdom has no isContentEditable)', () => {
    for (const v of ['', 'true', 'plaintext-only']) {
      const div = document.createElement('div')
      div.setAttribute('contenteditable', v)
      expect(isTextEntry(div), `contenteditable="${v}"`).toBe(true)
    }
    const off = document.createElement('div')
    off.setAttribute('contenteditable', 'false')
    expect(isTextEntry(off)).toBe(false)
  })

  it('a disabled or read-only field brings no keyboard up', () => {
    expect(isTextEntry(input('text', { disabled: '' }))).toBe(false)
    expect(isTextEntry(input('text', { readonly: '' }))).toBe(false)
    expect(isTextEntry(Object.assign(document.createElement('textarea'), { readOnly: true }))).toBe(false)
  })

  it('null (nothing focused) is not text entry', () => {
    expect(isTextEntry(null)).toBe(false)
  })
})

describe('keyboardOpen', () => {
  it('is open only for a text field on a coarse pointer', () => {
    expect(keyboardOpen({ coarse: true, textEntryFocused: true })).toBe(true)
    expect(keyboardOpen({ coarse: true, textEntryFocused: false })).toBe(false)
    expect(keyboardOpen({ coarse: false, textEntryFocused: true })).toBe(false)
    expect(keyboardOpen({ coarse: false, textEntryFocused: false })).toBe(false)
  })
})

describe('keyboardInset', () => {
  it('is 0 when the visual viewport equals the layout viewport', () => {
    expect(keyboardInset({ innerHeight: 844, vvHeight: 844, vvOffsetTop: 0 })).toBe(0)
  })

  it('is 300 for an innerHeight of 844 with a visual viewport of 544', () => {
    expect(keyboardInset({ innerHeight: 844, vvHeight: 544, vvOffsetTop: 0 })).toBe(300)
  })

  it('subtracts the visual viewport scroll offset (the page panned under the keyboard)', () => {
    expect(keyboardInset({ innerHeight: 844, vvHeight: 544, vvOffsetTop: 100 })).toBe(200)
  })

  it('never goes negative (pinch zoom makes the visual viewport smaller than the layout one without a keyboard only when scrolled)', () => {
    expect(keyboardInset({ innerHeight: 800, vvHeight: 800, vvOffsetTop: 40 })).toBe(0)
    expect(keyboardInset({ innerHeight: 800, vvHeight: 900, vvOffsetTop: 0 })).toBe(0)
  })
})

describe('KEYBOARD_RESTORE_MS', () => {
  it('is 150 ms: the bar waits that long after focus leaves a field, so moving to the next field does not flicker it back', () => {
    expect(KEYBOARD_RESTORE_MS).toBe(150)
  })
})
