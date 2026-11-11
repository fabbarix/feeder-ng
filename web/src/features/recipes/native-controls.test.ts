// "No native browser UI" (CLAUDE.md) for the recipes and import features (WP9 acceptance: the editor uses only field primitives).
import { describe, expect, it } from 'vitest'

const raw = import.meta.glob(
  ['./**/*.ts', './**/*.tsx', '../import/**/*.ts', '../import/**/*.tsx', '!./**/*.test.*', '!../import/**/*.test.*', '!./**/*.test-helper.*', '!../import/**/*.test-helper.*'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

const files = Object.entries(raw).map(([rel, text]) => ({ rel, text: text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '') }))

describe('no native browser UI in features/recipes and features/import', () => {
  it('scans the production files of both features', () => {
    expect(files.length).toBeGreaterThan(40)
  })
  it('never calls alert, confirm or prompt', () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/window\.(alert|confirm|prompt)\(/)
      expect(f.text, f.rel).not.toMatch(/(^|[^.\w])(alert|confirm|prompt)\(/m)
    }
  })
  it('never renders <select>, <datalist> or a pickable native <input type>', () => {
    const picky = /<input\b[^>]*\btype\s*=\s*["'{`]*\s*["']?(checkbox|radio|date|time|number|range|color|file|search|datetime-local|month|week)\b/g
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/<(select|datalist)[\s>/]/)
      expect([...f.text.matchAll(picky)].map((m) => m[1]), f.rel).toEqual([])
    }
  })
  it('renders no bare <input>, <textarea> or <label>: text goes through TextField / TextArea / NumberField / SearchField', () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/<(input|textarea|label)[\s>/]/)
    }
  })
  it('no legacy Tile/Chip/Button/EmptyState props remain', () => {
    for (const f of files) {
      expect(f.text, f.rel).not.toMatch(/<Chip\b[^>]*\btone=/)
      expect(f.text, f.rel).not.toMatch(/<Tile\b[^>]*\b(size|tone|onClick)=/)
      expect(f.text, f.rel).not.toMatch(/<Button\b[^>]*\bvariant=["'{`]*(tonal|ghost)/)
      expect(f.text, f.rel).not.toMatch(/<EmptyState\b[^>]*\billustration=/)
    }
  })
  it('scans the PT files and no longer has the Member picker or the preference toggles (PT)', () => {
    const rels = files.map((f) => f.rel)
    for (const rel of ['./components/PreferenceTable.tsx', './components/IngredientExclusionList.tsx', './hooks/useHouseholdPreferences.ts', './lib/preferenceRows.ts']) expect(rels).toContain(rel)
    expect(rels.filter((r) => /MemberPicker|PreferenceToggles|useMemberPicker|useRecipePreferences|memberPick/.test(r))).toEqual([])
  })
  it('the preferences table is built from the shared primitives: IconButton, Avatar and Chip, no bare <button> of its own (PT)', () => {
    const table = files.find((f) => f.rel === './components/PreferenceTable.tsx')!
    expect(table.text).toMatch(/\bIconButton\b/)
    expect(table.text).toMatch(/\bAvatar\b/)
    expect(table.text).not.toMatch(/<button[\s>]/)
    expect(table.text).not.toMatch(/role=["']grid["']/)
  })
})
