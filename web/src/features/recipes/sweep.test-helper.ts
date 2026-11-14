// Test helper (B9-10): the source of the five folders of the recipes-and-settings sweep (features/recipes, import, recipe-assistant,
// settings, tags), and a small nesting-aware CSS reader. jsdom does not lay out, so the sweep is pinned in the source text.
const nodeFs = 'node:fs'
const { readdirSync, readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]
  readFileSync: (p: string, enc: string) => string
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

export const SWEEP_FOLDERS = ['recipes', 'import', 'recipe-assistant', 'settings', 'tags'] as const

export interface SourceFile {
  /** Path under web/src, e.g. features/settings/settings.css. */
  path: string
  text: string
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(`${cwd}/src/${dir}`, { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`, out)
    else out.push(`${dir}/${e.name}`)
  }
}

/** Every file of the five folders (test files and test helpers excluded) whose name matches, with its text. */
export function sweepFiles(match: RegExp): SourceFile[] {
  const all: string[] = []
  for (const f of SWEEP_FOLDERS) walk(`features/${f}`, all)
  return all
    .filter((p) => match.test(p) && !/\.test\.[tj]sx?$/.test(p) && !/\.test-helper\.[tj]sx?$/.test(p) && !/\/test-utils\.[tj]sx?$/.test(p))
    .sort()
    .map((path) => ({ path, text: readFileSync(`${cwd}/src/${path}`, 'utf8') }))
}

export const cssFiles = (): SourceFile[] => sweepFiles(/\.css$/)
export const codeFiles = (): SourceFile[] => sweepFiles(/\.tsx?$/)

export const stripComments = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '')

export interface CssRule {
  file: string
  /** One selector list, as written (whitespace collapsed). */
  selector: string
  body: string
  /** The at-rule heads around it, outermost first: `@media (min-width: 80em)`, `@container ms-card (min-width: 44rem)`. */
  at: string[]
}

/** Every style rule of a stylesheet, at any @media or @container depth. @keyframes and @font-face are skipped. */
export function parseCss(file: string, source: string): CssRule[] {
  const rules: CssRule[] = []
  const go = (text: string, at: string[]): void => {
    let i = 0
    while (i < text.length) {
      const open = text.indexOf('{', i)
      if (open < 0) break
      const head = text.slice(i, open).trim().replace(/\s+/g, ' ')
      let depth = 1
      let j = open + 1
      while (j < text.length && depth > 0) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') depth--
        j++
      }
      const inner = text.slice(open + 1, j - 1)
      if (/^@(keyframes|font-face)/.test(head)) {
        /* skipped */
      } else if (head.startsWith('@')) go(inner, [...at, head])
      else rules.push({ file, selector: head, body: inner, at })
      i = j
    }
  }
  go(stripComments(source), [])
  return rules
}

export const allCssRules = (): CssRule[] => cssFiles().flatMap((f) => parseCss(f.path, f.text))

/** The declarations of a rule body as [property, value] pairs. */
export function declarations(body: string): [string, string][] {
  return body
    .split(';')
    .map((d) => {
      const i = d.indexOf(':')
      return i > 0 ? ([d.slice(0, i).trim(), d.slice(i + 1).trim()] as [string, string]) : null
    })
    .filter((d): d is [string, string] => d !== null)
}

/** The selectors of a rule's list, one by one. */
export const selectorsOf = (r: CssRule): string[] => r.selector.split(',').map((s) => s.trim())

/** The declarations of every rule whose selector list names `selector` (exactly), at any depth, merged: later wins. */
export function merged(rules: CssRule[], selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const r of rules) if (selectorsOf(r).includes(selector)) for (const [p, v] of declarations(r.body)) out[p] = v
  return out
}
