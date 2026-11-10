// WP11 acceptance: "zero native controls" and "no secondary colour" in the six feature folders this team owns
// (CLAUDE.md "No native browser UI"; the per-User secondary colour was removed in R6). Mirrors ui/native-controls.test.ts.
// The only native <input> allowed is the one inside a shared primitive in web/src/ui, never in a feature.
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(
  [
    './settings/**/*.{ts,tsx,css}',
    './ingredients/**/*.{ts,tsx,css}',
    './products/**/*.{ts,tsx,css}',
    './shops/**/*.{ts,tsx,css}',
    './notifications/**/*.{ts,tsx,css}',
    './signin/**/*.{ts,tsx,css}',
    '!./**/*.test.*',
    '!./**/test-utils.*',
    '!./**/fixtures.*',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const files = Object.entries(raw).map(([path, text]) => ({
  path,
  text: text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''),
}))

describe('WP11 folders use no native browser UI', () => {
  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(40)
  })

  it('never uses <select> or alert/confirm/prompt', () => {
    for (const f of files) {
      expect(f.text, f.path).not.toMatch(/<select[\s>/]/)
      expect(f.text, f.path).not.toMatch(/window\.(alert|confirm|prompt)\(/)
      expect(f.text, f.path).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\(/m)
    }
  })

  it('never renders a native input of a pickable or search kind', () => {
    const re = /<input\b[^>]*\btype\s*=\s*["'{`]*\s*["']?(checkbox|radio|date|time|number|range|color|file|search|datetime-local|month|week)\b/g
    const offenders = files.flatMap((f) => [...f.text.matchAll(re)].map((m) => `${f.path}: <input type=${m[1]}>`))
    expect(offenders).toEqual([])
  })

  it('never makes an input native by role-hacking it (input type=checkbox role=switch)', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/<input\b[^>]*\brole\s*=\s*["']switch/)
  })

  it('has no text-input fallback for a time, date or number (type="time" etc. in a prop object)', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/type:\s*['"](time|date|number|range|color|search)['"]/)
  })
})

describe('the per-User secondary colour is gone (R6)', () => {
  it('leaves no secondary-colour identifier, field, class or token in the six folders', () => {
    for (const f of files) {
      expect(f.text, f.path).not.toMatch(/secondary(Colou?r|Accent)?\b/i)
      expect(f.text, f.path).not.toMatch(/--color-(on-)?secondary/)
    }
  })

  it('Preferences carries only scheme, accent and units', async () => {
    const { DEFAULT_PREFERENCES } = await import('./settings/lib/defaults')
    expect(Object.keys(DEFAULT_PREFERENCES).sort()).toEqual(['accent', 'scheme', 'units'])
  })
})

describe('icons come only from the shared Icon component', () => {
  it('imports nothing from @phosphor-icons in a feature', () => {
    for (const f of files) expect(f.text, f.path).not.toMatch(/@phosphor-icons/)
  })

  it('has no emoji or unicode glyph standing in for an icon button ("×" as a close label)', () => {
    for (const f of files.filter((x) => x.path.endsWith('.tsx'))) expect(f.text, f.path).not.toMatch(/>\s*[×✕✖✗]\s*</)
  })
})
