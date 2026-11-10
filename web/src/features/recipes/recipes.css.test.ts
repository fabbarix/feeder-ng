// CSS contract of the Recipes screens (jsdom does not lay out): ui-fix-plan 5.8 (2/3/4 columns, Tag row fade) and 5.9 (hero cap).
import { describe, expect, it } from 'vitest'
import { readSource } from '../plan/test-css'

const css = readSource('features/recipes/recipes.css').replace(/\/\*[\s\S]*?\*\//g, '')

interface Rule {
  selector: string
  body: string
  /** The min-width of the enclosing @media, or 0. */
  minWidth: number
}

/** Flat list of style rules, with the min-width of their @media (one level of nesting is enough here). */
function parse(text: string, minWidth = 0): Rule[] {
  const rules: Rule[] = []
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('{', i)
    if (open < 0) break
    const head = text.slice(i, open).trim()
    let depth = 1
    let j = open + 1
    while (j < text.length && depth > 0) {
      if (text[j] === '{') depth++
      else if (text[j] === '}') depth--
      j++
    }
    const inner = text.slice(open + 1, j - 1)
    if (head.startsWith('@media')) {
      const m = /min-width:\s*(\d+)px/.exec(head)
      rules.push(...parse(inner, m ? Number(m[1]) : minWidth))
    } else if (!head.startsWith('@')) {
      rules.push({ selector: head, body: inner, minWidth })
    }
    i = j
  }
  return rules
}

const rules = parse(css)
const find = (pred: (r: Rule) => boolean) => rules.filter(pred)
const cols = (r: Rule) => /grid-template-columns:\s*repeat\((\d),\s*minmax\(0,\s*1fr\)\)/.exec(r.body)?.[1]

describe('recipes.css', () => {
  it('is readable', () => {
    expect(rules.length).toBeGreaterThan(10)
  })

  describe('the Recipes grid has 2, 3 and 4 columns by width (5.8)', () => {
    // BentoGrid renders data-columns="2"; the screen's own rules widen it.
    const grid = find((r) => /\.recipes-screen\s+\.bento-grid\[data-columns=['"]2['"]\]/.test(r.selector) && cols(r) !== undefined)
    const at = (min: number) => grid.filter((r) => r.minWidth === min).map(cols).at(-1)
    it('keeps 2 columns on a phone (no override below the first breakpoint)', () => {
      expect(grid.filter((r) => r.minWidth === 0)).toEqual([])
    })
    it('uses 3 columns from a tablet width and 4 columns from a desktop width', () => {
      const widths = [...new Set(grid.map((r) => r.minWidth))].sort((a, b) => a - b)
      expect(widths).toHaveLength(2)
      expect(at(widths[0]!)).toBe('3')
      expect(at(widths[1]!)).toBe('4')
      expect(widths[0]).toBeGreaterThanOrEqual(600)
      expect(widths[0]).toBeLessThan(widths[1]!)
      expect(widths[1]).toBeLessThanOrEqual(1100)
    })
  })

  it('caps the detail hero at 170 px on the shared media container (5.9)', () => {
    const box = find((r) => r.selector.includes('.recipe-detail__hero .tile__media'))
    expect(box.length).toBeGreaterThan(0)
    const body = box.map((r) => r.body).join(' ')
    expect(body).toMatch(/aspect-ratio:\s*auto/)
    expect(body).toMatch(/max-(block-size|height):\s*170px/)
    expect(box.some((r) => r.minWidth === 0)).toBe(true)
  })

  it('drops the hero tile bottom padding strip when the tile has only the photo', () => {
    const r = find((x) => x.selector.includes('.recipe-detail__hero') && x.selector.includes(':has(> .tile__media:last-child)'))
    expect(r.some((x) => /padding-block-end:\s*0/.test(x.body))).toBe(true)
  })

  it('lets the hero thumb fill the capped container', () => {
    const thumb = find((r) => r.selector.includes(".recipe-detail__hero .recipe-thumb[data-size='hero']"))
    expect(thumb.some((r) => /(block-size|height):\s*100%/.test(r.body))).toBe(true)
  })

  describe('the Tag row fade (5.8)', () => {
    const base = find((r) => r.selector === '.tag-chips')
    const fadeIn = (r: Rule) => /mask-image:\s*linear-gradient\(to right,\s*transparent\s+0/.test(r.body)
    it('has no fade over the start of the row by default, so "All Tags" stays fully visible', () => {
      expect(base.length).toBeGreaterThan(0)
      for (const r of base) expect(fadeIn(r)).toBe(false)
    })
    it('fades the start only once the row has scrolled', () => {
      const scrolled = find((r) => /^\.tag-chips\[data-scrolled=['"]?true['"]?\]$/.test(r.selector))
      expect(scrolled.some(fadeIn)).toBe(true)
    })
    it('still fades the end of the row, where more Tags are hidden', () => {
      expect(base.some((r) => /mask-image:[^;]*transparent\s+100%/.test(r.body))).toBe(true)
    })
  })
})
