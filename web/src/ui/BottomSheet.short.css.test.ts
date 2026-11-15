// B9-14 / SHORT-02 + R-C + DS-01 header: the CSS of the sheet. vitest blanks CSS imports, so the files are read as text.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const mediaBlock = (css: string, query: RegExp): string => {
  const out: string[] = []
  const re = /@media\s*([^{]+)\{/g
  for (let m = re.exec(css); m; m = re.exec(css)) {
    if (!query.test(m[1]!)) continue
    let depth = 1
    let i = re.lastIndex
    while (i < css.length && depth > 0) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0, i++
    out.push(css.slice(re.lastIndex, i - 1))
  }
  return out.join('\n')
}
const rule = (text: string, sel: string): string => text.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

const css = readUiCss('BottomSheet.css')
const short = mediaBlock(css, /max-height:\s*499px/)
const shortWide = mediaBlock(css, /max-height:\s*499px\)\s*and\s*\(min-width:\s*(768px|48em)/)

describe('BottomSheet.css: the body never collapses (rule 3)', () => {
  // Ruling 1 (main session, B9-14 review): the floor applies only to a squeezed body (the panel at its maximum height, the body
  // scrolling), so a one-line sheet has no blank space above its footer.
  it('a squeezed body (data-body="scroll") keeps min(6rem, 30dvh)', () => {
    expect(declarations(css, ".sheet__panel[data-body='scroll'] .sheet__body")['min-block-size']).toBe('min(6rem, 30dvh)')
  })
  it('a body that fits has no floor: a short sheet is as tall as its content', () => {
    expect(declarations(css, '.sheet__body')['min-block-size']).toBeUndefined()
  })
  it("the body's first and last child add no margin (a one-line sheet has no blank space)", () => {
    expect(declarations(css, '.sheet__body > :first-child')['margin-block-start']).toBe('0')
    expect(declarations(css, '.sheet__body > :last-child')['margin-block-end']).toBe('0')
    const dialog = readUiCss('Dialog.css')
    expect(declarations(dialog, '.dialog__body > :first-child')['margin-block-start']).toBe('0')
    expect(declarations(dialog, '.dialog__body > :last-child')['margin-block-end']).toBe('0')
  })
  it('header and footer never shrink', () => {
    expect(declarations(css, '.sheet__header')['flex'] ?? declarations(css, '.sheet__header, .sheet__footer')['flex']).toBe('none')
    expect(declarations(css, '.sheet__footer')['flex'] ?? declarations(css, '.sheet__header, .sheet__footer')['flex']).toBe('none')
  })
  it('a status chip in the body keeps its natural width', () => {
    const body = rule(css, '.sheet__body .chip')
    expect(body).toMatch(/inline-size:\s*max-content/)
    expect(body).toMatch(/justify-self:\s*start/)
  })
  it('the footer row is a single flex row sharing the width with FormActions', () => {
    expect(rule(css, '.sheet__footer > .form-actions')).toMatch(/flex:\s*1 1 auto/)
  })
})

describe('BottomSheet.css: short viewports (rule 4)', () => {
  it('the panel takes the viewport height minus 8 px and the top inset', () => {
    expect(rule(short, '.sheet, .sheet__panel')).toMatch(/max-height:\s*calc\(100dvh - var\(--space-2\) - var\(--safe-top\)\)/)
  })
  it('no grip, a title-3 title centred on the Close, 8 px footer top padding, side insets in the panel padding', () => {
    expect(rule(short, '.sheet__grip')).toMatch(/display:\s*none/)
    const title = rule(short, '.sheet__title')
    expect(title).toMatch(/var\(--text-title-3-size\)/)
    expect(title).toMatch(/var\(--text-title-3-line\)/)
    expect(title).toMatch(/padding-block-start:\s*calc\(\(var\(--space-10\) - var\(--text-title-3-line\)\) \/ 2\)/)
    expect(rule(short, '.sheet__footer')).toMatch(/padding-block-start:\s*var\(--space-2\)/)
    expect(rule(short, '.sheet__panel')).toMatch(/var\(--safe-left\)/)
    expect(rule(short, '.sheet__panel')).toMatch(/var\(--safe-right\)/)
  })
  it('from 768 px wide a short sheet is the centred dialog, min(640px, 100vw - 48px)', () => {
    expect(rule(shortWide, '.sheet')).toMatch(/inline-size:\s*min\(640px,\s*100vw - 48px\)/)
  })
})

describe('BottomSheet.css: the flow fallback (rule 5)', () => {
  it('data-footer="flow": the panel scrolls, the body is not a scroller, the footer follows the body', () => {
    expect(rule(css, ".sheet__panel[data-footer='flow']")).toMatch(/overflow-y:\s*auto/)
    expect(rule(css, ".sheet__panel[data-footer='flow'] .sheet__body")).toMatch(/overflow:\s*visible/)
    expect(rule(css, ".sheet__panel[data-footer='flow'] .sheet__footer")).toMatch(/position:\s*static/)
  })
})

describe('BottomSheet.css: ring room and DS-01 header', () => {
  it('body padding and scroll-padding are the 5 px of ring room on the block axis (R-C)', () => {
    const d = declarations(css, '.sheet__body')
    expect(d['padding-block']).toBe('calc(var(--focus-ring-width) + var(--focus-ring-offset))')
    expect(d['scroll-padding-block']).toBe('calc(var(--focus-ring-width) + var(--focus-ring-offset))')
  })
  it('a sticky footer bounds the scroll: scroll-padding-block-end counts the footer', () => {
    expect(css).toMatch(/scroll-padding-block-end/)
  })
  it('the title is start-aligned and may shrink, so the Close is never squeezed beside a long title', () => {
    const d = declarations(css, '.sheet__title')
    expect(d['min-inline-size']).toBe('0')
    expect(d['text-align']).toBe('start')
  })
  it('the sheet resets what a trigger row inherits: pointer-events auto, text-align start', () => {
    const d = declarations(css, '.sheet')
    expect(d['pointer-events']).toBe('auto')
    expect(d['text-align']).toBe('start')
  })
})

describe('FilterBar.css (SHORT-07)', () => {
  const fb = readUiCss('FilterBar/FilterBar.css')
  it('inside a sheet on a short viewport the Storage Place list drops its own cap: one scroll container', () => {
    const shortBlock = mediaBlock(fb, /max-height:\s*(499|599)px\)\s*$/)
    expect(shortBlock).toMatch(/\.sheet \.filter-panel__list \[role=['"]listbox['"]\][^{]*\{[^}]*max-block-size:\s*none[^}]*overflow:\s*visible/)
  })
  it('from 768 px on a short viewport the Filters body is two columns: the chip sections left, the list right', () => {
    const wideShort = mediaBlock(fb, /max-height:\s*(499|599)px\)\s*and\s*\(min-width:\s*(768px|48em)/)
    expect(wideShort).toMatch(/\.sheet \.filter-panel__body\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:/)
    expect(wideShort).toMatch(/\.filter-panel__section:has\(\.filter-panel__list\)\s*\{[^}]*grid-column:\s*2/)
  })
})
