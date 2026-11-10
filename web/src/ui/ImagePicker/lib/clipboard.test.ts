import { describe, expect, it } from 'vitest'
import { fakeClipboard, jpegFile, pngFile } from '../testing'
import { pickFromClipboardData, readClipboard } from './clipboard'

const items = (...files: File[]) => files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f }))

describe('pickFromClipboardData', () => {
  it('takes an image file from the items', () => {
    const f = pngFile()
    expect(pickFromClipboardData({ items: items(f), files: [f] })).toEqual({ kind: 'file', file: f })
  })

  it('takes an image file from files when items are missing', () => {
    const f = jpegFile()
    expect(pickFromClipboardData({ files: [f] })).toEqual({ kind: 'file', file: f })
  })

  it('ignores a file that is not an image', () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    expect(pickFromClipboardData({ files: [pdf], items: items(pdf) })).toEqual({ kind: 'none' })
  })

  it('an https link in the text is a link', () => {
    expect(pickFromClipboardData({ getData: (t) => (t === 'text/plain' ? ' https://photos.example/a.png ' : '') })).toEqual({ kind: 'link', url: 'https://photos.example/a.png' })
  })

  it('a copied web image (file AND html) is the file', () => {
    const f = pngFile()
    const picked = pickFromClipboardData({ files: [f], items: items(f), getData: (t) => (t === 'text/html' ? '<img src="https://x.example/a.png">' : '') })
    expect(picked).toEqual({ kind: 'file', file: f })
  })

  it('html with an <img> and no file gives the image link', () => {
    expect(pickFromClipboardData({ getData: (t) => (t === 'text/html' ? '<p><img alt="" src="https://x.example/a.png"></p>' : '') })).toEqual({
      kind: 'link',
      url: 'https://x.example/a.png',
    })
  })

  it('a pasted data URL becomes a file', () => {
    const picked = pickFromClipboardData({ getData: (t) => (t === 'text/plain' ? `data:image/png;base64,${btoa('hello')}` : '') })
    expect(picked.kind).toBe('file')
    if (picked.kind === 'file') expect(picked.file.type).toBe('image/png')
  })

  it('plain words, an http link, nothing at all: none', () => {
    expect(pickFromClipboardData({ getData: () => 'buy milk' })).toEqual({ kind: 'none' })
    expect(pickFromClipboardData({ getData: () => 'http://x.example/a.png' })).toEqual({ kind: 'none' })
    expect(pickFromClipboardData({})).toEqual({ kind: 'none' })
    expect(pickFromClipboardData(null)).toEqual({ kind: 'none' })
  })
})

describe('readClipboard (the Clipboard API behind the "Paste image" button)', () => {
  it('reads an image item', async () => {
    const blob = new Blob(['x'], { type: 'image/png' })
    const picked = await readClipboard(fakeClipboard({ image: blob }))
    expect(picked.kind).toBe('file')
    if (picked.kind === 'file') expect(picked.file.type).toBe('image/png')
  })

  it('falls back to text with an https link', async () => {
    expect(await readClipboard(fakeClipboard({ text: 'https://photos.example/a.png' }))).toEqual({ kind: 'link', url: 'https://photos.example/a.png' })
  })

  it('an empty clipboard or words is none', async () => {
    expect(await readClipboard(fakeClipboard())).toEqual({ kind: 'none' })
    expect(await readClipboard(fakeClipboard({ text: 'buy milk' }))).toEqual({ kind: 'none' })
  })

  it('a refusal is clipboard_denied', async () => {
    await expect(readClipboard(fakeClipboard({ denied: true }))).rejects.toMatchObject({ code: 'clipboard_denied' })
  })

  it('no Clipboard API is clipboard_unsupported', async () => {
    await expect(readClipboard(null)).rejects.toMatchObject({ code: 'clipboard_unsupported' })
    await expect(readClipboard({})).rejects.toMatchObject({ code: 'clipboard_unsupported' })
  })
})
