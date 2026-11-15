// Beta.8 (scan): the words of ticking a Line by hand on the To get tab.
import { describe, expect, it } from 'vitest'
import { scanStrings } from './strings'

describe('scanStrings: tick by hand', () => {
  // B9-34: the toast and its Undo are the Shop's (useTickFlow); lineTicked, undoAction and untickFailed are gone.
  it('the row is named "Tick {line}", and a failed tick says what to do', () => {
    expect(scanStrings.tickLine('Passata')).toBe('Tick Passata')
    expect(scanStrings.tickFailed('Passata')).toBe("Couldn't tick Passata. Try again.")
    expect('lineTicked' in scanStrings || 'undoAction' in scanStrings || 'untickFailed' in scanStrings).toBe(false)
  })

  it('an empty To get tab says everything is ticked', () => {
    expect(scanStrings.nothingToGet).toBe('Nothing left to get')
    expect(scanStrings.nothingToGetHint).toBe('Every Line on the Shopping List is ticked.')
  })

  it('uses no word the GLOSSARY avoids', () => {
    for (const text of [scanStrings.tickLine('x'), scanStrings.nothingToGet, scanStrings.nothingToGetHint]) {
      expect(text).not.toMatch(/\b(item|checkbox|checked)\b/i)
    }
  })
})
