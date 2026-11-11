import { parseImageLink } from './imageUrl'
import { ImageProblemError } from './problems'

/** The part of a paste event's DataTransfer the picker reads (DataTransfer satisfies it; tests pass a plain object). */
export interface ClipboardDataLike {
  files?: ArrayLike<File>
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>
  getData?(type: string): string
}

export type ClipboardPick = { kind: 'file'; file: File } | { kind: 'link'; url: string } | { kind: 'none' }

const isImageType = (type: string) => type.toLowerCase().startsWith('image/')

/** A text that is an https link or a data:image URL becomes a pick; anything else is nothing. */
function pickFromText(text: string): ClipboardPick {
  const parsed = parseImageLink(text)
  if (!parsed.ok) return { kind: 'none' }
  if (parsed.kind === 'data') return { kind: 'file', file: new File([parsed.blob], 'pasted-image', { type: parsed.blob.type }) }
  return { kind: 'link', url: parsed.url }
}

/**
 * Priority: an image file (items first, then files; type must be image/*) > a text/plain https link (or data:image URL, which becomes a File)
 * > the src of the first <img> in text/html > none. A copied web image arrives as both a file and html: the file wins.
 */
export function pickFromClipboardData(data: ClipboardDataLike | null | undefined): ClipboardPick {
  if (!data) return { kind: 'none' }
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && isImageType(item.type)) {
      const file = item.getAsFile()
      if (file) return { kind: 'file', file }
    }
  }
  for (const file of Array.from(data.files ?? [])) if (isImageType(file.type)) return { kind: 'file', file }
  const text = data.getData?.('text/plain') ?? ''
  if (text.trim() !== '') {
    const picked = pickFromText(text)
    if (picked.kind !== 'none') return picked
  }
  const html = data.getData?.('text/html') ?? ''
  const src = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(html)
  const found = src?.[1] ?? src?.[2]
  return found ? pickFromText(found) : { kind: 'none' }
}

/** The async Clipboard API (navigator.clipboard), the "Paste image" button's source. */
export interface ClipboardLike {
  read?(): Promise<{ types: readonly string[]; getType(type: string): Promise<Blob> }[]>
  readText?(): Promise<string>
}

function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

const refused = (err: unknown) => {
  const name = (err as { name?: unknown } | null)?.name
  return name === 'NotAllowedError' || name === 'SecurityError'
}

/**
 * Reads an image/* item first, else text (https link) via readText. Throws ImageProblemError('clipboard_unsupported') when `clipboard`
 * is null or has neither read nor readText; 'clipboard_denied' when the browser refuses (NotAllowedError, SecurityError). Nothing usable -> { kind: 'none' }.
 */
export async function readClipboard(clipboard: ClipboardLike | null): Promise<ClipboardPick> {
  if (!clipboard || (typeof clipboard.read !== 'function' && typeof clipboard.readText !== 'function')) throw new ImageProblemError('clipboard_unsupported')
  try {
    if (typeof clipboard.read === 'function') {
      const items = await clipboard.read()
      for (const item of items) {
        const type = item.types.find(isImageType)
        if (type) {
          const blob = await item.getType(type)
          return { kind: 'file', file: new File([blob], 'pasted-image', { type: blob.type || type }) }
        }
      }
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          const picked = pickFromText(await blobText(await item.getType('text/plain')))
          if (picked.kind !== 'none') return picked
        }
      }
      return { kind: 'none' }
    }
    return pickFromText((await clipboard.readText?.()) ?? '')
  } catch (err) {
    if (refused(err)) throw new ImageProblemError('clipboard_denied')
    throw new ImageProblemError('clipboard_unsupported')
  }
}
