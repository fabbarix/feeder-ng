// DS-12 R-D: a toast of one sentence is one line; a message of several sentences is a headline and a body. The string form of
// useToast().show splits a message here, so every multi-sentence toast gets the rich anatomy without its call site restating
// it. A call that needs a subline or more than one action uses the object form instead. Pure; no React.

/** A sentence ends at . ! or ? followed by a space and an upper-case letter or a digit (never inside "e.g. x" or "1.25"). */
const BOUNDARY = /([.!?])\s+(?=[\p{Lu}\p{N}"“'‘])/u

export interface ToastText {
  title: string
  body?: string
}

/**
 * "That did not save. Try again." -> { title: 'That did not save.', body: 'Try again.' }. The words are not changed (the copy
 * stays its owner's), only set as a headline and a body. One sentence -> { title } unchanged.
 */
export function splitToastText(message: string): ToastText {
  const text = message.trim()
  const m = BOUNDARY.exec(text)
  if (!m) return { title: text }
  const end = m.index + 1
  const head = text.slice(0, end)
  const body = text.slice(end).trim()
  if (body === '') return { title: text }
  return { title: head, body }
}
