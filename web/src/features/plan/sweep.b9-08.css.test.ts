// B9-08 (sweep-plan-cook): the W1 sweep of the CSS in features/{plan,cook,today,board,notifications,access,signin}.
// jsdom does not lay out, so the contract is the stylesheet text: one ring, em breakpoints, tokens for radius / spacing /
// opacity / type, no size-only class (the DS-07 body role drift of B9-DRIFT-W1.md), and the TB-05 / DS-05 cures.
// These scans are the unit-test mirror of the check-ui rules focus-ring, media-width, raw-radius, raw-spacing,
// opacity-muting and type-scale (B9-07 defines the rules, this package flips its folders to fail), so the folders stay clean
// even where the shell rule files are not yet read.
//
// Relies on (written by B9-07, not imported here): web/src/ui/lib/breakpoints.ts exporting `useBreakpoint(name)` with the
// DS-09 table { tablet: 37.5, md: 48, desktop: 64, desktopWide: 80, wide: 90 } (em) and `NARROW = 23.5` (below 376 px, amendment A1).
import { describe, expect, it } from 'vitest'
import { readSource } from './test-css'

const nodeFs = 'node:fs'
const { readdirSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory: () => boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/

const FOLDERS = ['plan', 'cook', 'today', 'board', 'notifications', 'access', 'signin']
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = `${dir}/${n}`
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
/** feature-relative path -> CSS text without comments, for every .css file of the seven folders. */
const FILES: Record<string, string> = {}
for (const f of FOLDERS) {
  for (const p of walk(`${cwd}/src/features/${f}`).filter((x) => x.endsWith('.css')).sort()) {
    const rel = p.slice(`${cwd}/src/features/`.length)
    FILES[rel] = readSource(`features/${rel}`).replace(/\/\*[\s\S]*?\*\//g, '')
  }
}
const entries = Object.entries(FILES)

// ---- a small CSS reader: flat list of style rules with their at-rule context --------------------------------------------
type Rule = { file: string; selectors: string[]; decls: [string, string][]; at: string[] }
function parse(file: string, text: string): Rule[] {
  const out: Rule[] = []
  const walkBlock = (src: string, at: string[]) => {
    let i = 0
    while (i < src.length) {
      const open = src.indexOf('{', i)
      if (open < 0) break
      const prelude = src.slice(i, open).trim()
      let depth = 1
      let j = open + 1
      while (j < src.length && depth > 0) depth += src[j] === '{' ? 1 : src[j] === '}' ? -1 : 0, j++
      const body = src.slice(open + 1, j - 1)
      if (prelude.startsWith('@')) {
        if (!prelude.startsWith('@keyframes') && !prelude.startsWith('@font-face')) walkBlock(body, [...at, prelude.replace(/\s+/g, ' ')])
      } else {
        const decls = body
          .split(';')
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d): [string, string] => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim().replace(/\s+/g, ' ')])
          .filter(([p]) => p)
        out.push({ file, selectors: prelude.split(',').map((s) => s.trim().replace(/"/g, "'").replace(/\s+/g, ' ')), decls, at })
      }
      i = j
    }
  }
  walkBlock(text, [])
  return out
}
const RULES: Rule[] = entries.flatMap(([f, t]) => parse(f, t))
const where = (r: Rule, extra = '') => `${r.file}: ${r.selectors.join(', ')}${r.at.length ? ` in ${r.at.join(' ')}` : ''}${extra}`
const isCustomProp = (p: string) => p.startsWith('--')

it('the seven folders are scanned (a guard against an empty glob)', () => {
  expect(entries.length).toBeGreaterThanOrEqual(10)
  for (const f of FOLDERS) expect(entries.some(([p]) => p.startsWith(`${f}/`)), f).toBe(true)
})

// ---- A11Y-02: one focus ring --------------------------------------------------------------------------------------------
describe('A11Y-02: no feature-local focus ring (the global ring and the --focus-ring-* tokens draw it)', () => {
  it('the old --focus-ring box-shadow token is not referenced', () => {
    for (const [f, t] of entries) expect(t, f).not.toMatch(/var\(--focus-ring\)/)
  })

  it('a :focus / :focus-visible rule never draws a box-shadow ring', () => {
    for (const r of RULES.filter((x) => x.selectors.some((s) => /:focus/.test(s)))) {
      expect(r.decls.map((d) => d[0]), where(r)).not.toContain('box-shadow')
    }
  })

  it('a :focus / :focus-visible rule that draws an outline uses the ring tokens only (no raw colour, width or offset)', () => {
    for (const r of RULES.filter((x) => x.selectors.some((s) => /:focus/.test(s)))) {
      for (const [p, v] of r.decls) {
        if (p === 'outline') expect(v, where(r)).toMatch(/^(none|var\(--focus-ring-(inner-)?width\) solid var\(--focus-ring-color\))$/)
        if (p === 'outline-offset') expect(v, where(r)).toMatch(/^(0|var\(--focus-ring-offset(-inset)?\)|calc\(-1 \* var\(--focus-ring-(inner-)?width\)\))$/)
        if (p === 'outline-color') expect(v, where(r)).toBe('var(--focus-ring-color)')
        if (p === 'outline-width') expect(v, where(r)).toMatch(/^var\(--focus-ring-(inner-)?width\)$/)
      }
    }
  })
})

// ---- DS-09: em breakpoints, rem container queries ----------------------------------------------------------------------------
const TABLE_EM = [23.5, 37.5, 48, 64, 80, 90]
describe('DS-09: media queries on width are (min-width: Xem) or (width < Xem) with X from the table', () => {
  it('no @media in the seven folders uses a px width, a max-width or a value outside the table', () => {
    for (const r of RULES) {
      for (const a of r.at.filter((x) => x.startsWith('@media'))) {
        for (const m of a.matchAll(/\(([^()]*width[^()]*)\)/g)) {
          const cond = m[1]!.trim()
          const hit = /^min-width:\s*([0-9.]+)em$/.exec(cond) ?? /^width\s*<\s*([0-9.]+)em$/.exec(cond)
          expect(hit, `${where(r)}: (${cond}) is not (min-width: Xem) or (width < Xem)`).not.toBeNull()
          expect(TABLE_EM, `${where(r)}: ${hit![1]}em is not in the table`).toContain(Number(hit![1]))
        }
      }
    }
  })

  it('container queries state their widths in rem, never px', () => {
    for (const r of RULES) for (const a of r.at.filter((x) => x.startsWith('@container'))) expect(a, where(r)).not.toMatch(/\d\s*px/)
  })

  it.each([
    // access/access.css is no longer listed: SET-12 (B9-52) removed its phone block; the request rows use ListRow's actions slot.
    ['board/board.css', '(min-width: 37.5em)', /\(min-width:\s*600px\)/],
    // today/today.css is no longer listed: TB-06 (B9-53) replaced the R13 setup block that held the query; the tile lays out by container.
    ['cook/cook.css', '(min-width: 48em)', /\(min-width:\s*768px\)/],
  ])('%s: the old px query is converted to %s', (file, wanted, old) => {
    const text = FILES[file] ?? ''
    expect(text).not.toMatch(old)
    expect(text).toContain(`@media ${wanted}`)
  })

  it('plan.css: the hero actions use a named container query (@container plan-hero (min-width: 35rem), TB-03), not @media 820px', () => {
    expect(FILES['plan/plan.css']).not.toMatch(/820px/)
    expect(FILES['plan/plan.css']).toMatch(/@container plan-hero \(min-width: 35rem\)/)
    // the hero is that named size container (the unnamed `container-type` alone cannot be addressed by name)
    const hero = RULES.filter((r) => r.selectors.includes('.plan-hero') && r.file === 'plan/components/TonightHero.css')
    const decl = hero.flatMap((r) => r.decls).find(([p]) => p === 'container')
    expect(decl?.[1]).toBe('plan-hero / inline-size')
  })
})

describe('DS-09: the useMediaQuery callers use useBreakpoint', () => {
  const callers: [string, string][] = [
    ['features/board/screens/BoardScreen.tsx', "useBreakpoint('tablet')"],
    // B9-40 (decision SHORT 3): the tap zones are on at every width, so the Cook screens no longer read a breakpoint;
    // the strip / rail switch lives in this hook (the short-landscape one is below).
    ['features/cook/hooks/useCookTimerPanel.ts', "useBreakpoint('desktop')"],
  ]
  it('features/cook/hooks/useShortLandscape.ts takes its width edge from useBreakpoint and the breakpoint table; only the height is a raw query', () => {
    const src = readSource('features/cook/hooks/useShortLandscape.ts')
    expect(src).toContain("useBreakpoint('md')")
    expect(src).not.toMatch(/\((min|max)-width:\s*\d+px\)/)
    expect(src).toMatch(/SHORT_LANDSCAPE_QUERY = '\(max-height: \d+px\) and \(min-width: 37\.5em\)'/)
  })
  it.each(['features/cook/screens/CookScreen.tsx', 'features/cook/screens/TimelineCookScreen.tsx'])('%s has no useMediaQuery and no px media query', (file) => {
    const src = readSource(file)
    expect(src).not.toMatch(/useMediaQuery\(/)
    expect(src).not.toMatch(/\((min|max)-width:\s*\d+px\)/)
  })
  it.each(callers)('%s calls %s and no px media query', (file, call) => {
    const src = readSource(file)
    expect(src).toContain(call)
    expect(src).not.toMatch(/useMediaQuery\(/)
    expect(src).not.toMatch(/\((min|max)-width:\s*\d+px\)/)
    expect(src).toMatch(/useBreakpoint[^\n]*from '(\.\.\/)+ui(\/lib\/breakpoints)?'/)
  })

  it('cook/hooks/useDevice.ts no longer exports its own useMediaQuery (the ui/lib hook is the one)', () => {
    expect(readSource('features/cook/hooks/useDevice.ts')).not.toMatch(/export function useMediaQuery/)
  })

  it('no file of the seven folders passes a px width to matchMedia / useMediaQuery', () => {
    for (const f of FOLDERS) {
      for (const p of walk(`${cwd}/src/features/${f}`).filter((x) => /\.tsx?$/.test(x) && !/\.test\./.test(x))) {
        const src = readSource(`features/${p.slice(`${cwd}/src/features/`.length)}`)
        expect(src, p).not.toMatch(/(matchMedia|useMediaQuery)\(\s*['"`]\((min|max)-width:\s*\d+px/)
      }
    }
  })
})

// ---- raw values -----------------------------------------------------------------------------------------------------------
describe('raw-radius: every radius is a --radius-* token', () => {
  it('border-radius and its corners hold var(--radius-*) (0, inherit and 50 % excepted)', () => {
    for (const r of RULES) {
      for (const [p, v] of r.decls) {
        if (!/^border(-(start|end)-(start|end))?(-(top|bottom)-(left|right))?-radius$/.test(p)) continue
        for (const part of v.split(/\s+/)) expect(part, where(r, `: ${p}: ${v}`)).toMatch(/^(0|inherit|50%|var\(--radius-[a-z-]+\))$/)
      }
    }
  })
})

describe('raw-spacing: padding, margin and gap use --space-* where a token of that size exists', () => {
  // Sizes with no token (6px, 10px, ...) are not forced: a package may not invent a token for them.
  const TOKEN_PX = new Set([2, 4, 8, 12, 16, 20, 24, 32, 40, 56])
  it('no padding / margin / gap holds a px literal that equals a spacing token', () => {
    for (const r of RULES) {
      for (const [p, v] of r.decls) {
        if (isCustomProp(p) || !/^(padding|margin|gap|row-gap|column-gap)(-|$)/.test(p)) continue
        const bare = v.replace(/var\([^)]*\)/g, ' ')
        for (const m of bare.matchAll(/(-?[0-9.]+)px/g)) {
          expect(TOKEN_PX.has(Math.abs(Number(m[1]))), where(r, `: ${p}: ${v} has ${m[0]}, use var(--space-*)`)).toBe(false)
        }
      }
    }
  })
})

describe('opacity-muting: no opacity between 0.5 and 0.95 (muted text is --color-muted; only disabled states fade)', () => {
  it('holds in every file', () => {
    for (const r of RULES) {
      for (const [p, v] of r.decls) {
        if (p !== 'opacity' || r.selectors.every((s) => /:disabled|\[disabled|aria-disabled|data-disabled/.test(s))) continue
        const n = v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v)
        expect(n < 0.5 || n > 0.95, where(r, `: opacity ${v}`)).toBe(true)
      }
    }
  })
})

describe('type-scale: font-size is a --text-* token', () => {
  // Design choice pinned here: the Kitchen board and Cook Mode set wall / kitchen-scale display type that has no --text-* role
  // (22cqi clocks, 3.5rem timers). Their redesign (TB-07, the cook packages) owns the display tokens, so those two files keep their
  // literal sizes for now; every other file of the seven folders is token-only.
  const WALL = new Set(['board/board.css', 'cook/cook.css'])
  it('plan, today, notifications, access and signin have no raw font-size', () => {
    for (const r of RULES.filter((x) => !WALL.has(x.file))) {
      for (const [p, v] of r.decls) {
        if (isCustomProp(p) || (p !== 'font-size' && p !== 'font')) continue
        expect(v, where(r, `: ${p}: ${v}`)).toMatch(/^(inherit|var\(--text-[a-z0-9-]+(-size)?\)|var\(--text-[a-z0-9-]+\)[^;]*)$/)
      }
    }
  })
})

// ---- DS-07 drift: no class sets a size without its line and weight -----------------------------------------------------------
describe('DS-07 drift (B9-DRIFT-W1): a class that sets a font size also sets its line-height', () => {
  const styles = readSource('styles.css')
  const hasLine = (role: string) => new RegExp(`--text-${role}-line:`).test(styles)
  // merge by selector within a file, across plain and @media rules, so a size in one block and its line in another count together
  const merged = new Map<string, { file: string; selector: string; d: Record<string, string> }>()
  for (const r of RULES) {
    for (const s of r.selectors) {
      const key = `${r.file}\u0000${s}`
      const m = merged.get(key) ?? { file: r.file, selector: s, d: {} }
      for (const [p, v] of r.decls) m.d[p] = v
      merged.set(key, m)
    }
  }
  const sized = [...merged.values()].filter((m) => ('font-size' in m.d && !isCustomProp('font-size') && m.d['font-size'] !== 'inherit') && !/^:root|^html/.test(m.selector))

  it('the scan finds the size-setting classes (a guard against a parser that sees nothing)', () => {
    expect(sized.length).toBeGreaterThan(20)
  })

  it('every such class has a line-height; a --text-X-size class takes a --text-*-line token', () => {
    const bad: string[] = []
    for (const m of sized) {
      const size = m.d['font-size']!
      const line = m.d['line-height'] ?? (m.d['font']?.includes('/') ? 'shorthand' : undefined)
      const role = /^var\(--text-([a-z0-9-]+)-size\)$/.exec(size)?.[1]
      if (!line) bad.push(`${m.file}: ${m.selector} sets font-size ${size} with no line-height`)
      else if (role && hasLine(role) && !/^var\(--text-[a-z0-9-]+-line\)$/.test(line)) bad.push(`${m.file}: ${m.selector} has ${size} but line-height ${line}, not a --text-*-line token`)
    }
    expect(bad).toEqual([])
  })

  // The listed cases of B9-DRIFT-W1.md (items 1-4 and 10), each by name, so a regression names the class.
  it.each([
    ['plan/components/TonightHero.css', '.to-confirm__when', 'var(--text-meta-line)'],
  ])('%s %s has line-height %s (B9-DRIFT-W1 items 1 and 2: the badge is 52 px tall, the count pill 30 px, on the body line)', (file, selector, line) => {
    const d = merged.get(`${file}\u0000${selector}`)?.d
    expect(d, `no rule for ${selector}`).toBeDefined()
    expect(d!['line-height']).toBe(line)
  })

  it('.to-confirm__title, .to-confirm__meta and .to-confirm__row take a --text-*-line token (B9-DRIFT-W1 item 3: rows grew 4 to 15 px)', () => {
    for (const sel of ['.to-confirm__title', '.to-confirm__meta']) {
      const d = merged.get(`plan/components/TonightHero.css\u0000${sel}`)?.d
      expect(d?.['line-height'], sel).toMatch(/^var\(--text-[a-z0-9-]+-line\)$/)
    }
  })

  it('.to-confirm__row carries a line-height wherever it sets a size', () => {
    const d = merged.get('plan/components/TonightHero.css\u0000.to-confirm__row')?.d
    if (d?.['font-size']) expect(d['line-height']).toBeDefined()
  })

  // Item 10: li.today__row sets only its weight, so it silently took the body size (16 -> 15 px, box 19 -> 22 px). Pinned choice:
  // the row names its role (the body role, which is what it renders at now) instead of inheriting it by accident.
  it('li.today__row names its type role: --text-body-size with --text-body-line', () => {
    const d = merged.get('today/today.css\u0000.today__row')?.d
    expect(d?.['font-size']).toBe('var(--text-body-size)')
    expect(d?.['line-height']).toBe('var(--text-body-line)')
  })

  it('the hero name has its title line (h2.plan-hero__name is 22/28 px on a 22 px line)', () => {
    const d = [...merged.values()].filter((m) => m.selector.endsWith('.plan-hero__name')).map((m) => m.d)
    expect(d.length).toBeGreaterThan(0)
    expect(d.some((x) => /^var\(--text-title-[123]-line\)$/.test(x['line-height'] ?? ''))).toBe(true)
  })
})

// ---- TB-05 and DS-05 -------------------------------------------------------------------------------------------------------
describe('TB-05: the hero follows the app scheme through ui/Tile, not through its own dark blocks', () => {
  it('no CSS file of the seven folders mentions data-theme (nothing sets it)', () => {
    for (const [f, t] of entries) expect(t, f).not.toMatch(/data-theme/)
  })

  it('TonightHero.css has no prefers-color-scheme block and no --focus-ring-color of its own (ui/Tile owns the hero ring)', () => {
    const t = FILES['plan/components/TonightHero.css']!
    expect(t).not.toMatch(/prefers-color-scheme/)
    expect(t).not.toMatch(/--focus-ring-color/)
  })

  it('the hero Course caption is the hero text colour at 85 %, one rule, no per-scheme override', () => {
    const rs = RULES.filter((r) => r.selectors.some((s) => s.includes('.plan-hero .plan-course__caption')))
    expect(rs.length).toBe(1)
    expect(rs[0]!.decls.find(([p]) => p === 'color')?.[1]).toBe('color-mix(in srgb, currentColor 85%, transparent)')
  })

  it('the board: .board-tonight redefines no --color-muted, and a Cooked row is not faded with opacity', () => {
    const board = FILES['board/board.css']!
    expect(board).not.toMatch(/\.board-tonight\s*\{[^}]*--color-muted/)
    expect(board).not.toMatch(/\.board-tonight__course\[data-state='cooked'\]\s*\{[^}]*opacity/)
    expect(board).not.toMatch(/\.board-tonight\s*\{[^}]*--color-muted/)
  })
})

describe('DS-05: the Plan stylesheet keeps the Leftovers row-height block and nothing else of the override', () => {
  const plan = FILES['plan/plan.css']!
  it('keeps .plan-leftovers .list-row[data-height] (auto height, min --row-min)', () => {
    expect(plan).toMatch(/\.plan-leftovers \.list-row\[data-height\]\s*\{[^}]*block-size:\s*auto/)
  })
  it('has no overflow: visible on a ListRow title, and no .plan-leftovers title or meta rule', () => {
    expect(plan).not.toMatch(/\.plan-leftovers\s+\.list-row__(title|meta)/)
    for (const r of RULES.filter((x) => x.selectors.some((s) => s.includes('list-row__title')))) {
      expect(r.decls.find(([p]) => p === 'overflow')?.[1], where(r)).not.toBe('visible')
    }
  })
})
