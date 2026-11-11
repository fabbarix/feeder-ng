// WP-E/G: the input -> the reads body (ai-recipe-import.md sections 1.5, 3.5, 7; ra-e-import.md section 4.1).
import { describe, expect, it } from 'vitest'
import type { RawImage } from '../../../ui/ImagePicker'
import { buildReadRequest, READ_LIMITS, textCounter } from './readRequest'

const JPEG = 'data:image/jpeg;base64,/9j/4AAQ'
const blobPhoto = (over: { size?: number; dataUrl?: string | undefined } = {}): RawImage => ({
  kind: 'blob',
  blob: new Blob([new Uint8Array(over.size ?? 16)], { type: 'image/jpeg' }),
  dataUrl: 'dataUrl' in over ? over.dataUrl : JPEG,
  width: 2576,
  height: 1932,
  type: 'image/jpeg',
  origin: 'file',
})
const linkPhoto = (url = 'https://cdn.example.com/card.jpg'): RawImage => ({ kind: 'url', url })

describe('limits (user-approved)', () => {
  it('are 50,000 characters, 4 photos and 8 MB each', () => {
    expect(READ_LIMITS).toEqual({ textChars: 50_000, photos: 4, photoBytes: 8 * 1024 * 1024 })
  })
})

describe('buildReadRequest: a web page', () => {
  it('sends the trimmed address as { url } only', () => {
    expect(buildReadRequest({ kind: 'url', url: '  https://example.com/soup?x=1  ' })).toEqual({ ok: true, body: { url: 'https://example.com/soup?x=1' } })
  })
  it('accepts http (the server fetches through its own guard)', () => {
    expect(buildReadRequest({ kind: 'url', url: 'http://example.com/soup' })).toEqual({ ok: true, body: { url: 'http://example.com/soup' } })
  })
  it('adds https:// to a bare address like example.com/soup', () => {
    expect(buildReadRequest({ kind: 'url', url: 'example.com/soup' })).toEqual({ ok: true, body: { url: 'https://example.com/soup' } })
  })
  it.each(['', '   ', 'soup', 'ftp://example.com/x', 'javascript:alert(1)', 'https://', 'https://exa mple.com', 'two words.com/x'])('refuses %j as url_invalid', (url) => {
    expect(buildReadRequest({ kind: 'url', url })).toEqual({ ok: false, problem: 'url_invalid' })
  })
})

describe('buildReadRequest: pasted text', () => {
  it('sends the trimmed text as { text } only', () => {
    expect(buildReadRequest({ kind: 'text', text: '\n  Soup: 1 onion  \n' })).toEqual({ ok: true, body: { text: 'Soup: 1 onion' } })
  })
  it('keeps the inner line breaks', () => {
    expect(buildReadRequest({ kind: 'text', text: 'a\n\nb' })).toEqual({ ok: true, body: { text: 'a\n\nb' } })
  })
  it('refuses blank text as text_empty', () => {
    expect(buildReadRequest({ kind: 'text', text: ' \n\t ' })).toEqual({ ok: false, problem: 'text_empty' })
  })
  it('accepts exactly 50,000 characters and refuses 50,001 (text_too_long)', () => {
    expect(buildReadRequest({ kind: 'text', text: 'a'.repeat(50_000) }).ok).toBe(true)
    expect(buildReadRequest({ kind: 'text', text: 'a'.repeat(50_001) })).toEqual({ ok: false, problem: 'text_too_long' })
  })
  it('counts characters, not UTF-16 units (50,000 emoji are fine, as on the server)', () => {
    expect(buildReadRequest({ kind: 'text', text: '🍅'.repeat(50_000) }).ok).toBe(true)
    expect(buildReadRequest({ kind: 'text', text: '🍅'.repeat(50_001) })).toEqual({ ok: false, problem: 'text_too_long' })
  })
  it('counts after trimming (spaces around 50,000 characters do not matter)', () => {
    expect(buildReadRequest({ kind: 'text', text: `  ${'a'.repeat(50_000)}  ` }).ok).toBe(true)
  })
})

