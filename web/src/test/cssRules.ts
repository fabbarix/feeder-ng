// Test helper: pin CSS rules in the source (jsdom cannot measure layout). Comments are stripped.
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()

export interface Stylesheet {
  /** The whole stylesheet. */
  css: string
  /** Without its @media blocks: the base rules. */
  base: string
  /** The body of the `@media (max-width: 599px)` block (phone), or ''. */
  phone: string
}

/** A stylesheet under web/, for example `src/features/access/access.css`. */
export function stylesheet(path: string): Stylesheet {
  const css = readFileSync(`${cwd}/${path}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const base = css.replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const m = css.match(/@media[^{]*max-width:\s*(?:599(?:\.98)?px|37\.4(?:rem|em))[^{]*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/)
  return { css, base, phone: m?.[1] ?? '' }
}

/** Declarations of every top-level rule in `source` whose selector list contains `selector` exactly, merged. */
export function rule(source: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of source.matchAll(/(?<=^|\})()\s*([^{}@]+)\{([^{}]*)\}/g)) {
    if (!m[2]!.split(',').map((x) => x.trim()).includes(selector)) continue
    for (const d of m[3]!.split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out[d.slice(0, i).trim()] = d.slice(i + 1).trim()
    }
  }
  return out
}

/** Text of a file under web/src, '' when missing. */
function readUnderSrc(relativeToSrc: string): string {
  try {
    return readFileSync(`${cwd}/src/${relativeToSrc}`, 'utf8')
  } catch {
    return ''
  }
}

// Every style rule of a stylesheet with the min-width of its @media (the R2-1 contract tests; recipes-filter, pantry-filter).
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

/** The rules of one or more stylesheets under web/src (in order, as if concatenated), with lookups over them. */
export function cssRules(paths: readonly string[]) {
  const rules: Rule[] = paths.flatMap((p) => parse(readUnderSrc(p).replace(/\/\*[\s\S]*?\*\//g, '')))

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

  /** The effective value of `prop` for `selector` at viewport `width`: the last matching rule among those with minWidth <= width. */
  function valueFor(selector: string, prop: string, width: number): string | undefined {
    const re = new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+)`)
    let out: string | undefined
    const matching = rulesFor(selector)
      .filter((r) => r.minWidth <= width)
      .sort((a, b) => a.minWidth - b.minWidth)
    for (const r of matching) {
      const m = re.exec(r.body)
      if (m) out = m[1]!.trim().replace(/\s+/g, ' ')
    }
    return out
  }

  return { rules, rulesFor, valueAt, valueFor }
}

