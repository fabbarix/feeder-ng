// B9-15 (SET-06, docs/design/ui-review-3/settings.md): the stylesheet of the one-line chip strip, the two-line option and the ring room.
// jsdom lays nothing out, so the rules are pinned here and the guard's planning-recipe-select scenario checks them in a browser.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss, ruleBlocks } from '../test-utils'

const css = readUiCss('Select/Select.css')
const blocks = ruleBlocks(css)
const bodyOf = (pred: (selector: string) => boolean) => blocks.filter((b) => b.selectors.some(pred)).map((b) => b.body).join('\n')

describe('Select.css: the chip strip', () => {
  it('is one line that clips its overflow, padded 5 px and pulled back 5 px so rings are not cut', () => {
    const t = declarations(css, '.select__tools')
    expect(t['flex-wrap']).toBe('nowrap')
    expect(t['overflow']).toBe('hidden')
    expect(t['padding']).toBe('5px')
    expect(t['margin']).toBe('-5px')
  })
  it('wraps once "+N" has expanded it', () => {
    expect(declarations(css, ".select__tools[data-expanded='true']")['flex-wrap']).toBe('wrap')
  })
  it('a chip never shrinks and is at most 12 rem wide', () => {
    const c = declarations(css, '.select__tools > .chip')
    expect(c['flex']).toBe('none')
    expect(c['max-inline-size']).toBe('12rem')
  })
  it('the sort button never shrinks', () => {
    expect(declarations(css, '.select__sort')['flex']).toBe('none')
  })
  it('a focused chip or sort button draws its ring inside itself on a soft fill (R-C+)', () => {
    const body = bodyOf((s) => s.includes('.select__tools') && s.includes(':focus-visible'))
    expect(body).toMatch(/outline:\s*2px solid var\(--color-accent\)/)
    expect(body).toMatch(/outline-offset:\s*-2px/)
    expect(body).toMatch(/background:\s*var\(--color-soft\)/)
  })
})

describe('Select.css: options and the list', () => {
  it('an option title wraps to at most two lines at word boundaries', () => {
    const body = bodyOf((s) => s === '.select__label')
    expect(body).toMatch(/white-space:\s*normal/)
    expect(body).toMatch(/-webkit-line-clamp:\s*2/)
    expect(body).not.toMatch(/white-space:\s*nowrap/)
  })
  it('the meta stays one line', () => {
    expect(bodyOf((s) => s === '.select__meta')).toMatch(/white-space:\s*nowrap/)
  })
  it('the trigger value is still one line (only the options wrap)', () => {
    expect(declarations(css, '.select__value')['white-space']).toBe('nowrap')
  })
  it('the list scrolls its active option clear of the edge: scroll-padding-block is a space step', () => {
    expect(declarations(css, '.select__list')['scroll-padding-block']).toBe('var(--space-2)')
  })
  it('an option may grow past 56 px for two lines (min, not fixed, height)', () => {
    const o = declarations(css, '.select__option')
    expect(o['min-block-size']).toBe('56px')
    expect(o['block-size']).toBeUndefined()
  })
})

describe('Select.css: ring room', () => {
  it('the panel keeps 5 px around the search field so its 3 px ring at a 2 px offset shows in full', () => {
    expect(declarations(css, '.select__panel')['padding']).toBe('5px')
  })
})

describe('Select.css: the placeholder (SAFE)', () => {
  it('an empty Select shows its placeholder in the muted colour, at body weight', () => {
    const p = declarations(css, ".select__trigger[data-placeholder] .select__value")
    expect(p['color']).toBe('var(--color-muted)')
    expect(p['font-weight']).toBe('var(--text-body-weight)')
  })
})
