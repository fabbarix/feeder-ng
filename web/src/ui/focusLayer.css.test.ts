// B9-07 (A11Y-02, A11Y-03 and TB-05 in ui/ and app/): ONE focus ring. docs/design/ui-review-3/a11y.md A11Y-02 is the text; this file
// states it over EVERY stylesheet of web/src/ui, web/src/app and styles.css (not a list), so a ring that is added later is held to it:
//   - an outline, never a box-shadow; every :focus-visible outline is the width token in --focus-ring-color at a token offset;
//   - the global rule is `:where(:focus-visible)` (zero specificity), and the old box-shadow --focus-ring token is gone;
//   - a field frame rings while its text entry has focus (not on :focus-within), so a nested button never fuses with it;
//   - a control nested in a frame or a [data-focus-scope] rings INSIDE itself (2 px, negative offset, soft fill);
//   - a Segmented rings its track, a full-bleed target rings inside its edge, a hero and a toast set the ring colour;
//   - sheet and dialog bodies keep 5 px (width + offset) of ring room;
//   - the hero's dark rule lives in ui/Tile and keys on data-scheme (A11Y-03, TB-05); no data-theme, no prefers-color-scheme outside styles.css.
// BDD scenarios of the chapter, covered here (the bdd/ suite has no browser): see the tests named after them.
import { describe, expect, it } from 'vitest'
import { blocksOf, isTokenBlock, lastCompound, selectorList, type CssBlock } from './lib/cssWalk.test-helper'

