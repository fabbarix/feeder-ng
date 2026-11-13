// CSS contract of the Recipes screens (jsdom does not lay out): ui-fix-plan 5.8 (2/3/4 columns, Tag row fade); the hero is 16:9 since R2-1 (D-02). The R2-1 layout contract is recipes.layout.css.test.ts.
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

describe('recipes.css', () => {
  it('is readable', () => {
    expect(rules.length).toBeGreaterThan(10)
  })

  describe('the Recipes grid is a BentoGrid min="card" (DS-A, ADR 0016; replaces the 2/3/4 columns of 5.8)', () => {
    // The column count comes from the minimum tile width; the Recipes list gets its own redesign later in the rollout.
    it('has no column-count overrides of the grid', () => {
      expect(find((r) => /\.recipes-screen\s+\.bento-grid/.test(r.selector) && /grid-template-columns/.test(r.body))).toEqual([])
      expect(css).not.toMatch(/\.bento-grid\[data-columns/)
    })
  })

  it('keeps the detail hero on the shared media container at 16:9 (R2-1 D-02; the 170 px strip of 5.9 is gone)', () => {
    const box = find((r) => r.selector.includes('.recipe-detail__hero .tile__media'))
    expect(box.length).toBeGreaterThan(0)
    const body = box.map((r) => r.body).join(' ')
    expect(body).toMatch(/aspect-ratio:\s*16\s*\/\s*9/)
    expect(body).not.toMatch(/max-(block-size|height):\s*170px/)
    expect(box.some((r) => r.minWidth === 0)).toBe(true)
  })

  it('drops the hero tile bottom padding strip when the tile has only the photo', () => {
    const r = find((x) => x.selector.includes('.recipe-detail__hero') && x.selector.includes(':has(> .tile__media:last-child)'))
    expect(r.some((x) => /padding-block-end:\s*0/.test(x.body))).toBe(true)
  })

  it('lets the hero thumb fill the 16:9 container', () => {
    const thumb = find((r) => r.selector.includes(".recipe-detail__hero .recipe-thumb[data-size='hero']"))
    expect(thumb.some((r) => /(block-size|height):\s*100%/.test(r.body))).toBe(true)
    expect(thumb.some((r) => /max-block-size:\s*170px/.test(r.body))).toBe(false)
  })

})

describe('recipes.css, Step photo (IM2 review)', () => {
  const photo = find((r) => r.selector.includes('.step-card__photo'))
  it('does not cap the Step photo picker: no width on .step-card__photo or its child, and the picker is not shrunk to its content', () => {
    expect(photo.length).toBeGreaterThan(0)
    for (const r of photo) {
      expect(r.selector, r.selector).not.toMatch(/>\s*:first-child/)
      expect(r.body, r.selector).not.toMatch(/(^|[;\s])(inline-size|width|max-inline-size|max-width)\s*:/)
      expect(r.body, r.selector).not.toMatch(/justify-items:\s*start/)
    }
  })
  it('declares .step-card__error in one rule only', () => {
    expect(find((r) => r.selector.split(',').some((s) => s.trim() === '.step-card__error'))).toHaveLength(1)
  })
})
