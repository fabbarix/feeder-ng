import { describe, expect, it } from 'vitest'
import { emailBreak, nameBreak } from './textBreaks'

describe('nameBreak', () => {
  it('splits at spaces and keeps them, so the pieces join back to the name', () => {
    expect(nameBreak('Chiara Rossi-Verdi di San')).toEqual(['Chiara', ' ', 'Rossi-Verdi', ' ', 'di', ' ', 'San'])
    for (const n of ['Rex', 'Zia  Rosa', ' Lead']) expect(nameBreak(n).join('')).toBe(n)
  })
  it('gives nothing for an empty name', () => expect(nameBreak('')).toEqual([]))
})

describe('emailBreak (also re-exported by settings/lib/allowlist)', () => {
  it('splits before "@" and after "."', () => expect(emailBreak('a.b@c.test')).toEqual(['a.', 'b', '@c.', 'test']))
})
