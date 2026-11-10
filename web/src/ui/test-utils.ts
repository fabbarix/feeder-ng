// Helpers for tests that read a primitive's stylesheet. vitest blanks CSS imports, so the file is read
// with an untyped dynamic import of node:fs (@types/node is not installed). Not scanned by check-ui.
const nodeFs = 'node:fs'
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string) => string[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

/** Text of web/src/ui/<name>; '' while the stylesheet does not exist yet, so the tests that need it fail one by one. */
export function readUiCss(name: string): string {
  try {
    return readFileSync(`${cwd}/src/ui/${name}`, 'utf8')
  } catch {
    return ''
  }
}

/** All .css files directly in web/src/ui, name -> text. */
export function readAllUiCss(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(`${cwd}/src/ui`).filter((n) => n.endsWith('.css')).sort()) out[name] = readUiCss(name)
  return out
}

const norm = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()

/**
 * Declarations (prop -> value) merged over every rule whose selector list contains `selector` exactly
 * (quotes and whitespace normalised). Throws when no rule matches. Flat CSS only: no nesting, @media blocks are skipped.
 */
export function declarations(css: string, selector: string): Record<string, string> {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // drop @media / @supports blocks (one nesting level)
  const flat = noComments.replace(/@[a-z-]+[^{;]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
  const out: Record<string, string> = {}
  let found = false
  for (const m of flat.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = splitSelectors(m[1]!)
    if (!selectors.includes(norm(selector))) continue
    found = true
    for (const d of m[2]!.split(';')) {
      const i = d.indexOf(':')
      if (i > 0) out[d.slice(0, i).trim()] = norm(d.slice(i + 1))
    }
  }
  if (!found) throw new Error(`no CSS rule for ${selector}`)
  return out
}

/** Text of web/src/styles.css ('' when unreadable). */
export function readStylesCss(): string {
  try {
    return readFileSync(`${cwd}/src/styles.css`, 'utf8')
  } catch {
    return ''
  }
}

/** Innermost rule blocks of a stylesheet (comments dropped, @media wrappers unwrapped): selector list and body. */
export function ruleBlocks(css: string): { selectors: string[]; body: string }[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return [...noComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: splitSelectors(m[1]!),
    body: m[2]!,
  }))
}

/** Splits a selector list on top-level commas only (commas inside parentheses, as in :is(a, b), are kept). */
function splitSelectors(list: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of list) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(norm)
}
