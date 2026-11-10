// "No native browser UI" (CLAUDE.md) inside web/src/ui: no native control is used, except a few inputs that a
// primitive replaces visually. Keeps WP4's acceptance criterion true as the primitives are implemented.
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(['./**/*.ts', './**/*.tsx', '!./**/*.test.*', '!./test-utils.*'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Native inputs that exist only inside the primitive that replaces them visually. */
const ALLOWED: Record<string, string> = {
  'fields/Checkbox.tsx': 'checkbox',
  'fields/FileDrop.tsx': 'file',
  'fields/SearchField.tsx': 'search',
}

const files = Object.entries(raw).map(([p, text]) => ({ rel: p.replace(/^\.\//, ''), text: text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }))

describe('no native browser UI in ui/', () => {
  it('never uses <select>, alert, confirm or prompt', () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/<select[\s>/]/)
      expect(f.text, f.rel).not.toMatch(/window\.(alert|confirm|prompt)\(/)
      expect(f.text, f.rel).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\(/m)
    }
  })

  it('uses a native <input type> of a pickable kind only in its allow-listed primitive', () => {
    const re = /<input\b[^>]*\btype\s*=\s*["'{`]*\s*["']?(checkbox|radio|date|time|number|range|color|file|search|datetime-local|month|week)\b/g
    for (const f of files) {
      const allowed = ALLOWED[f.rel]
      for (const m of f.text.matchAll(re)) expect(m[1], `${f.rel} uses <input type=${m[1]}>`).toBe(allowed)
    }
  })

  it('every allow-listed file exists (so a rename cannot silently widen the allowance)', () => {
    for (const rel of Object.keys(ALLOWED)) expect(files.map((f) => f.rel)).toContain(rel)
  })
})
