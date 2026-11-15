// B9-10 (sweep-recipes-settings): the W1 sweep of features/recipes, import, recipe-assistant, settings and tags, pinned in the source
// because jsdom does not lay out (the page-layout scenarios and the reviewer's shots are the proof of geometry). One block per theme:
//   DS-07 type roles and the DS-07 drift (docs/ B9-DRIFT-W1.md), DS-11 (opacity, radii, spacing), A11Y-02 (focus rings),
//   DS-09 (em breakpoints, container queries in rem, no raw useMediaQuery), DS-04 (.tag-input, now .tag-chooser: B9-37), WP-RX-0 (the file splits).
// Each test reads every file of the five folders, so a class added later is covered too.
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'
import {
  allCssRules,
  codeFiles,
  cssFiles,
  declarations,
  merged,
  selectorsOf,
  stripComments,
  type CssRule,
} from './sweep.test-helper'

const rules = allCssRules()
const label = (r: CssRule) => `${r.file}: ${r.selector}`

describe('B9-10: the sweep reads the five folders', () => {
  it('finds the stylesheets of every folder', () => {
    const files = cssFiles().map((f) => f.path)
    for (const f of ['recipes', 'import', 'recipe-assistant', 'settings', 'tags']) expect(files.some((p) => p.startsWith(`features/${f}/`)), f).toBe(true)
    expect(rules.length).toBeGreaterThan(300)
  })
})

describe('DS-07: a class that sets a font size sets the whole role (the body role drift, B9-DRIFT-W1)', () => {
  // DS-07's body role (15/22, 500) is inherited by anything that sets only a size, so such a class changed height and weight when the
  // role landed. A selector that sets a size must also set a line height and a weight (the union of its rules), or use `font`.
  const bySelector = new Map<string, { sizes: string[]; line: boolean; weight: boolean; where: string }>()
  for (const r of rules) {
    const decls = declarations(r.body)
    const has = (p: string) => decls.some(([k]) => k === p)
    for (const s of selectorsOf(r)) {
      if (/^(:root|html|body)\b/.test(s)) continue
      const e = bySelector.get(s) ?? { sizes: [], line: false, weight: false, where: r.file }
      for (const [k, v] of decls) if (k === 'font-size' && v !== 'inherit') e.sizes.push(v)
      if (has('line-height') || has('font')) e.line = true
      if (has('font-weight') || has('font')) e.weight = true
      bySelector.set(s, e)
    }
  }
  const sized = [...bySelector.entries()].filter(([, e]) => e.sizes.length > 0)

  it('sets a line height with every font size', () => {
    expect(sized.length).toBeGreaterThan(50) // 59 selectors set a font size at the start of B9-10
    expect(sized.filter(([, e]) => !e.line).map(([s, e]) => `${e.where}: ${s}`)).toEqual([])
  })
  it('sets a weight with every font size', () => {
    expect(sized.filter(([, e]) => !e.weight).map(([s, e]) => `${e.where}: ${s}`)).toEqual([])
  })
  it('takes every font size from a --text-* role, never a raw size (settings__overline was 0.8rem)', () => {
    const raw = rules.flatMap((r) => declarations(r.body).filter(([k, v]) => k === 'font-size' && v !== 'inherit' && !/^var\(--text-[a-z0-9-]+-size\)$/.test(v)).map(([, v]) => `${label(r)} -> ${v}`))
    expect(raw).toEqual([])
  })

  describe('the classes the drift list names', () => {
    // .steps-list__* and .preference-table__name (/recipes/:id): 16 -> 15 on 22. They state their role, so the row's box is the role's.
    it.each(['.steps-list__item', '.steps-list__text', '.preference-table__name'])('%s states size, line height and weight from the --text-* tokens', (sel) => {
      const d = merged(rules, sel)
      expect(d['font-size'], `${sel} font-size`).toMatch(/^var\(--text-[a-z0-9-]+-size\)$/)
      expect(d['line-height'], `${sel} line-height`).toMatch(/^var\(--text-[a-z0-9-]+-line\)$/)
      expect(d['font-weight'], `${sel} font-weight`).toMatch(/^var\(--text-[a-z0-9-]+-weight\)$/)
    })
    it('Step text is weight 500: a Step sentence is never bold (VC8, R-C+)', () => {
      expect(merged(rules, '.steps-list__text')['font-weight']).toMatch(/^var\(--text-(step|body)-weight\)$/)
      expect(merged(rules, '.steps-list__item')['font-weight']).not.toMatch(/strong|bold|[6-9]00/)
    })
    it('the Step text role is the body role (15/22): its list item and its text agree', () => {
      for (const p of ['font-size', 'line-height']) expect(merged(rules, '.steps-list__text')[p], p).toBe(merged(rules, '.steps-list__item')[p])
    })
  })

  describe('muted lines and overlines are the DS-07 primitives, not feature classes', () => {
    const removed = ['.settings__overline', '.settings__muted', '.ra__muted']
    it.each(removed)('%s has no rule left (the overline class of ui on the Settings h2, Muted from ui)', (sel) => {
      expect(rules.filter((r) => selectorsOf(r).includes(sel)).map(label)).toEqual([])
    })
    it('no component of the five folders uses .pg__*, .settings__overline, .settings__muted or .ra__muted', () => {
      const bad = codeFiles().filter((f) => /\b(pg__[a-z-]+|settings__overline|settings__muted|ra__muted)\b/.test(stripComments(f.text))).map((f) => f.path)
      expect(bad).toEqual([])
    })
    it('the places that were muted lines import Muted from ui', () => {
      for (const f of [
        'features/settings/screens/CoursesPage.tsx',
        'features/settings/components/AttendanceEditor.tsx',
        'features/recipe-assistant/components/ModelTile.tsx',
        'features/tags/screens/TagsScreen.tsx',
      ]) expect(readSource(f), f).toMatch(/\bMuted\b/)
    })
  })
})