const all = blocksOf(['ui', 'app'], ['styles.css'])
const uiApp = all.filter((b) => b.file !== 'styles.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
/** Blocks whose selector list contains `selector` exactly. */
const rules = (selector: string, from: CssBlock[] = all) => from.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
/** The last value of `prop` over the blocks (cascade order within the files read), or undefined. */
const val = (blocks: CssBlock[], prop: string) => blocks.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()
const inForced = (b: CssBlock) => b.atrules.some((a) => /forced-colors/.test(a))

const RING = /^var\(--focus-ring-width\) solid var\(--focus-ring-color\)$/
const INNER = /^var\(--focus-ring-inner-width\) solid var\(--focus-ring-color\)$/
const OFFSETS = ['var(--focus-ring-offset)', 'var(--focus-ring-offset-inset)', 'calc(-1 * var(--focus-ring-inner-width))', '0']
/** The only :focus-visible rules that may turn the outline off: a text entry whose frame rings, a Segmented option whose track rings. */
const OUTLINE_NONE_ALLOWED = ['.ui-field__input', '.search-field__input', '.ui-field__textarea', '.time-field__segment', '.segmented__option']

const focusBlocks = uiApp.filter((b) => /:focus-visible/.test(b.selector) && !inForced(b))

describe('styles.css: one global ring (A11Y-02)', () => {
  it('the global rule is :where(:focus-visible): the width token in the colour token at the offset token, zero specificity', () => {
    const r = rules(':where(:focus-visible)', blocksOf([], ['styles.css']))
    expect(r.length).toBe(1)
    expect(val(r, 'outline')).toMatch(RING)
    expect(val(r, 'outline-offset')).toBe('var(--focus-ring-offset)')
  })

  it('the old bare `:focus-visible` rule (3 px, --color-primary) is gone', () => {
    expect(rules(':focus-visible', blocksOf([], ['styles.css']))).toEqual([])
  })

  it('the box-shadow --focus-ring token is removed: not defined in styles.css, not referenced in ui/ or app/', () => {
    const tokens = blocksOf([], ['styles.css']).flatMap((b) => b.decls).filter(([p]) => p === '--focus-ring')
    expect(tokens).toEqual([])
    const refs = uiApp.flatMap((b) => b.decls.filter(([, v]) => /var\(--focus-ring\)/.test(v)).map(([p]) => `${b.file}:${b.line} ${b.selector} ${p}`))
    expect(refs).toEqual([])
  })
})

describe('every ring in ui/ and app/ is an outline in the tokens', () => {
  it('no :focus-visible, :focus-within or [data-gallery-focus] rule draws a ring as a box-shadow with the accent or a ring token', () => {
    const bad = uiApp.filter((b) => /:focus-visible|:focus-within|:focus\b|data-gallery-focus/.test(b.selector) && b.decls.some(([p, v]) => p === 'box-shadow' && /--focus-ring|--color-accent\)/.test(v) && !/inset/.test(v)))
    expect(bad.map((b) => `${b.file}:${b.line} ${b.selector}`)).toEqual([])
  })

  it('every :focus-visible outline is the width token in --focus-ring-color (or the inner width), or off only on the allow-list', () => {
    const bad: string[] = []
    for (const b of focusBlocks) {
      const outline = b.decls.find(([p]) => p === 'outline')?.[1]
      const color = b.decls.find(([p]) => p === 'outline-color')?.[1]
      if (outline === undefined && color === undefined) continue
      for (const s of selectorList(q(b.selector)).filter((x) => /:focus-visible/.test(x))) {
        if (outline === 'none' || outline === '0') {
          if (!OUTLINE_NONE_ALLOWED.includes(lastCompound(s).replace(/:[a-z-]+(\([^)]*\))?/g, ''))) bad.push(`${b.file}:${b.line} ${s}: outline ${outline} is not on the allow-list`)
        } else if (outline !== undefined && !RING.test(outline) && !INNER.test(outline)) bad.push(`${b.file}:${b.line} ${s}: outline ${outline}`)
        else if (outline === undefined && color !== undefined && color !== 'var(--focus-ring-color)') bad.push(`${b.file}:${b.line} ${s}: outline-color ${color}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('every :focus-visible outline-offset is a ring token (the outer offset, the inset, the inner negative) or 0 on a frame', () => {
    const bad = focusBlocks.flatMap((b) => b.decls.filter(([p, v]) => p === 'outline-offset' && !OFFSETS.includes(v)).map(([, v]) => `${b.file}:${b.line} ${b.selector}: ${v}`))
    expect(bad).toEqual([])
  })

  it('no rule outside forced colours writes a ring with a literal px width or the accent colour on a focus state', () => {
    const bad = uiApp.filter((b) => !inForced(b) && /:focus-visible|:focus-within/.test(b.selector) && b.decls.some(([p, v]) => /^outline/.test(p) && /\b\d+px\b|--color-accent\b(?!-)/.test(v.replace(/var\(--focus-ring-[a-z-]+\)/g, ''))))
    expect(bad.map((b) => `${b.file}:${b.line} ${b.selector}`)).toEqual([])
  })
})

describe('field frames ring while their text entry has focus, not on :focus-within', () => {
  it('.ui-field__control and .search-field__control have no :focus-within ring (no outline, box-shadow or accent border)', () => {
    const bad = uiApp.filter((b) => /(\.ui-field__control|\.search-field__control|\.time-field)\b[^,{]*:focus-within/.test(b.selector) && b.decls.some(([p, v]) => /^(outline|box-shadow)/.test(p) && !/inset/.test(v) && !/^none$/.test(v)))
    expect(bad.map((b) => `${b.file}:${b.line} ${b.selector}`)).toEqual([])
  })

  it('the Field frame rings (outline, offset 0, accent border, no shadow) while its input, textarea or spinbutton has focus', () => {
    const r = uiApp.filter((b) => b.file === 'ui/fields/Field.css' && /\.ui-field__control:has\(/.test(b.selector) && /:focus\b/.test(b.selector) && !/:focus-visible/.test(b.selector))
    expect(r.length).toBeGreaterThan(0)
    expect(val(r, 'outline')).toMatch(RING)
    expect(val(r, 'outline-offset')).toBe('0')
    expect(val(r, 'box-shadow')).toBe('none')
    expect(val(r, 'border-color')).toBe('var(--color-accent)')
  })

  it('the SearchField frame rings while its input has focus', () => {
    const r = uiApp.filter((b) => b.file === 'ui/fields/SearchField.css' && /\.search-field__control:has\(input:focus\)/.test(b.selector))
    expect(r.length).toBeGreaterThan(0)
    expect(val(r, 'outline')).toMatch(RING)
    expect(val(r, 'outline-offset')).toBe('0')
  })

  it.each([
    ['ui/Select/Select.css', '.select__trigger:focus-visible'],
    ['ui/fields/DateField.css', '.date-field__trigger:focus-visible'],
  ])('%s: the trigger is the whole frame, so it takes the outer ring on the frame (offset 0, no shadow)', (file, selector) => {
    const r = rules(selector, uiApp.filter((b) => b.file === file))
    expect(val(r, 'outline')).toMatch(RING)
    expect(val(r, 'outline-offset')).toBe('0')
    expect(val(r, 'box-shadow')).toBe('none')
  })
})

describe('nested controls ring inside themselves (R-C+)', () => {
  const nested = uiApp.filter((b) => /\[data-focus-scope\]/.test(b.selector) && /:focus-visible/.test(b.selector) && !/:has\(:focus-visible\)$/.test(q(b.selector)))

  it('Scenario: Focusing the Increase button of a stepper field shows one ring, inside the button: a 2 px outline at a -2 px offset on a soft fill', () => {
    expect(nested.length).toBeGreaterThan(0)
    expect(val(nested, 'outline')).toMatch(INNER)
    expect(val(nested, 'outline-offset')).toBe('calc(-1 * var(--focus-ring-inner-width))')
    expect(val(nested, 'background')).toBe('var(--color-soft)')
    expect(val(nested, 'color')).toBe('var(--color-accent-text)')
  })

  it('the nested rule covers field frames and search frames by default, and any [data-focus-scope]', () => {
    const sel = q(nested.map((b) => b.selector).join(' '))
    for (const scope of ['.ui-field__control', '.search-field__control', '[data-focus-scope]']) expect(sel).toContain(scope)
    for (const el of ['button', "[role='button']", 'a']) expect(sel).toContain(el)
  })

  it('while a child has focus, the container steps back to its neutral outline (only one accent ring at a time)', () => {
    const r = uiApp.filter((b) => q(b.selector).includes('[data-focus-scope]:has(:focus-visible)'))
    expect(r.length).toBeGreaterThan(0)
    expect(val(r, 'border-color')).toBe('var(--color-outline)')
  })
})

describe('a group with one tab stop, and full-bleed targets', () => {
  it('a Segmented draws no ring on its options and rings the whole track with the outer ring', () => {
    expect(val(rules('.segmented__option:focus-visible', uiApp), 'outline')).toBe('none')
    const track = uiApp.filter((b) => q(b.selector) === '.segmented:has(.segmented__option:focus-visible)' && !inForced(b))
    expect(val(track, 'outline')).toMatch(RING)
    expect(val(track, 'outline-offset')).toBe('var(--focus-ring-offset)')
  })

  it.each([
    ['.list-row__target:focus-visible', 'ui/ListRow.css'],
    ['.choice-chip:focus-visible', 'ui/ChoiceChip.css'],
    ['.tile__stretch:focus-visible', 'ui/Tile.css'],
  ])('%s draws its ring inside its own edge (offset --focus-ring-offset-inset)', (selector, file) => {
    const r = rules(selector, uiApp.filter((b) => b.file === file))
    expect(val(r, 'outline')).toMatch(RING)
    expect(val(r, 'outline-offset')).toBe('var(--focus-ring-offset-inset)')
  })

  it('Scenario: A focused list row\'s ring does not touch its title: the row target ring is inside the row and the title keeps the row padding', () => {
    const target = rules('.list-row__target:focus-visible', uiApp)
    expect(val(target, 'outline-offset')).toBe('var(--focus-ring-offset-inset)')
    // the row's padding (16 px) is at least the ring width plus its 2 px clearance, so the 3 px inset ring clears the content
    const row = rules('.list-row', uiApp)
    expect(val(row, 'padding-inline') ?? val(row, 'padding') ?? '').toMatch(/--space-(3|4|5)\b|--row-pad/)
  })
})

describe('ring colour on an accent container (A11Y-02, A11Y-03, TB-05)', () => {
  const tile = uiApp.filter((b) => b.file === 'ui/Tile.css')

  it('Scenario: The Cook button on the Today hero shows a visible ring when focused by keyboard: the hero sets --focus-ring-color to a colour that is not the accent', () => {
    const hero = tile.filter((b) => q(b.selector) === ".tile[data-variant='hero']")
    expect(val(hero, '--focus-ring-color')).toMatch(/^(currentColor|var\(--color-on-accent\))$/)
  })

  it("Scenario: A User who chose Dark sees the dark Today hero on a device set to light: the dark hero rule is in ui/Tile and keys on data-scheme, not on the OS", () => {
    const dark = tile.filter((b) => q(b.selector) === ":root[data-scheme='dark'] .tile[data-variant='hero']")
    expect(dark.length).toBe(1)
    expect(val(dark, 'background')).toBe('var(--color-soft-strong)')
    expect(val(dark, 'color')).toBe('var(--color-text)')
    expect(dark[0]!.atrules).toEqual([])
  })

  it('the primary button on the dark hero is the accent fill with on-accent text (the Cook button)', () => {
    const cook = tile.filter((b) => q(b.selector) === ":root[data-scheme='dark'] .tile[data-variant='hero'] .button[data-variant='primary']")
    expect(val(cook, 'background')).toBe('var(--color-accent)')
    expect(val(cook, 'color')).toBe('var(--color-on-accent)')
  })

  it('a why chip on a hero follows the hero colour: a tint of currentColor (at most 14 %; B9-17 set 11 %, the highest at 4.5:1 for every preset, see theme/contrast.tiles.test.ts), text inherited', () => {
    const why = tile.filter((b) => q(b.selector) === ".tile[data-variant='hero'] .chip[data-kind='why']")
    expect(val(why, 'background')).toMatch(/^color-mix\(in srgb, currentColor (\d|1[0-4])%, transparent\)$/)
    expect(val(why, 'color')).toBe('inherit')
  })

  it('a toast (the inverse fill) sets the ring colour to --color-bg once, and has no :focus-visible outline of its own', () => {
    const toast = rules('.toast', uiApp.filter((b) => b.file === 'ui/Toast.css'))
    expect(val(toast, '--focus-ring-color')).toBe('var(--color-bg)')
    expect(uiApp.filter((b) => b.file === 'ui/Toast.css' && /:focus-visible/.test(b.selector) && b.decls.some(([p]) => /^outline/.test(p)))).toEqual([])
  })
})

describe('ring room: the scroll containers that hold controls', () => {
  const ROOM = 'calc(var(--focus-ring-width) + var(--focus-ring-offset))'
  it.each([
    ['.sheet__body', 'ui/BottomSheet.css'],
    ['.dialog__body', 'ui/Dialog.css'],
  ])('Scenario: The first field of a sheet shows its whole ring under the sheet\'s header: %s pads and scroll-pads 5 px as width + offset, no raw px', (selector, file) => {
    const r = rules(selector, uiApp.filter((b) => b.file === file))
    expect(val(r, 'padding-block')).toBe(ROOM)
    expect(val(r, 'scroll-padding-block')).toBe(ROOM)
  })
})

describe('one scheme attribute (A11Y-03, check-ui scheme-attr)', () => {
  it('no ui/, app/ or styles.css selector or query mentions data-theme', () => {
    expect(all.filter((b) => /data-theme/.test(b.selector + b.atrules.join(' '))).map((b) => `${b.file}:${b.line}`)).toEqual([])
  })
  it('prefers-color-scheme appears only in styles.css', () => {
    expect(uiApp.filter((b) => b.atrules.some((a) => /prefers-color-scheme/.test(a))).map((b) => `${b.file}:${b.line}`)).toEqual([])
  })
  it('every token block that is dark keys on data-scheme (the dark overrides in ui/ and app/ are :root[data-scheme] or [data-scheme] descendants)', () => {
    expect(all.filter((b) => !isTokenBlock(b) && /\[data-theme/.test(b.selector))).toEqual([])
  })
})
