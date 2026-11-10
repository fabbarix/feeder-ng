import { describe, expect, it } from 'vitest'
import { typeAheadStep, TYPE_AHEAD_WINDOW_MS } from './lib'

describe('typeAheadStep', () => {
  it('starts a buffer on the first key and extends it inside the window', () => {
    const first = typeAheadStep({ text: '', at: 0 }, 'b', 1000)
    expect(first.needle).toBe('b')
    const second = typeAheadStep(first.buffer, 'l', 1000 + TYPE_AHEAD_WINDOW_MS)
    expect(second.needle).toBe('bl')
  })

  it('starts over after the window closes', () => {
    const late = typeAheadStep({ text: 'bl', at: 0 }, 'a', TYPE_AHEAD_WINDOW_MS + 1)
    expect(late.needle).toBe('a')
  })

  it('a repeated letter matches the single letter, so it cycles', () => {
    const one = typeAheadStep({ text: '', at: 0 }, 'b', 0)
    const two = typeAheadStep(one.buffer, 'b', 10)
    expect(two.needle).toBe('b')
  })
})
