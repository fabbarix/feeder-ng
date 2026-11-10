export type ParsedLink =
  | { ok: true; kind: 'https'; url: string }
  /** A pasted data:image/...;base64 URL becomes bytes, never a server fetch. */
  | { ok: true; kind: 'data'; blob: Blob }
  | { ok: false; code: 'link_empty' | 'link_invalid' }

/**
 * IP1 stub. Trims; '' -> link_empty; https URL with a host and no credentials -> https (returned normalised by `new URL().href`);
 * data:image/(jpeg|png|webp);base64,... -> data; http, ftp, file, javascript, text/html data URLs, garbage -> link_invalid.
 * Only a hint to the user: the server re-checks everything.
 */
export function parseImageLink(_text: string): ParsedLink {
  return { ok: false, code: 'link_invalid' }
}

/** IP1 stub. data:image/png;base64,... -> Blob of that type; null when malformed. */
export function dataUrlToBlob(_dataUrl: string): Blob | null {
  return null
}

/** IP1 stub. Blob -> data URL via FileReader. */
export function blobToDataUrl(_blob: Blob): Promise<string> {
  return Promise.reject(new Error('not implemented'))
}
