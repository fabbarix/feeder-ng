// Test helper of the B9-09 sweep (shop, scan, stock, receipt, ingredients, products, shops): reads the folders' CSS and sources from
// disk and flattens a stylesheet into rules with the at-rule conditions around them. Not a test file.
const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory: () => boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

/** The seven folders of package B9-09 (relative to web/src/features). */
export const SWEEP_FOLDERS = ['shop', 'scan', 'stock', 'receipt', 'ingredients', 'products', 'shops'] as const

function walk(dir: string, out: string[]): void {
  for (const name of fs.readdirSync(dir)) {
    const path = `${dir}/${name}`
    if (fs.statSync(path).isDirectory()) walk(path, out)
    else out.push(path)
  }
}

/** Every file under the sweep folders (absolute paths), sorted. */
export function sweepFiles(): string[] {
  const out: string[] = []
  for (const f of SWEEP_FOLDERS) walk(`${cwd}/src/features/${f}`, out)
  return out.sort()
}
const isTest = (p: string) => /\.(test|spec)\.|\.test-helper\.|test-utils\./.test(p)
/** Non-test source files (ts, tsx) of the sweep folders. */
export const sweepSources = () => sweepFiles().filter((p) => /\.tsx?$/.test(p) && !isTest(p))
/** The stylesheets of the sweep folders. */
export const sweepStylesheets = () => sweepFiles().filter((p) => p.endsWith('.css'))
export const rel = (p: string) => p.replace(`${cwd}/src/features/`, '')
export const readText = (p: string) => fs.readFileSync(p, 'utf8')
export const readFeature = (path: string) => fs.readFileSync(`${cwd}/src/features/${path}`, 'utf8')
/** A file of the repository, by path from the repository root ('' when missing). */
export function readRepo(path: string): string {
  try {
    return fs.readFileSync(`${cwd}/../${path}`, 'utf8')
  } catch {
    return ''
  }
}
/** A feature source without its comments (block and line). */
export const code = (path: string) => stripComments(readFeature(path)).replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
/** Comments blanked, so a word in a comment never counts. */
export const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

export interface CssRule {
  selector: string
  /** [property, value] pairs in source order. */
  decls: [string, string][]
  /** The enclosing at-rule heads, outermost first: `@media (min-width: 48em)`, `@container x (width < 34rem)`. */
  context: string[]
  file: string
}

function parseBody(body: string): [string, string][] {
  const out: [string, string][] = []
  let depth = 0
  let cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) {
      const i = cur.indexOf(':')
      if (i > 0) out.push([cur.slice(0, i).trim(), cur.slice(i + 1).trim().replace(/\s+/g, ' ')])
      cur = ''
    } else cur += ch
  }
  const i = cur.indexOf(':')
  if (i > 0) out.push([cur.slice(0, i).trim(), cur.slice(i + 1).trim().replace(/\s+/g, ' ')])
  return out
}

function parse(text: string, context: string[], file: string, out: CssRule[]): void {
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
    if (head.startsWith('@media') || head.startsWith('@container') || head.startsWith('@supports') || head.startsWith('@layer')) parse(inner, [...context, head], file, out)
    else if (!head.startsWith('@')) out.push({ selector: head, decls: parseBody(inner), context, file })
    i = j
  }
}

/** Every style rule of a stylesheet text, flattened; keyframes and font-face blocks are left out. */
export function cssRules(text: string, file = ''): CssRule[] {
  const out: CssRule[] = []
  parse(stripComments(text), [], file, out)
  return out
}
/** Every style rule of every stylesheet in the sweep folders. */
export const sweepRules = () => sweepStylesheets().flatMap((f) => cssRules(readText(f), rel(f)))

/** The value of `prop` for `selector` (an exact selector of the list) at a viewport width, em at 16 px: base and `(min-width: Xem)` / `(width < Xem)` media applied in order. */
export function valueAtWidth(rules: CssRule[], selector: string, prop: string, widthPx: number): string | undefined {
  let v: string | undefined
  for (const r of rules) {
    if (!r.selector.split(',').map((s) => s.trim()).includes(selector)) continue
    const ok = r.context.every((c) => {
      if (!c.startsWith('@media')) return false
      const min = /\(min-width:\s*([\d.]+)em\)/.exec(c)
      const lt = /\(width\s*<\s*([\d.]+)em\)/.exec(c)
      if (min) return widthPx >= Number(min[1]) * 16
      if (lt) return widthPx < Number(lt[1]) * 16
      return !/width/.test(c) // a px or max-width query is not in the em table: it never applies here
    })
    if (!ok) continue
    for (const [p, val] of r.decls) if (p === prop) v = val
  }
  return v
}
