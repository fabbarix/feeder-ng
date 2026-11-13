// ds-plan CSS contract (docs/design/system.md, ADR 0016). jsdom does not lay out, so the redesign is pinned in the stylesheet:
// tokens only (type, colour, gap), one grid track per day, the Meal Slot header that never cuts its name, the one-line chips,
// and the three check-ui rules (type-scale, opacity-muting, word-break) that now FAIL in web/src/features/plan.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss, readSource } from './test-css'

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const files: Record<string, string> = { 'plan.css': readFeatureCss('plan.css'), 'components/usedFrom.css': readFeatureCss('components/usedFrom.css') }
const css = code(files['plan.css']!)
const d = (sel: string) => declarations(css, sel)

describe('check-ui rules hold in the whole Plan folder (they fail here now)', () => {
  it.each(Object.entries(files))('%s: type-scale, font-size and font are a --text-* token only', (name, text) => {
    for (const m of code(text).matchAll(/(?:^|[;{\s])(font-size|font)\s*:\s*([^;}]+)/g)) {
      expect(m[2]!.trim(), `${name}: ${m[1]}`).toMatch(/^var\(--text-[a-z0-9-]+-size\)$|^var\(--text-[a-z0-9-]+\)$/)
    }
  })

  it.each(Object.entries(files))('%s: opacity-muting, no opacity between 0.5 and 0.95 (muted text is --color-muted)', (name, text) => {
    for (const m of code(text).matchAll(/opacity\s*:\s*([0-9.]+)/g)) {
      const v = Number(m[1])
      expect(v < 0.5 || v > 0.95, `${name}: opacity ${m[1]}`).toBe(true)
    }
  })

  it.each(Object.entries(files))('%s: word-break, no hyphens:auto, overflow-wrap anywhere / break-word, word-break break-all / break-word', (_name, text) => {
    expect(code(text)).not.toMatch(/hyphens:\s*auto|overflow-wrap:\s*(anywhere|break-word)|word-break:\s*break-(all|word)/)
  })
})

