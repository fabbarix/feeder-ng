import { describe, expect, it } from 'vitest'
import { parseCommand } from './voice'

describe('parseCommand', () => {
  it.each([
    ['next', 'next'],
    ['Next step', 'next'],
    ['back', 'back'],
    ['go back', 'back'],
    ['previous', 'back'],
    ['repeat', 'repeat'],
    ['say again', 'repeat'],
    ['start timer', 'startTimer'],
    ['Start the timer.', 'startTimer'],
    ['pause timer', 'pauseTimer'],
    ['  PAUSE THE TIMER!  ', 'pauseTimer'],
  ])('%j -> %s', (heard, command) => {
    expect(parseCommand(heard)).toBe(command)
  })

  it.each(['', '   ', 'hello', 'I will go back to the shop', 'nextdoor', 'timer', 'stop'])('%j is not a command', (heard) => {
    expect(parseCommand(heard)).toBeNull()
  })
})
