// B9-47: a small reader of board.css for the CSS tests (rules with the media or container query they sit in). Plain TypeScript.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

export interface CssRule {
  /** the comma-separated selectors, whitespace-normalised, double quotes turned into single */
  selectors: string[]
  /** the declarations, whitespace-normalised */
  body: string
  /** the enclosing at-rule preludes, outermost first ('' when none) */
  at: string[]
}

export const boardCssText = readFileSync(`${cwd}/src/features/board/board.css`, 'utf8')

function parse(text: string, at: string[], out: CssRule[]): void {
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) return
    const prelude = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const inner = text.slice(open + 1, j - 1)
    if (prelude.startsWith('@media') || prelude.startsWith('@container') || prelude.startsWith('@supports')) parse(inner, [...at, prelude.replace(/\s+/g, ' ')], out)
    else if (!prelude.startsWith('@')) {
      out.push({ selectors: prelude.split(',').map((s) => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim()), body: inner.replace(/\s+/g, ' ').trim(), at })
    }
    i = j
  }
}

export function boardRules(css = boardCssText): CssRule[] {
  const out: CssRule[] = []
  parse(css.replace(/\/\*[\s\S]*?\*\//g, ''), [], out)
  return out
}

/** The rules whose selector list holds exactly `selector`. */
export const rulesOf = (selector: string, rules = boardRules()): CssRule[] => rules.filter((r) => r.selectors.includes(selector))
/** The declarations of every rule for `selector`, joined (any media). */
export const bodyOf = (selector: string, rules = boardRules()): string => rulesOf(selector, rules).map((r) => r.body).join(' ')
/** The rules with a selector that includes `part` (a substring). */
export const rulesMatching = (part: string, rules = boardRules()): CssRule[] => rules.filter((r) => r.selectors.some((s) => s.includes(part)))
