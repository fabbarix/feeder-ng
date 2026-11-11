export type ParsedLink =
  | { ok: true; kind: 'https'; url: string }
  /** A pasted data:image/...;base64 URL becomes bytes, never a server fetch. */
  | { ok: true; kind: 'data'; blob: Blob }
  | { ok: false; code: 'link_empty' | 'link_invalid' }

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]*)$/i

/**
 * Trims; '' -> link_empty; https URL with a host and no credentials -> https (returned normalised by `new URL().href`);
 * data:image/(jpeg|png|webp);base64,... -> data; http, ftp, file, javascript, text/html data URLs, garbage -> link_invalid.
 * Only a hint to the user: the server re-checks everything.
 */
export function parseImageLink(text: string): ParsedLink {
  const t = text.trim()
  if (t === '') return { ok: false, code: 'link_empty' }
  if (/^data:/i.test(t)) {
    const blob = DATA_URL.test(t) ? dataUrlToBlob(t) : null
    return blob ? { ok: true, kind: 'data', blob } : { ok: false, code: 'link_invalid' }
  }
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return { ok: false, code: 'link_invalid' }
  }
  if (url.protocol !== 'https:' || url.hostname === '' || url.username !== '' || url.password !== '') return { ok: false, code: 'link_invalid' }
  return { ok: true, kind: 'https', url: url.href }
}

/** data:image/png;base64,... -> Blob of that type; null when malformed. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/is.exec(dataUrl.trim())
  if (!m) return null
  try {
    const binary = atob(m[2]!.replace(/\s+/g, ''))
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return new Blob([bytes], { type: m[1]!.toLowerCase() })
  } catch {
    return null
  }
}

/** Blob -> data URL via FileReader. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}
