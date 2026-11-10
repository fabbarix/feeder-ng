// R11a: Breadcrumbs.css contract: token styling, no underline at rest, focus ring, 44 px touch targets,
// and the phone collapse (parent only) that never wraps onto a second line.
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Breadcrumbs.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Inner text of the first `@media (<query>) { ... }`, '' when absent. */
function media(query: RegExp): string {
  const m = query.exec(code)
  if (!m) return ''
  let i = code.indexOf('{', m.index)
  const from = i + 1
  let depth = 0
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(from, i)
  }
  return ''
}
const PHONE = /@media\s*\(\s*max-width\s*:\s*(5\d\d|6[0-3]\d|7[0-6]\d)px\s*\)/ // up to 767 px: phones

describe('Breadcrumbs.css', () => {
  it('exists and is imported by the primitive', () => {
    expect(code.trim().length).toBeGreaterThan(0)
  })

  it('uses tokens only: no colour literals, no px font sizes', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch)\(/)
    expect(code).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
  })

  it('small secondary type: meta size, muted colour', () => {
    const d = declarations(css, '.breadcrumbs')
    expect(d['font-size']).toBe('var(--text-meta-size)')
    expect(d['color']).toBe('var(--color-muted)')
  })

  it('a row of its own: one line that never wraps (nowrap list, no flex-wrap: wrap)', () => {
    const list = declarations(css, '.breadcrumbs__list')
    expect(list['display']).toBe('flex')
    expect(list['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(code).not.toMatch(/flex-wrap\s*:\s*wrap/)
    expect(list['list-style']).toMatch(/^none/)
  })

  it('links have no underline at rest, and gain one (or a colour) on hover and focus', () => {
    expect(declarations(css, '.breadcrumbs__link')['text-decoration']).toBe('none')
    expect(code).toMatch(/\.breadcrumbs__link:hover/)
    expect(code).toMatch(/\.breadcrumbs__link:hover[^{]*\{[^}]*(text-decoration\s*:\s*underline|color\s*:)/)
  })

  it('has a visible focus ring on the links', () => {
    const d = declarations(css, '.breadcrumbs__link:focus-visible')
    expect(d['outline']).toMatch(/3px solid var\(--color-accent\)/)
  })

  it('links are at least 44 px tall (touch target)', () => {
    const d = declarations(css, '.breadcrumbs__link')
    expect(d['min-block-size'] ?? d['min-height']).toBe('44px')
    expect(d['display']).toMatch(/flex/)
  })

  it('long names truncate with an ellipsis instead of wrapping (items shrink, the current page truncates)', () => {
    const cur = declarations(css, '.breadcrumbs__current')
    expect(cur['overflow']).toBe('hidden')
    expect(cur['text-overflow']).toBe('ellipsis')
    expect(cur['white-space']).toBe('nowrap')
    expect(declarations(css, '.breadcrumbs__item')['min-inline-size']).toBe('0')
  })

  it('phone (max-width 767 px or less): only the parent crumb shows, as "‹ Parent"; the rest stay readable to screen readers', () => {
    const phone = media(PHONE)
    expect(phone, 'a phone @media block').not.toBe('')
    expect(phone).toMatch(/\.breadcrumbs__item:not\(\[data-parent=['"]true['"]\]\)/)
    // collapsed visually, not display:none, so assistive technology still reads the whole trail
    expect(phone).toMatch(/clip|clip-path|inset\(50%\)/)
    expect(phone).not.toMatch(/\.breadcrumbs__item:not\([^)]*\)[^{]*\{[^}]*display\s*:\s*none/)
    // the back caret is shown there and the separators are not
    expect(phone).toMatch(/\.breadcrumbs__back/)
    expect(phone).toMatch(/\.breadcrumbs__sep[^{]*\{[^}]*display\s*:\s*none/)
  })

  it('the back caret is hidden above phone width', () => {
    expect(declarations(css, '.breadcrumbs__back')['display']).toBe('none')
  })
})
