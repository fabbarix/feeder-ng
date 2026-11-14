// B9-07 (DS-09, ADR 0027): one breakpoint table, in em, over EVERY stylesheet and caller of web/src/ui, web/src/app and styles.css.
//   - a width media query is `(min-width: Xem)` or `(width < Xem)` with X in the table {23.5, 37.5, 48, 64, 80, 90}; never px, never
//     max-width. Other features of a query (pointer, hover, orientation, prefers-*, forced-colors, height) are not this rule's;
//   - a container query's width is in rem (the component's own fit, DS-09 "component-fit thresholds");
//   - styles.css steps --row-value-min at (width < 37.5em) (was max-width: 599px) and keeps the gutter step at 80em;
//   - the rail replaces the bottom bar at (min-width: 64em) and expands at (min-width: 90em) (the 1024 px handover seam);
//   - nothing in ui/ or app/ outside ui/lib calls useMediaQuery with a width: Menu, Select and Popover call useBreakpoint('md').
// The check-ui rule `media-width` (scripts/check-ui.d/media-width.sh) holds the same line for the whole tree, per folder.
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS } from './lib/breakpoints'
import { blocksOf, readSrc, sourceFiles } from './lib/cssWalk.test-helper'

const all = blocksOf(['ui', 'app'], ['styles.css'])
const preludes = [...new Set(all.flatMap((b) => b.atrules.map((a) => `${b.file} ${a}`)))].sort()
const TABLE = [23.5, 37.5, 48, 64, 80, 90]

const widthConditions = (prelude: string) => [...prelude.matchAll(/\(\s*((?:min-|max-)?width)\s*(:|<=|>=|<|>)?\s*([^)]*)\)/g)].map((m) => ({ kind: m[1]!, op: m[2] ?? '', value: m[3]!.trim() }))

describe('every width media query is in the table (DS-09)', () => {
  const media = preludes.filter((p) => /@media/.test(p))

  it('the table is the breakpoints module: 37.5, 48, 64, 80, 90 em and the narrow band at 23.5', () => {
    expect([...Object.values(BREAKPOINTS)]).toEqual(TABLE.slice(1))
  })

  it('no @media uses max-width, and no width is in px', () => {
    const bad = media.filter((p) => widthConditions(p).some((c) => c.kind === 'max-width' || /px/.test(c.value)))
    expect(bad).toEqual([])
  })

  it('every @media width condition is (min-width: Xem) or (width < Xem) with X in the table', () => {
    const bad = media.flatMap((p) => widthConditions(p).filter((c) => !((c.kind === 'min-width' && c.op === ':') || (c.kind === 'width' && c.op === '<')) || !TABLE.includes(Number(c.value.replace(/em$/, ''))) || !/em$/.test(c.value)).map((c) => `${p}: ${c.kind} ${c.op} ${c.value}`))
    expect(bad).toEqual([])
  })

  it('every @container width is in rem (a component-fit threshold), never px', () => {
    const bad = preludes.filter((p) => /@container/.test(p) && /px/.test(p))
    expect(bad).toEqual([])
  })
})

describe('the steps that follow the table', () => {
  const styles = blocksOf([], ['styles.css'])
  const under = (cond: string) => styles.filter((b) => b.atrules.includes(`@media ${cond}`))
  const decl = (blocks: typeof styles, prop: string) => blocks.flatMap((b) => b.decls).find(([p]) => p === prop)?.[1]

  it('--row-value-min takes the phone value below 37.5em (was max-width: 599px)', () => {
    expect(decl(under('(width < 37.5em)'), '--row-value-min')).toBe('var(--row-value-narrow)')
  })

  it('the gutter, bento gap and tile padding step at md (48em) and at 80em, not at 1200px', () => {
    expect(decl(under('(min-width: 48em)'), '--gutter')).toBe('24px')
    expect(decl(under('(min-width: 80em)'), '--gutter')).toBe('32px')
    expect(styles.some((b) => b.atrules.some((a) => /1200px/.test(a)))).toBe(false)
  })

  it('the rail replaces the bottom bar at (min-width: 64em) and expands at (min-width: 90em)', () => {
    const shell = blocksOf([], ['app/shell.css'])
    const at = (cond: string) => shell.filter((b) => b.atrules.includes(`@media ${cond}`))
    expect(at('(min-width: 64em)').some((b) => /\.bottom-bar/.test(b.selector) && b.decls.some(([p, v]) => p === 'display' && v === 'none'))).toBe(true)
    expect(at('(min-width: 64em)').flatMap((b) => b.decls).some(([p, v]) => p === '--nav-clearance' && v === '0')).toBe(true)
    expect(at('(min-width: 90em)').length).toBeGreaterThan(0)
  })
})

describe('no width query is called from ui/ or app/ outside ui/lib', () => {
  const callers = [...sourceFiles('ui'), ...sourceFiles('app')].filter((f) => !f.startsWith('ui/lib/'))

  it('no useMediaQuery(...) call has a width condition (use useBreakpoint / useNarrow)', () => {
    const bad = callers.flatMap((f) => (readSrc(f).match(/useMediaQuery\(\s*[`'"][^)]*width[^)]*\)/g) ?? []).map((m) => `${f}: ${m}`))
    expect(bad).toEqual([])
  })

  it.each(['ui/Menu/Menu.tsx', 'ui/Select/Select.tsx', 'ui/Popover/Popover.tsx'])("%s decides popover or sheet with useBreakpoint('md')", (f) => {
    const src = readSrc(f)
    expect(src).toMatch(/useBreakpoint\('md'\)/)
    expect(src).not.toMatch(/useMediaQuery/)
  })

  it('no ui/ or app/ source holds a px width literal in a matchMedia or media-query string', () => {
    const bad = callers.flatMap((f) => (readSrc(f).match(/\((min|max)-width:\s*\d+(\.\d+)?px\)/g) ?? []).map((m) => `${f}: ${m}`))
    expect(bad).toEqual([])
  })
})
