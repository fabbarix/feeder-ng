// B9-07 test helper: every CSS rule under web/src/ui and web/src/app (and styles.css) as flat blocks with their at-rule context, so a
// test can state a sweep rule ("no width query outside the table", "no :focus-visible ring without the token") over ALL the files, not
// only the ones a plan row names. vitest blanks CSS imports, so the files are read with node:fs (as ../test-utils.ts). Not scanned by check-ui.
const nodeFs = 'node:fs'
const fs = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

export interface CssBlock {
  /** Path relative to web/src. */
  file: string
  /** The selector list as written, whitespace collapsed ('' for an at-rule block with declarations, as @font-face). */
  selector: string
  /** The enclosing at-rule preludes, outermost first ('@media (min-width: 48em)', '@container card (width < 34rem)'). */
  atrules: string[]
  decls: [prop: string, value: string][]
  line: number
}

export const SRC = `${cwd}/src`

/** Every .css file under web/src/<dir> (recursive), as web/src-relative paths, sorted. */
export function cssFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(`${SRC}/${rel}`, { withFileTypes: true })) {
      const p = `${rel}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (e.name.endsWith('.css')) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

/** Non-test .ts/.tsx files under web/src/<dir> (recursive), web/src-relative, sorted. */
export function sourceFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(`${SRC}/${rel}`, { withFileTypes: true })) {
      const p = `${rel}/${e.name}`
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !/\.(test|spec|test-helper)\.tsx?$/.test(e.name) && !/test-utils\./.test(e.name)) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

export function readSrc(rel: string): string {
  try {
    return fs.readFileSync(`${SRC}/${rel}`, 'utf8')
  } catch {
    return ''
  }
}

/** Splits declarations on top-level semicolons (a `;` inside parentheses or quotes belongs to the value). */
function splitDecls(body: string): [string, string][] {
  const out: [string, string][] = []
  let depth = 0
  let q = ''
  let cur = ''
  const push = () => {
    const i = cur.indexOf(':')
    if (i > 0) out.push([cur.slice(0, i).trim(), cur.slice(i + 1).replace(/\s+/g, ' ').trim()])
    cur = ''
  }
  for (const ch of body) {
    if (q) {
      cur += ch
      if (ch === q) q = ''
      continue
    }
    if (ch === '"' || ch === "'") q = ch
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ';' && depth === 0) push()
    else cur += ch
  }
  push()
  return out
}

/** Parses one stylesheet into flat blocks (comments dropped; @keyframes steps are skipped; nested at-rules keep their context). */
export function parseCss(text: string, file: string): CssBlock[] {
  const blocks: CssBlock[] = []
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  const stack: { prelude: string; skip: boolean; at: boolean }[] = []
  let buf = ''
  let line = 1
  let preludeLine = 1
  let par = 0
  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i]!
    if (c === '\n') line++
    if (c === '(') par++
    if (c === ')') par = Math.max(0, par - 1)
    if (!buf.trim() && !/\s/.test(c)) preludeLine = line
    if (c === '{' && par === 0) {
      const prelude = buf.replace(/\s+/g, ' ').trim()
      const at = prelude.startsWith('@')
      const inKeyframes = stack.some((s) => s.skip)
      stack.push({ prelude, at, skip: inKeyframes || /^@(-webkit-)?keyframes\b/.test(prelude) })
      buf = ''
      // the body of a rule: read to the matching close (rules do not nest in this code base)
      if (!at && !inKeyframes) {
        let j = i + 1
        let d = 0
        while (j < stripped.length && !(stripped[j] === '}' && d === 0)) {
          if (stripped[j] === '(') d++
          if (stripped[j] === ')') d--
          if (stripped[j] === '\n') line++
          j++
        }
        const top = stack[stack.length - 1]!
        if (!top.skip) {
          blocks.push({ file, selector: prelude, atrules: stack.slice(0, -1).filter((s) => s.at).map((s) => s.prelude), decls: splitDecls(stripped.slice(i + 1, j)), line: preludeLine })
        }
        stack.pop()
        i = j
      } else if (at && !stack[stack.length - 1]!.skip && /^@(font-face|page|property)\b/.test(prelude)) {
        let j = i + 1
        while (j < stripped.length && stripped[j] !== '}') {
          if (stripped[j] === '\n') line++
          j++
        }
        blocks.push({ file, selector: '', atrules: [prelude], decls: splitDecls(stripped.slice(i + 1, j)), line: preludeLine })
        stack.pop()
        i = j
      }
      continue
    }
    if (c === '}' && par === 0) {
      stack.pop()
      buf = ''
      continue
    }
    if (c === ';' && par === 0 && stack.length === 0) {
      buf = ''
      continue
    }
    buf += c
  }
  return blocks
}

/** Blocks of every stylesheet under the given web/src dirs plus any single files (e.g. 'styles.css'). */
export function blocksOf(dirs: string[], files: string[] = []): CssBlock[] {
  const all = [...dirs.flatMap(cssFiles), ...files]
  return all.flatMap((f) => parseCss(readSrc(f), f))
}

/** The last compound of a selector (after a space, `>`, `+` or `~`), for exemptions that read the element the rule styles. */
export function lastCompound(selector: string): string {
  const t = selector.replace(/\s*[>+~]\s*/g, ' ').trim()
  return t.split(/\s+/).pop() ?? t
}

/** Selector list split on top-level commas. */
export function selectorList(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

/** True for a token block: every selector is :root or html[...] (as check-ui's type-scale reads it). */
export function isTokenBlock(b: CssBlock): boolean {
  return selectorList(b.selector).every((s) => /^:root(\[[^\]]*\])*$/.test(s) || /^html(\[[^\]]*\])*$/.test(s) || /^\[data-scheme=['"][a-z]+['"]\]$/.test(s) || /^:root:not\(\[[^\]]*\]\)$/.test(s) || /^:root,\s*\[data-scheme/.test(s))
}
