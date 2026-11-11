// Flat list of the style rules of recipes.css with the min-width of their @media, for the contract tests of R2-1 (jsdom does not lay out).
import { readSource } from '../plan/test-css'

export interface Rule {
  selector: string
  body: string
  /** The min-width of the enclosing @media, or 0. */
  minWidth: number
}

function parse(text: string, minWidth = 0): Rule[] {
  const rules: Rule[] = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const inner = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) {
      const m = /min-width:\s*(\d+)px/.exec(head)
      rules.push(...parse(inner, m ? Number(m[1]) : minWidth))
    } else if (!head.startsWith('@')) {
      rules.push({ selector: head, body: inner, minWidth })
    }
    i = j
  }
  return rules
}

const source = readSource('features/recipes/recipes.css').replace(/\/\*[\s\S]*?\*\//g, '')
export const recipeRules: Rule[] = parse(source)

/** Rules whose selector list contains `selector` exactly (whitespace and quotes normalised). */
export function rulesFor(selector: string): Rule[] {
  const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
  return recipeRules.filter((r) => r.selector.split(',').some((s) => norm(s) === norm(selector)))
}

/** The last value of `prop` among the rules of `selector` at exactly this min-width (0 = unconditional), or undefined. */
export function valueAt(selector: string, prop: string, minWidth = 0): string | undefined {
  const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)
  let out: string | undefined
  for (const r of rulesFor(selector)) {
    if (r.minWidth !== minWidth) continue
    const m = re.exec(r.body)
    if (m) out = m[1]!.trim().replace(/\s+/g, ' ')
  }
  return out
}

/** The effective value of `prop` for `selector` at viewport `width`: the last matching rule among those with minWidth <= width. */
export function valueFor(selector: string, prop: string, width: number): string | undefined {
  const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)
  let out: string | undefined
  const rules = rulesFor(selector)
    .filter((r) => r.minWidth <= width)
    .sort((a, b) => a.minWidth - b.minWidth)
  for (const r of rules) {
    const m = re.exec(r.body)
    if (m) out = m[1]!.trim().replace(/\s+/g, ' ')
  }
  return out
}
