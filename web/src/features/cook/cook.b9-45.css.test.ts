// B9-45 (PC-02, PC-05) over features/cook/cook.css: the Cooked moment (a 96 px check that pops in, title-1, a column of at most 40 rem from tablet, the
// actions that wrap whole) and the Get ready list (a ticked row is muted and its name struck through). No text breaks mid-word.
import { describe, expect, it } from 'vitest'
import { blocksOf } from '../../ui/lib/cssWalk.test-helper'

const blocks = blocksOf([], ['features/cook/cook.css'])
const decls = (match: (selector: string) => boolean, media?: (atrules: string[]) => boolean): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (!b.selector.split(',').some((s) => match(s.trim()))) continue
    if (media && !media(b.atrules)) continue
    for (const [p, v] of b.decls) out[p] = v
  }
  return out
}
const exact = (sel: string) => (s: string) => s === sel
const plain = (a: string[]) => a.length === 0
const reduced = (a: string[]) => a.some((x) => /prefers-reduced-motion:\s*reduce/.test(x))

describe('the Cooked moment', () => {
  it('draws a 96 px success mark that pops in; with reduced motion it simply appears', () => {
    const mark = decls(exact('.cook-confirmation__mark'), plain)
    expect(['96px', '6rem']).toContain(mark.width)
    expect(['96px', '6rem']).toContain(mark.height)
    expect(mark.animation ?? mark['animation-name']).toBeTruthy()
    expect(mark.animation ?? mark['animation-name']).not.toBe('none')
    const still = decls(exact('.cook-confirmation__mark'), reduced)
    expect(still.animation ?? still['animation-name']).toBe('none')
  })
  it('the title is title-1', () => {
    expect(decls(exact('.cook-confirmation__title'), plain)['font-size']).toBe('var(--text-title-1-size)')
  })
  it('is a centred column of at most 40 rem from tablet', () => {
    const wide = decls(exact('.cook-confirmation'))
    expect(wide['max-width']).toBe('40rem')
    expect(wide['margin-inline'] ?? wide['margin-inline-start']).toBeTruthy()
  })
  it('its actions are whole buttons that wrap rather than cut: flex, wrap, a gap', () => {
    const actions = decls(exact('.cook-confirmation__actions'), plain)
    expect(actions.display).toBe('flex')
    expect(actions['flex-wrap']).toBe('wrap')
    expect(actions.gap).toBeTruthy()
  })
})

describe('Get ready', () => {
  it('a ticked row is muted and its name struck through', () => {
    const ticked = blocks.filter((b) => /data-ticked="true"/.test(b.selector))
    expect(ticked.length).toBeGreaterThan(0)
    const all = Object.fromEntries(ticked.flatMap((b) => b.decls))
    expect(all['text-decoration'] ?? all['text-decoration-line']).toMatch(/line-through/)
  })
  it('has rules of its own (the tile and its meta line)', () => {
    expect(blocks.some((b) => /\.get-ready/.test(b.selector))).toBe(true)
  })
})

describe('no text breaks mid-word', () => {
  it('no rule of the confirmation or Get ready breaks a word', () => {
    for (const b of blocks.filter((x) => /\.cook-confirmation|\.get-ready/.test(x.selector))) {
      const d = Object.fromEntries(b.decls)
      expect(d['overflow-wrap'] ?? '').not.toMatch(/anywhere|break-word/)
      expect(d['word-break'] ?? '').not.toMatch(/break-all|break-word/)
      expect(d.hyphens ?? '').not.toBe('auto')
    }
  })
})
