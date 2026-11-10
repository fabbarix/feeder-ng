/** The part of a paste event's DataTransfer the picker reads (DataTransfer satisfies it; tests pass a plain object). */
export interface ClipboardDataLike {
  files?: ArrayLike<File>
  items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>
  getData?(type: string): string
}

export type ClipboardPick = { kind: 'file'; file: File } | { kind: 'link'; url: string } | { kind: 'none' }

/**
 * IP1 stub. Priority: an image file (items first, then files; type must be image/*) > a text/plain https link (or data:image URL, which becomes a File)
 * > the src of the first <img> in text/html > none. A copied web image arrives as both a file and html: the file wins.
 */
export function pickFromClipboardData(_data: ClipboardDataLike | null | undefined): ClipboardPick {
  return { kind: 'none' }
}

/** The async Clipboard API (navigator.clipboard), the "Paste image" button's source. */
export interface ClipboardLike {
  read?(): Promise<{ types: readonly string[]; getType(type: string): Promise<Blob> }[]>
  readText?(): Promise<string>
}

/**
 * IP1 stub. Reads an image/* item first, else text (https link) via readText. Throws ImageProblemError('clipboard_unsupported') when `clipboard`
 * is null or has neither read nor readText; 'clipboard_denied' when the browser refuses (NotAllowedError, SecurityError). Nothing usable -> { kind: 'none' }.
 */
export async function readClipboard(_clipboard: ClipboardLike | null): Promise<ClipboardPick> {
  return { kind: 'none' }
}
