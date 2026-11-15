// B9-46 (PC-08): the stylesheet contracts of the Away on the Plan. Tokens only; the line is a 44 px target in the info tone, never bold.
import { describe, expect, it } from 'vitest'
import { declarations, ruleBlocks } from '../../ui/test-utils'
import { readFeatureCss, readSource } from './test-css'

const css = readFeatureCss('plan.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('the day tile\'s Away line (.plan-day__away)', () => {
  const d = () => declarations(css, '.plan-day__away')
  it('is in the info text colour, from the token', () => {
    expect(d()['color']).toBe('var(--color-info-fg)')
  })
  it('is a 44 px target and a single line that ends with an ellipsis rather than wrapping its button', () => {
    expect(d()['min-height'] ?? d()['min-block-size'] ?? d()['block-size']).toMatch(/var\(--target-min\)|44px/)
    expect(d()['white-space']).toBe('nowrap')
    expect(d()['text-overflow']).toBe('ellipsis')
    expect(d()['overflow']).toMatch(/hidden|clip/)
  })
  it('is not set bold (no sentence of running text is bold; the type role is weight 500)', () => {
    const w = d()['font-weight']
    expect(w === undefined || Number(w) <= 600 || /var\(--/.test(w)).toBe(true)
  })
})

describe('the slot header\'s "Ben away" / "Everyone is away" label (.plan-slot-head__away)', () => {
  it('is in the info tone and shrinks before the time does (it may be cut with an ellipsis, never wraps the header)', () => {
    const d = declarations(css, '.plan-slot-head__away')
    expect(d['color']).toBe('var(--color-info-fg)')
    expect(d['white-space']).toBe('nowrap')
    expect(d['min-width'] ?? d['min-inline-size']).toBe('0')
  })
})

describe('the Away sheet (.away-sheet)', () => {
  const blocks = ruleBlocks(css)
  it('puts First day and Last day side by side only from 600 px (37.5em); below it each field has its column to itself', () => {
    const when = blocks.filter((b) => b.selectors.some((s) => /\.away-sheet__when\b/.test(s)))
    expect(when.length, 'a .away-sheet__when rule').toBeGreaterThan(0)
    expect(css).toMatch(/@media[^{]*\(min-width:\s*37\.5em\)[^{]*\{[^}]*\.away-sheet__when[^}]*\{[^}]*grid-template-columns/)
  })
  it('keeps the From and Through values on one line', () => {
    const body = blocks.filter((b) => b.selectors.some((s) => /\.away-sheet\b/.test(s))).map((b) => b.body).join(';')
    expect(body).toMatch(/white-space:\s*nowrap/)
  })
  it('uses no raw colour and no raw pixel spacing (tokens only)', () => {
    const body = blocks.filter((b) => b.selectors.some((s) => /\.(away-sheet|plan-day__away|plan-slot-head__away)\b/.test(s))).map((b) => b.body).join(';')
    expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    expect(body).not.toMatch(/(margin|padding|gap)[^;]*\b\d+px/)
  })
})

describe('the words and the parts', () => {
  it('AwaySheet builds its "What changes" with a <details> and DetailRow rows, never a bullet sentence', () => {
    const src = readSource('features/plan/components/AwaySheet.tsx')
    expect(src).toMatch(/<details|Disclosure/)
    expect(src).toMatch(/DetailList|DetailRow/)
    expect(src).not.toMatch(/type="date"/)
    expect(src).not.toMatch(/\balert\(|\bconfirm\(|\bprompt\(/)
  })
  it('the sheet uses the shared DateField (with rangeStart for the last day), never a native date picker', () => {
    const src = readSource('features/plan/components/AwaySheet.tsx')
    expect(src).toContain('DateField')
    expect(src).toContain('rangeStart')
  })
  it('the Away strings are in plan/strings/away.ts, so no component carries its own copy of the words', () => {
    const src = readSource('features/plan/strings/away.ts')
    expect(src.length).toBeGreaterThan(400)
    expect(src).toContain('Someone is away')
    expect(src).toContain('No last day yet')
  })
})
