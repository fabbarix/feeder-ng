// "Read a recipe": the input -> the POST /api/recipe-assistant/reads body, with the checks the server also makes
// (docs/dev/design/ra-e-import.md section 4.1). Plain TypeScript, no React.
import type { ReadBody, ReadInput } from '../types'

export const READ_LIMITS = { textChars: 50_000, photos: 4, photoBytes: 8 * 1024 * 1024 } as const

/** The server's validation codes, found before sending anything. */
export type InputProblem = 'url_invalid' | 'text_empty' | 'text_too_long' | 'photos_empty' | 'too_many_photos' | 'photo_too_large' | 'photo_unsupported'
export type BuiltRead = { ok: true; body: ReadBody } | { ok: false; problem: InputProblem; /** 0-based photo the problem is about. */ index?: number }

const SUPPORTED_DATA_URL = /^data:image\/(jpeg|png|gif|webp|heic|heif);base64,/i
const BARE_HOST = /^[^\s/?#:@]+\.[^\s/?#:@]+/

/** The address as the server needs it: https:// added to a bare address; undefined when it is not an http(s) address with a host. */
function normaliseUrl(raw: string): string | undefined {
  const text = raw.trim()
  if (text === '') return undefined
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : BARE_HOST.test(text) && !/^[a-z][a-z0-9+.-]*:/i.test(text) ? `https://${text}` : undefined
  if (!withScheme) return undefined
  try {
    const u = new URL(withScheme)
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.hostname === '' || /\s/.test(withScheme)) return undefined
    return withScheme
  } catch {
    return undefined
  }
}

const charCount = (text: string): number => [...text].length

/** Checks the input like the server does and builds the body; a problem is found before anything is sent. */
export function buildReadRequest(input: ReadInput): BuiltRead {
  switch (input.kind) {
    case 'url': {
      const url = normaliseUrl(input.url)
      return url ? { ok: true, body: { url } } : { ok: false, problem: 'url_invalid' }
    }
    case 'text': {
      const text = input.text.trim()
      if (text === '') return { ok: false, problem: 'text_empty' }
      if (charCount(text) > READ_LIMITS.textChars) return { ok: false, problem: 'text_too_long' }
      return { ok: true, body: { text } }
    }
    case 'photo': {
      if (input.photos.length === 0) return { ok: false, problem: 'photos_empty' }
      if (input.photos.length > READ_LIMITS.photos) return { ok: false, problem: 'too_many_photos' }
      const photos: Array<{ dataUrl: string } | { url: string }> = []
      for (const [index, p] of input.photos.entries()) {
        if (p.kind === 'url') {
          if (!/^https:\/\//i.test(p.url)) return { ok: false, problem: 'photo_unsupported', index }
          photos.push({ url: p.url })
          continue
        }
        if (!p.dataUrl || !SUPPORTED_DATA_URL.test(p.dataUrl)) return { ok: false, problem: 'photo_unsupported', index }
        if (p.blob.size > READ_LIMITS.photoBytes) return { ok: false, problem: 'photo_too_large', index }
        photos.push({ dataUrl: p.dataUrl })
      }
      return { ok: true, body: { photos } }
    }
  }
}

/** "1,234 / 50,000" for the text counter; `over` when the trimmed text has more than 50,000 characters. */
export function textCounter(text: string): { label: string; over: boolean } {
  const n = charCount(text.trim())
  return { label: `${n.toLocaleString('en-US')} / ${READ_LIMITS.textChars.toLocaleString('en-US')}`, over: n > READ_LIMITS.textChars }
}