describe('DS-11: no opacity muting, no raw radius, no raw spacing', () => {
  const lastCompound = (s: string) => s.replace(/\s*[>+~]\s*/g, ' ').split(' ').pop() ?? s
  const exempt = (selector: string): boolean => {
    const last = lastCompound(selector)
    return /:disabled|\[disabled|aria-disabled|data-disabled/.test(selector) || /::?(before|after)\b/.test(last) || /__(glyph|icon)\b/.test(last)
  }
  it('opacity 0.05 to 0.95 appears only on disabled controls, pseudo-elements and decorative glyphs (check-ui opacity-muting, widened)', () => {
    const bad: string[] = []
    for (const r of rules) {
      for (const [k, v] of declarations(r.body)) {
        if (k !== 'opacity') continue
        const n = /%$/.test(v) ? parseFloat(v) / 100 : parseFloat(v)
        if (!Number.isNaN(n) && n >= 0.05 && n <= 0.95 && !selectorsOf(r).every(exempt)) bad.push(`${label(r)} -> opacity ${v}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('border-radius is a --radius-* token, 0, inherit or 50% (a circle)', () => {
    const bad: string[] = []
    for (const r of rules) for (const [k, v] of declarations(r.body)) if (/^border(-[a-z]+)*-radius$/.test(k) && !/^(var\(--radius-[a-z0-9-]+\)|0|inherit|50%)$/.test(v)) bad.push(`${label(r)} -> ${k}: ${v}`)
    expect(bad).toEqual([])
  })
  it('gap, padding, margin and inset use --space-* tokens (0 and 1px allowed; negative offsets are written as calc(-1 * var(--space-N)))', () => {
    const prop = /^(gap|row-gap|column-gap|padding(-[a-z-]+)?|margin(-[a-z-]+)?|inset(-[a-z-]+)?)$/
    const bad: string[] = []
    for (const r of rules) {
      for (const [k, v0] of declarations(r.body)) {
        if (!prop.test(k)) continue
        const v = v0.replace(/var\([^)]*\)/g, '')
        if (/(^|[^0-9.a-z])-?([2-9]|[1-9][0-9]+|0?\.[0-9]+|1\.[0-9]+)(px|rem)/.test(v)) bad.push(`${label(r)} -> ${k}: ${v0}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('Who eats it: a Member who does not eat the Course is an outlined, struck-through pill, not a faded one (DS-11)', () => {
    const sel = ".course-eaters__pill[aria-pressed='false'] .member-pill"
    const norm = (s: string) => s.replace(/"/g, "'")
    const body = rules.filter((r) => selectorsOf(r).some((s) => norm(s) === sel)).map((r) => r.body).join(';')
    expect(body).toMatch(/background:\s*transparent/)
    expect(body).toMatch(/text-decoration:\s*line-through/)
    expect(body).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--color-outline\)/)
    const pill = rules.filter((r) => selectorsOf(r).some((s) => norm(s).startsWith(".course-eaters__pill[aria-pressed='false']")))
    expect(pill.some((r) => /(^|;)\s*opacity\s*:/.test(r.body))).toBe(false)
  })
  it('the archived Courses list is the Muted look, not a faded list', () => {
    expect(merged(rules, '.courses-list--archived').opacity).toBeUndefined()
  })
})

describe('A11Y-02: one focus ring (the global :where(:focus-visible)), none of the feature rules draws its own', () => {
  const focusRules = rules.filter((r) => selectorsOf(r).some((s) => /:focus-visible/.test(s)))
  it('draws no box-shadow ring and does not hide the outline', () => {
    const bad: string[] = []
    for (const r of focusRules) {
      const d = declarations(r.body)
      for (const [k, v] of d) {
        if (k === 'box-shadow' && /focus-ring/.test(v)) bad.push(`${label(r)} -> box-shadow: ${v}`)
        if (k === 'outline' && /^(none|0|0px)$/.test(v)) bad.push(`${label(r)} -> outline: ${v}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('an outline it does set uses the ring tokens, never --color-accent or a raw width', () => {
    const bad: string[] = []
    for (const r of focusRules) {
      for (const [k, v] of declarations(r.body)) {
        if (k === 'outline' && !/var\(--focus-ring-color\)/.test(v)) bad.push(`${label(r)} -> outline: ${v}`)
        if (k === 'outline' && /var\(--color-accent\)|\b\d+px\b/.test(v)) bad.push(`${label(r)} -> outline: ${v}`)
        if (k === 'outline-offset' && !/^0$|var\(--focus-ring-/.test(v)) bad.push(`${label(r)} -> outline-offset: ${v}`)
      }
    }
    expect(bad).toEqual([])
  })
  it('no stylesheet or component of the five folders reads the removed --focus-ring token', () => {
    const bad = [...cssFiles(), ...codeFiles()].filter((f) => /var\(--focus-ring\)/.test(stripComments(f.text))).map((f) => f.path)
    expect(bad).toEqual([])
  })
  it('the picker rows keep a visible ring: the listbox option highlight is not the only focus cue', () => {
    // .picker-row:focus-visible had `outline: none`: a full-bleed row in a scrolling sheet draws its ring inside its own edge.
    const own = rules.filter((r) => selectorsOf(r).some((s) => /^\.picker-row(:focus-visible)?$/.test(s) && /:focus-visible/.test(s)))
    for (const r of own) expect(r.body, label(r)).not.toMatch(/outline:\s*none/)
  })
})

describe('DS-09: em breakpoints, container queries in rem, no raw useMediaQuery', () => {
  const TABLE = [23.5, 37.5, 48, 64, 80, 90]
  const widthQueries = rules.flatMap((r) => r.at.filter((a) => a.startsWith('@media') && /width/.test(a)).map((a) => ({ r, a })))
  it('has width media queries to check', () => {
    expect(widthQueries.length).toBeGreaterThan(0)
  })
  it('every width @media is (min-width: Xem) or (width < Xem), X from the table 23.5, 37.5, 48, 64, 80, 90', () => {
    const bad = widthQueries.filter(({ a }) => {
      const m = /^@media (?:\(min-width: ([0-9.]+)em\)|\(width < ([0-9.]+)em\))$/.exec(a)
      return !m || !TABLE.includes(Number(m[1] ?? m[2]))
    })
    expect(bad.map(({ r, a }) => `${label(r)} in ${a}`)).toEqual([])
  })
  it('every @container query is in rem', () => {
    const queries = rules.flatMap((r) => r.at.filter((a) => a.startsWith('@container')).map((a) => ({ r, a })))
    expect(queries.length).toBeGreaterThan(0)
    expect(queries.filter(({ a }) => /\d+(\.\d+)?(px|em)\b/.test(a.replace(/rem/g, ''))).map(({ r, a }) => `${label(r)} in ${a}`)).toEqual([])
  })
  it('the two-column Recipe editor starts at (min-width: 80em), not 1280px; the detail (B9-27, RX-04) switches by its own width, in a container query', () => {
    const wide = rules.filter((r) => r.at.includes('@media (min-width: 80em)')).map((r) => r.file)
    expect(wide.some((f) => /recipes\/recipe-detail\.css$/.test(f)), 'detail has no 80em media rule').toBe(false)
    expect(rules.some((r) => /recipes\/recipe-detail\.css$/.test(r.file) && r.at.includes('@container recipe-detail (min-width: 45rem)')), 'detail container query').toBe(true)
    expect(wide.some((f) => /recipes\/recipe-editor\.css$/.test(f)), 'editor').toBe(true)
  })
  it('the Settings phone rules are (width < 37.5em), not max-width: 599px', () => {
    const phone = rules.filter((r) => /settings\/settings\.css$/.test(r.file) && r.at.includes('@media (width < 37.5em)'))
    expect(phone.some((r) => selectorsOf(r).includes('.allowlist__field'))).toBe(true)
  })
  it('the Meal Slot card splits at its own container: @container ms-card (min-width: 44rem), not a 820px media query', () => {
    const split = rules.filter((r) => /mealSlotCards\.css$/.test(r.file) && r.at.includes('@container ms-card (min-width: 44rem)'))
    expect(split.map((r) => r.selector)).toEqual(expect.arrayContaining([".ms-card[data-span='full'] .ms-card__split"]))
    const declared = rules.filter((r) => /mealSlotCards\.css$/.test(r.file) && declarations(r.body).some(([k, v]) => (k === 'container' && /^ms-card\s*\/\s*inline-size$/.test(v)) || (k === 'container-name' && v === 'ms-card')))
    expect(declared.length, 'a rule declares the ms-card container (container: ms-card / inline-size)').toBeGreaterThan(0)
  })
  // B9-37 (RX-02): the switch moved from the 49rem box query to the chapter's 42rem of list width, in the editor's lines sheet.
  it('the editor ingredient lines switch to one row at @container ... (min-width: 42rem), not (min-width: 900px)', () => {
    const q = rules.filter((r) => /recipes\/recipe-editor[^/]*\.css$/.test(r.file) && selectorsOf(r).includes('.line-row') && r.at.some((a) => /^@container [a-z-]+ \(min-width: 42rem\)$/.test(a)))
    expect(q.length).toBeGreaterThan(0)
    const name = /^@container ([a-z-]+) /.exec(q[0]!.at.find((a) => a.startsWith('@container'))!)![1]!
    // the container the query names must be declared, in the editor sheet, on an element that holds the .line-row and its header
    const declared = rules.some((r) => declarations(r.body).some(([k, v]) => (k === 'container' && new RegExp(`^${name}\\s*/\\s*inline-size$`).test(v)) || (k === 'container-name' && v === name)))
    expect(declared, `container ${name} is declared`).toBe(true)
  })
  // B9-27 (RX-04): the Cook tile shows from the side rail's breakpoint, 1024 px ('desktop'), no longer from 'desktopWide'.
  it('useMediaQuery is not called by a component of the five folders: RecipeDetailScreen asks useBreakpoint("desktop")', () => {
    const calls = codeFiles().filter((f) => /\buseMediaQuery\s*\(/.test(stripComments(f.text))).map((f) => f.path)
    expect(calls).toEqual([])
    const detail = readSource('features/recipes/screens/RecipeDetailScreen.tsx')
    expect(detail).toMatch(/useBreakpoint\(\s*'desktop'\s*\)/)
    expect(detail).not.toMatch(/1280px/)
  })
})

// B9-37 (RX-09): the Tag field is .tag-chooser now (TagInput is gone); recipe-editor.tagChooser.css.test.ts holds the rest of DS-04.
describe('DS-04: a Tag chip never runs past the Tag field', () => {
  const field = () => merged(rules, '.tag-chooser')
  it('.tag-chooser has a definite track: grid-template-columns: minmax(0, 1fr)', () => {
    expect(field()['grid-template-columns']).toBe('minmax(0, 1fr)')
  })
  it('.tag-chooser sets no fixed 320px, which is wider than the 375 px column', () => {
    expect(JSON.stringify(rules.filter((r) => selectorsOf(r).some((s) => s.startsWith('.tag-chooser'))).map((r) => r.body))).not.toMatch(/320px/)
  })
})

describe('WP-RX-0: recipes.css is split into recipes-list.css, recipe-detail.css and recipe-editor.css', () => {
  const sheets = ['recipes-list.css', 'recipe-detail.css', 'recipe-editor.css']
  const text = (f: string) => readSource(`features/recipes/${f}`)
  const classesOf = (f: string): Set<string> => {
    const out = new Set<string>()
    for (const r of rules.filter((x) => x.file === `features/recipes/${f}`)) for (const m of r.selector.matchAll(/\.([a-z][a-z0-9_-]*)/g)) out.add(m[1]!)
    return out
  }

  it('recipes.css is gone and the three sheets exist, each a sheet and not a stub', () => {
    expect(text('recipes.css')).toBe('')
    for (const f of sheets) expect(text(f).length, f).toBeGreaterThan(2000)
  })
  it('none is larger than 600 lines (the 1118-line file was the reason for the split)', () => {
    for (const f of sheets) expect(text(f).split('\n').length, f).toBeLessThanOrEqual(600)
  })
  it('each screen imports its own sheet and no screen imports the old recipes.css', () => {
    expect(readSource('features/recipes/screens/RecipesScreen.tsx')).toMatch(/import '\.\.\/recipes-list\.css'/)
    expect(readSource('features/recipes/screens/RecipeDetailScreen.tsx')).toMatch(/import '\.\.\/recipe-detail\.css'/)
    expect(readSource('features/recipes/screens/RecipeEditorScreen.tsx')).toMatch(/import '\.\.\/recipe-editor\.css'/)
    const stale = codeFiles().filter((f) => /recipes\.css'/.test(f.text)).map((f) => f.path)
    expect(stale).toEqual([])
  })
  it('the classes live with their screen: tile and filters in the list, Steps and Preferences in the detail, Tag input and Step cards in the editor', () => {
    const list = classesOf('recipes-list.css')
    const detail = classesOf('recipe-detail.css')
    // B9-37: the editor's sheet is split under the 600-line cap (recipe-editor.css, .lines.css, .steps.css, .sections.css).
    const editor = new Set(['recipe-editor.css', 'recipe-editor.lines.css', 'recipe-editor.steps.css', 'recipe-editor.sections.css'].flatMap((f) => [...classesOf(f)]))
    for (const c of ['recipe-tile', 'recipes-screen']) expect(list.has(c), `list: .${c}`).toBe(true)
    for (const c of ['recipe-detail__hero', 'steps-list', 'preference-table']) expect(detail.has(c), `detail: .${c}`).toBe(true)
    for (const c of ['tag-chooser', 'step-card', 'line-row', 'recipe-editor-layout']) expect(editor.has(c), `editor: .${c}`).toBe(true)
    for (const c of ['steps-list', 'preference-table']) expect(editor.has(c) || list.has(c), `${c} not in list or editor`).toBe(false)
  })
})
