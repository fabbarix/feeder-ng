// RX-05: the Source line of Recipe detail (and, later, the Import Review preview). "Only http: and https: become links."
// Ruling 4 (main session, B9-27): an address that is not http(s) shows as plain text (`address`), never a link; with an attribution, after it.
import { describe, expect, it } from 'vitest'
import { sourceLine } from './sourceLine'

describe('sourceLine', () => {
  it('with both: the attribution and the host of the address, which opens the whole address', () => {
    expect(sourceLine({ url: 'https://example.test/pancakes?x=1', attribution: 'Nonna Lucia Maria Bernadette' })).toEqual({
      attribution: 'Nonna Lucia Maria Bernadette',
      link: { host: 'example.test', href: 'https://example.test/pancakes?x=1' },
      address: null,
    })
  })
  it('with only an attribution: the attribution and no link', () => {
    expect(sourceLine({ url: '', attribution: 'Gran' })).toEqual({ attribution: 'Gran', link: null, address: null })
  })
  it('with only an address: the host as a link and no attribution', () => {
    expect(sourceLine({ url: 'http://example.test/p', attribution: '' })).toEqual({ attribution: null, link: { host: 'example.test', href: 'http://example.test/p' }, address: null })
  })
  it('with neither: nothing (no line)', () => {
    expect(sourceLine({ url: '', attribution: '' })).toBeNull()
    expect(sourceLine({ url: '   ', attribution: '  ' })).toBeNull()
  })
  it('trims the attribution and the address', () => {
    expect(sourceLine({ url: ' https://example.test/a ', attribution: '  Gran ' })).toEqual({ attribution: 'Gran', link: { host: 'example.test', href: 'https://example.test/a' }, address: null })
  })
  it('an address that is not http or https is never a link: javascript:, ftp:, data: and file: are plain text after the attribution', () => {
    for (const url of ['javascript:alert(1)', 'ftp://example.test/p', 'data:text/html,hi', 'file:///etc/passwd']) {
      expect(sourceLine({ url, attribution: 'Gran' }), url).toEqual({ attribution: 'Gran', link: null, address: url })
    }
  })
  it('an address that is not http(s) and no attribution: the address alone, as plain text', () => {
    expect(sourceLine({ url: 'javascript:alert(1)', attribution: '' })).toEqual({ attribution: null, link: null, address: 'javascript:alert(1)' })
  })
  it('an address that does not parse gives no link, only its text', () => {
    expect(sourceLine({ url: 'not a url', attribution: 'Gran' })).toEqual({ attribution: 'Gran', link: null, address: 'not a url' })
    expect(sourceLine({ url: ' not a url ', attribution: '' })).toEqual({ attribution: null, link: null, address: 'not a url' })
  })
})