describe('buildReadRequest: photos', () => {
  it('sends the data URLs in order as { photos: [{ dataUrl }] } and nothing else', () => {
    const a = blobPhoto({ dataUrl: 'data:image/jpeg;base64,AAAA' })
    const b = blobPhoto({ dataUrl: 'data:image/png;base64,BBBB' })
    const built = buildReadRequest({ kind: 'photo', photos: [a, b] })
    expect(built).toEqual({ ok: true, body: { photos: [{ dataUrl: 'data:image/jpeg;base64,AAAA' }, { dataUrl: 'data:image/png;base64,BBBB' }] } })
    if (built.ok) expect(Object.keys(built.body)).toEqual(['photos']) // the server raises its body cap only when `photos` is the first key
  })
  it('sends a pasted link as { url }, mixed with data URLs, order kept', () => {
    const built = buildReadRequest({ kind: 'photo', photos: [linkPhoto(), blobPhoto()] })
    expect(built).toEqual({ ok: true, body: { photos: [{ url: 'https://cdn.example.com/card.jpg' }, { dataUrl: JPEG }] } })
  })
  it('each photo carries exactly one of dataUrl and url', () => {
    const built = buildReadRequest({ kind: 'photo', photos: [linkPhoto(), blobPhoto()] })
    if (!built.ok || !('photos' in built.body)) throw new Error('expected a photos body')
    for (const p of built.body.photos) expect(Object.keys(p)).toHaveLength(1)
  })
  it('accepts 4 photos and refuses 5 (too_many_photos)', () => {
    expect(buildReadRequest({ kind: 'photo', photos: Array.from({ length: 4 }, () => blobPhoto()) }).ok).toBe(true)
    expect(buildReadRequest({ kind: 'photo', photos: Array.from({ length: 5 }, () => blobPhoto()) })).toEqual({ ok: false, problem: 'too_many_photos' })
  })
  it('refuses no photos (photos_empty)', () => {
    expect(buildReadRequest({ kind: 'photo', photos: [] })).toEqual({ ok: false, problem: 'photos_empty' })
  })
  it('refuses a photo over 8 MB and says which one (photo_too_large, 0-based index)', () => {
    const big = blobPhoto({ size: 8 * 1024 * 1024 + 1 })
    expect(buildReadRequest({ kind: 'photo', photos: [blobPhoto(), big] })).toEqual({ ok: false, problem: 'photo_too_large', index: 1 })
    expect(buildReadRequest({ kind: 'photo', photos: [blobPhoto({ size: 8 * 1024 * 1024 })] }).ok).toBe(true)
  })
  it('refuses a picture without a data URL (the picker was not asked for output "dataUrl")', () => {
    expect(buildReadRequest({ kind: 'photo', photos: [blobPhoto({ dataUrl: undefined })] })).toEqual({ ok: false, problem: 'photo_unsupported', index: 0 })
  })
  it('refuses a data URL that is not JPEG, PNG, GIF or WebP, and an http link', () => {
    expect(buildReadRequest({ kind: 'photo', photos: [blobPhoto(), blobPhoto({ dataUrl: 'data:image/heic;base64,AAAA' })] })).toEqual({ ok: false, problem: 'photo_unsupported', index: 1 })
    expect(buildReadRequest({ kind: 'photo', photos: [linkPhoto('http://cdn.example.com/a.jpg')] })).toEqual({ ok: false, problem: 'photo_unsupported', index: 0 })
  })
})

describe('textCounter', () => {
  it('formats "1,234 / 50,000" with thousands separators', () => {
    expect(textCounter('a'.repeat(1234))).toEqual({ label: '1,234 / 50,000', over: false })
    expect(textCounter('')).toEqual({ label: '0 / 50,000', over: false })
  })
  it('counts the trimmed text', () => {
    expect(textCounter('  abc  ').label).toBe('3 / 50,000')
  })
  it('is over above 50,000 only', () => {
    expect(textCounter('a'.repeat(50_000)).over).toBe(false)
    expect(textCounter('a'.repeat(50_001))).toEqual({ label: '50,001 / 50,000', over: true })
  })
})
