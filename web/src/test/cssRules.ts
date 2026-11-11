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
