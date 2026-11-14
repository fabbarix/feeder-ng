// Beta.8 (scan): the words of ticking a Line by hand on the To get tab.
import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

describe('scanStrings: tick by hand', () => {
  it('the row is named "Tick {line}", the toast says "{line} ticked" with Undo, and failures say what to do', () => {
    expect(scanStrings.tickLine('Passata')).toBe('Tick Passata')
    expect(scanStrings.lineTicked('Passata')).toBe('Passata ticked')
    expect(scanStrings.undoAction).toBe('Undo')
    expect(scanStrings.tickFailed('Passata')).toBe("Couldn't tick Passata. Try again.")
    expect(scanStrings.untickFailed).toBe("Couldn't undo that tick. Try again.")
  })

  it('an empty To get tab says everything is ticked', () => {
    expect(scanStrings.nothingToGet).toBe('Nothing left to get')
    expect(scanStrings.nothingToGetHint).toBe('Every Line on the Shopping List is ticked.')
  })

  it('uses no word the GLOSSARY avoids', () => {
    for (const text of [scanStrings.tickLine('x'), scanStrings.lineTicked('x'), scanStrings.nothingToGet, scanStrings.nothingToGetHint]) {
      expect(text).not.toMatch(/\b(item|checkbox|checked)\b/i)
    }
  })
})
