import { describe, expect, it } from 'vitest'
import { blobToDataUrl, dataUrlToBlob, parseImageLink } from './imageUrl'

const PIXEL = 'data:image/png;base64,iVBORw0KGgo='

describe('parseImageLink', () => {
  it('accepts an https link and trims the text around it', () => {
    expect(parseImageLink('  https://photos.example/soup.png \n')).toEqual({ ok: true, kind: 'https', url: 'https://photos.example/soup.png' })
  })

  it('keeps the query string', () => {
    expect(parseImageLink('https://cdn.example/a.jpg?w=800&q=80')).toMatchObject({ ok: true, url: 'https://cdn.example/a.jpg?w=800&q=80' })
  })

  it('an empty or blank text is link_empty', () => {
    expect(parseImageLink('')).toEqual({ ok: false, code: 'link_empty' })
    expect(parseImageLink('   ')).toEqual({ ok: false, code: 'link_empty' })
  })

  it.each([
    'http://photos.example/a.png',
    'ftp://photos.example/a.png',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://',
    'https://user:pw@photos.example/a.png',
    'photos.example/a.png',
    'not a link',
    'data:text/html;base64,PGgxPg==',
    'data:image/gif;base64,R0lGOD',
    'data:image/png,notbase64',
  ])('%j is link_invalid', (text) => expect(parseImageLink(text)).toEqual({ ok: false, code: 'link_invalid' }))

  it('a pasted data:image URL becomes bytes, never a server fetch', () => {
    const parsed = parseImageLink(PIXEL)
    expect(parsed.ok && parsed.kind).toBe('data')
    if (parsed.ok && parsed.kind === 'data') expect(parsed.blob.type).toBe('image/png')
  })
})

describe('dataUrlToBlob', () => {
  it('decodes base64 into a Blob of the declared type', async () => {
    const blob = dataUrlToBlob(`data:image/jpeg;base64,${btoa('hello')}`)!
    expect(blob.type).toBe('image/jpeg')
    expect(blob.size).toBe(5)
  })

  it('returns null for malformed input', () => {
    expect(dataUrlToBlob('data:image/png;base64,@@@')).toBeNull()
    expect(dataUrlToBlob('https://x/a.png')).toBeNull()
    expect(dataUrlToBlob('')).toBeNull()
  })
})

describe('blobToDataUrl', () => {
  it('round-trips with dataUrlToBlob', async () => {
    const url = await blobToDataUrl(new Blob(['hello'], { type: 'image/webp' }))
    expect(url).toBe(`data:image/webp;base64,${btoa('hello')}`)
    expect(dataUrlToBlob(url)!.size).toBe(5)
  })
})
