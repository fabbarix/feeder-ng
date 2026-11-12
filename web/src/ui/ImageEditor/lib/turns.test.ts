import { describe, expect, it } from 'vitest'
import { addTurn, turnedSize, type Turns } from './turns'

describe('addTurn', () => {
  it('wraps clockwise', () => {
    expect([0, 1, 2, 3].map((t) => addTurn(t as Turns, 1))).toEqual([1, 2, 3, 0])
  })
  it('wraps counter-clockwise', () => {
    expect([0, 1, 2, 3].map((t) => addTurn(t as Turns, -1))).toEqual([3, 0, 1, 2])
  })
})

describe('turnedSize', () => {
  it('odd turns swap width and height', () => {
    expect(turnedSize(800, 600, 1)).toEqual({ width: 600, height: 800 })
    expect(turnedSize(800, 600, 3)).toEqual({ width: 600, height: 800 })
  })
  it('even turns keep them', () => {
    expect(turnedSize(800, 600, 0)).toEqual({ width: 800, height: 600 })
    expect(turnedSize(800, 600, 2)).toEqual({ width: 800, height: 600 })
  })
})
