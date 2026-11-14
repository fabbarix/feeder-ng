// DS-12 R-D: a toast of one sentence is one line; a message of several sentences is a headline and a body. The string form of
// useToast().show splits a message here, so every multi-sentence toast gets the rich anatomy without its call site restating
// it. A call that needs a subline or more than one action uses the object form instead. Pure; no React.
//
// A wrong split is worse than none: a boundary that might be an abbreviation, an initial or a dotted time ("Dr.", "J.",
// "7 p.m.") is never used, and a message with no safe boundary stays one line.

/** A candidate boundary: . ! or ? followed by a space and an upper-case letter, a digit or an opening quote. */
const BOUNDARY = /([.!?])\s+(?=[\p{Lu}\p{N}"“'‘])/gu

/** Words that end in a full stop without ending a sentence (compared lower-case, without the dot). */
const ABBREVIATIONS = new Set([
  'approx', 'ca', 'cf', 'co', 'dept', 'dr', 'eg', 'est', 'etc', 'fig', 'ft', 'hr', 'hrs', 'ie', 'inc', 'jr', 'lb', 'lbs', 'ltd',
  'min', 'mins', 'mr', 'mrs', 'ms', 'mt', 'no', 'nr', 'oz', 'prof', 'pt', 'qt', 'sec', 'sr', 'st', 'tbsp', 'tsp', 'vs',
])

export interface ToastText {
  title: string
  body?: string
}

/** True when the full stop at `dot` may end something other than a sentence. `!` and `?` always end one. */
function unsafeStop(text: string, dot: number): boolean {
  if (text[dot] !== '.') return false
  const word = /(\S+)$/u.exec(text.slice(0, dot))?.[1] ?? ''
  const bare = word.replace(/^[("“'‘]+/u, '')
  if (/^\p{L}+(\.\p{L}+)+$/u.test(bare)) return true // "e.g", "a.m", "U.S": a dotted abbreviation (not "12.30" or "photo..")
  if (/^\p{L}$/u.test(bare)) return true // an initial: "J. Smith"
  return ABBREVIATIONS.has(bare.toLowerCase())
}

/**
 * "That did not save. Try again." -> { title: 'That did not save.', body: 'Try again.' }. The words are not changed (the copy
 * stays its owner's), only set as a headline and a body. One sentence, or no safe boundary -> { title } unchanged.
 */
export function splitToastText(message: string): ToastText {
  const text = message.trim()
  for (const m of text.matchAll(BOUNDARY)) {
    const dot = m.index
    if (unsafeStop(text, dot)) continue
    const body = text.slice(dot + 1).trim()
    if (body === '') break
    return { title: text.slice(0, dot + 1), body }
  }
  return { title: text }
}