describe('the week grid: BentoGrid min="day", no column rules of our own', () => {
  it('plan.css has no .plan-grid and no data-columns rule (BentoGrid sizes the tracks)', () => {
    expect(css).not.toMatch(/\.plan-grid/)
    expect(css).not.toMatch(/data-columns/)
  })

  it('the container the columns were measured on is gone (.plan__grid-box)', () => {
    expect(css).not.toMatch(/plan__grid-box/)
  })

  it('a day tile is one track and top-aligned; it never spans', () => {
    const day = d('.plan-day')
    expect(day['min-width']).toBe('0')
    expect(day['align-content']).toBe('start')
    expect(css).not.toMatch(/\.plan-day[^{]*\{[^}]*grid-column\s*:\s*span/)
  })

  it("today is the accent ring and an accent title: no background, no size change", () => {
    const ring = d(".plan-day[data-today='true']")
    expect(ring['box-shadow']).toBe('0 0 0 2px var(--color-accent)')
    expect(ring['background']).toBeUndefined()
    expect(d(".plan-day[data-today='true'] .plan-day__title")['color']).toBe('var(--color-accent-text)')
  })
})

describe('type hierarchy: Day -> Meal Slot -> Course -> Recipe', () => {
  it('the day title is title-3 and wraps at a word (never clipped)', () => {
    const t = d('.plan-day__title')
    expect(t['font-size']).toBe('var(--text-title-3-size)')
    expect(t['line-height']).toBe('var(--text-title-3-line)')
    expect(t['font-weight']).toBe('var(--text-title-3-weight)')
    expect(JSON.stringify(t)).not.toMatch(/overflow|text-overflow|nowrap|hyphens/)
    expect(t['margin']).toBeUndefined()
  })

  it('the slot label is the label role, muted (not opacity)', () => {
    const l = d('.plan-slot-head__label')
    expect(l['font-size']).toBe('var(--text-label-size)')
    expect(l['color']).toBe('var(--color-muted)')
  })

  it('the Course label (meta) is the meta role and the Recipe (list-row title) stays body-strong: the plan sets no title size', () => {
    expect(css).not.toMatch(/\.plan-meal\s+\.list-row__title\s*\{[^}]*font-size/)
  })
})

describe('the Meal Slot header', () => {
  it('is one nowrap row: the label takes the room, the actions group sits at the end and never shrinks', () => {
    const head = d('.plan-slot-head')
    expect(head['display']).toBe('flex')
    expect(head['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(head['align-items']).toBe('center')
    expect(head['justify-content']).toBe('space-between')
    const actions = d('.plan-slot-head__actions')
    expect(actions['display']).toBe('inline-flex')
    expect(actions['flex']).toBe('none')
    expect(actions['gap']).toBe('var(--space-1)')
  })

  it('the slot NAME is never truncated: no ellipsis, no overflow hidden, no nowrap on the label or the name', () => {
    for (const sel of ['.plan-slot-head__label', '.plan-slot-head__name']) {
      const r = d(sel)
      expect(r['text-overflow'], sel).toBeUndefined()
      expect(r['overflow'], sel).toBeUndefined()
      expect(r['white-space'] ?? 'normal', sel).not.toBe('nowrap')
    }
    expect(d('.plan-slot-head__label')['min-width']).toBe('0')
  })

  it('the time is one unit (nowrap) so "19:30" never splits', () => {
    expect(d('.plan-slot-head__time')['white-space']).toBe('nowrap')
  })
})

describe('Course rows and their chips', () => {
  it('the chips are ONE line: flex nowrap, clipped at the row text edge, a token gap', () => {
    const c = d('.plan-row__chips')
    expect(c['display']).toBe('flex')
    expect(c['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(c['overflow']).toBe('hidden')
    expect(c['min-width']).toBe('0')
    expect(c['gap']).toBe('var(--space-1)')
  })

  // ds-plan round 3: round 2 made this `flex: none` + 40 % (every chip became "L…"); the cap (2 + "+N") keeps the line short, so a
  // chip shrinks (flex 0 1 auto, min-inline-size 0) only when the full-width line is really full. See plan.round3.css.test.ts.
  it('a chip in the line is flex 0 1 auto with min-inline-size 0, and never wraps', () => {
    expect(d('.plan-row__chips .chip')['flex']).toBe('0 1 auto')
    expect(d('.plan-row__chips .chip')['min-inline-size']).toBe('0')
  })

  it('Swap and Pin are a non-shrinking icon group at the end of the row', () => {
    const a = d('.plan-row__actions')
    expect(a['display']).toBe('inline-flex')
    expect(a['flex']).toBe('none')
  })

  it('rows are separated by the 1 px line divider inside a tile, with no ad-hoc margins', () => {
    const sep = d('.plan-meal__courses > .list-row + .list-row')
    expect(sep['border-top']).toBe('1px solid var(--color-line)')
    expect(css).not.toMatch(/\.plan-course\b|\.plan-meal__recipe|\.plan-course__caption/)
  })

  it('an empty Course is a dashed row', () => {
    expect(d(".plan-meal .list-row[data-unfilled]")['border']).toMatch(/dashed/)
  })

  it('Cooked and Not cooked rows are quieter by colour, never by opacity', () => {
    for (const st of ['cooked', 'skipped']) {
      const r = d(`.plan-meal .list-row[data-state='${st}'] .list-row__title`)
      expect(r['color']).toBe('var(--color-muted)')
      expect(r['opacity']).toBeUndefined()
    }
  })

  it('the divider between Meal Slots shows only on a tile flagged data-dividers (3 or more slots), as a 1 px --color-line', () => {
    const rules = ruleBlocks(css).filter((b) => b.selectors.some((s) => /\.plan-meal\s*\+\s*\.plan-meal/.test(s)))
    expect(rules.length).toBeGreaterThan(0)
    for (const r of rules) {
      expect(r.selectors.join(',')).toMatch(/\[data-dividers/)
      expect(r.body).toMatch(/border-top:\s*1px solid var\(--color-line\)/)
    }
  })
})

describe('colour roles: no accent-soft on the Plan, no raw colours', () => {
  it('the Plan stylesheets use no --color-soft / --color-soft-strong (accent containers are for filters, monograms, the hero in dark)', () => {
    expect(css).not.toMatch(/--color-soft/)
  })

  it('no colour literals (hex, rgb, hsl): tokens only, so every accent theme and dark mode work', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/)
  })

  it('the chip look stays in Chip.css: a Plan rule that mentions .chip only lays it out in the line (flex, min-width), never paints it', () => {
    for (const b of ruleBlocks(css).filter((r) => r.selectors.some((sel) => /\.chip\b/.test(sel)))) {
      expect(b.body, b.selectors.join(',')).not.toMatch(/background|color|box-shadow|border|font|block-size|white-space|padding|text-overflow/)
    }
    expect(css).not.toMatch(/\.plan-meal \[data-kind\]/)
  })
})

describe('spacing: tokens, not raw px / rem', () => {
  it.each(['.plan-day', '.plan-meal', '.plan-slot-head', '.plan-row__chips', '.plan-row__actions', '.plan-meal__courses'])('%s uses no raw gap / margin / padding length', (sel) => {
    const r = d(sel)
    for (const prop of ['gap', 'margin', 'margin-block', 'padding', 'padding-block', 'padding-top']) {
      if (r[prop] !== undefined) expect(r[prop], `${sel} ${prop}`).toMatch(/^(0|var\(--[a-z0-9-]+\)( var\(--[a-z0-9-]+\))*)$/)
    }
  })

  it('the Plan page ends above the nav: the screen adds no bottom spacing of its own that cancels --nav-clearance', () => {
    const plan = declarations(css, '.plan')
    expect(plan['margin-block-end'] ?? plan['margin-bottom'] ?? '0').toBe('0')
    expect(plan['min-block-size'] ?? plan['min-height'] ?? 'none').toBe('none')
  })
})

describe('source scans (the old week is gone)', () => {
  it('no source in the Plan feature imports the container-columns hook or lib', () => {
    for (const f of ['features/plan/screens/PlanScreen.tsx', 'features/plan/components/PlanGrid.tsx', 'features/plan/components/DayTile.tsx', 'features/plan/components/MealTile.tsx']) {
      const src = readSource(f)
      expect(src, f).not.toMatch(/useContainerColumns|planColumnsForContainer|lib\/columns/)
    }
  })

  it('PlanScreen composes PlanGrid without a column count and the Couldn’t-plan grids use min=, not columns=', () => {
    const src = readSource('features/plan/screens/PlanScreen.tsx')
    expect(src).not.toMatch(/columns=/)
    expect(src).toMatch(/<PlanGrid>/)
    expect(readSource('features/plan/screens/CouldntPlanExclusionsScreen.tsx')).not.toMatch(/columns=/)
  })
})
