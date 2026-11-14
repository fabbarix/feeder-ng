// Flat list of the style rules of the Recipes stylesheets (all of them: recipes.css was split in B9-10) with the min-width of their
// condition, for the contract tests of R2-1 (jsdom does not lay out).
//
// DS-09 (B9-10): a width condition may be a px or em media query, `(width < Nem)`, or a container query in rem. This helper reads them all
// as a width in px at 16 px text (1em = 1rem = 16 px), so a test says "from 784" whatever the stylesheet writes; a container query
// stands for the viewport width at which its container is that wide (the tests are about the rule, not the container).
import { type Rule } from '../../test/cssRules'
import { readSource } from '../plan/test-css'
import { recipesCssPaths } from './recipesCss.test-helper'

export { type Rule }

const px = (n: string, unit: string) => Number(n) * (unit === 'px' ? 1 : 16)

function parse(text: string, minWidth = 0, maxWidth = Infinity): Rule[] {
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
    if (head.startsWith('@media') || head.startsWith('@container')) {
      const min = /min-width:\s*(\d+(?:\.\d+)?)(px|rem|em)/.exec(head)
      const max = /max-width:\s*(\d+(?:\.\d+)?)(px|rem|em)/.exec(head)
      const lt = /\(width\s*<\s*(\d+(?:\.\d+)?)(px|rem|em)\)/.exec(head)
      rules.push(...parse(inner, min ? px(min[1]!, min[2]!) : minWidth, max ? px(max[1]!, max[2]!) : lt ? px(lt[1]!, lt[2]!) - 0.02 : maxWidth))
    } else if (!head.startsWith('@')) {
      rules.push({ selector: head, body: inner, minWidth, maxWidth })
    }
    i = j
  }
  return rules
}

/** The rules of stylesheets under web/src (in order, as if concatenated), with lookups over them: the shared cssRules, in px, em and rem. */
export function cssRules(paths: readonly string[]) {
  const rules: Rule[] = parse(paths.map((p) => readSource(p)).join('\n').replace(/\/\*[\s\S]*?\*\//g, ''))

  /** Rules whose selector list contains `selector` exactly (whitespace and quotes normalised). */
  function rulesFor(selector: string): Rule[] {
    const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
    return rules.filter((r) => r.selector.split(',').some((s) => norm(s) === norm(selector)))
  }

  /** The last value of `prop` among the rules of `selector` at exactly this min-width (0 = unconditional), or undefined. */
  function valueAt(selector: string, prop: string, minWidth = 0): string | undefined {
    const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)
    let out: string | undefined
    for (const r of rulesFor(selector)) {
      if (r.minWidth !== minWidth) continue
      const m = re.exec(r.body)
      if (m) out = m[1]!.trim().replace(/\s+/g, ' ')
    }
    return out
  }

  /** The effective value of `prop` for `selector` at viewport `width`: the last matching rule among those with minWidth <= width <= maxWidth. */
  function valueFor(selector: string, prop: string, width: number): string | undefined {
    const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)
    let out: string | undefined
    const matching = rulesFor(selector)
      .filter((r) => r.minWidth <= width && width <= r.maxWidth)
      .sort((a, b) => a.minWidth - b.minWidth)
    for (const r of matching) {
      const m = re.exec(r.body)
      if (m) out = m[1]!.trim().replace(/\s+/g, ' ')
    }
    return out
  }

  return { rules, rulesFor, valueAt, valueFor }
}

const recipes = cssRules(recipesCssPaths())
export const recipeRules: Rule[] = recipes.rules
export const { rulesFor, valueAt, valueFor } = recipes
