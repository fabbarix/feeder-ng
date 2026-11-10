// The shell stylesheet (plan 4.5): tokens only, one clearance variable, chromeless is full-viewport. Reads web/src/app/shell.css.
import { describe, expect, it } from 'vitest'
import { declarations, readStylesCss } from '../ui/test-utils'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const read = (p: string) => {
  try {
    return readFileSync(`${cwd}/${p}`, 'utf8')
  } catch {
    return ''
  }
}

const css = read('src/app/shell.css')
const code = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Inner text of the first `@media (<query>) { ... }` (one nesting level of rules). */
function media(query: string): string {
  const start = code.indexOf(`@media (${query})`)
  if (start < 0) return ''
  let i = code.indexOf('{', start)
  const from = i + 1
  let depth = 0
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++
    else if (code[i] === '}' && --depth === 0) return code.slice(from, i)
  }
  return ''
}
const d = (selector: string) => declarations(code, selector)

describe('shell.css exists and follows the guards', () => {
  it('is a stylesheet of its own, imported by the shell', () => {
    expect(code.trim().length).toBeGreaterThan(0)
    expect(read('src/app/AppShell.tsx')).toMatch(/import ['"]\.\/shell\.css['"]/)
  })
  it('has no colour literals and no px font sizes', () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?|oklch|oklab)\(/)
    expect(code).not.toMatch(/font-size\s*:[^;]*\d+(\.\d+)?px/)
  })
  it('styles.css no longer holds the shell rules (moved)', () => {
    const styles = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')
    for (const sel of ['.app-shell', '.top-bar', '.app-main', '.bottom-bar', '.side-rail', '.your-menu']) {
      expect(styles, sel).not.toMatch(new RegExp(`(^|[\\s,}])${sel.replace('.', '\\.')}[\\s,{:\\[_.-]`))
    }
    expect(styles).not.toMatch(/--bar-height/)
  })
})

describe('bottom clearance (acceptance: nothing hidden behind the nav)', () => {
  it('--nav-clearance = 70 + 12 + 16 + the safe area, applied as .app-main bottom padding', () => {
    const root = d(':root')
    expect(root['--nav-height']).toBe('70px')
    expect(root['--nav-inset']).toBe('12px')
    expect(root['--nav-clearance']).toMatch(/var\(--nav-height\).*var\(--nav-inset\).*var\(--space-4\).*env\(safe-area-inset-bottom/)
    expect(d('.app-main')['padding-bottom']).toBe('var(--nav-clearance)')
  })
  it('chromeless and the rail layout drop the clearance (there is no bottom bar)', () => {
    expect(d('.app-shell--chromeless')['padding']).toBe('0')
    expect(d('.app-main--full')['padding-bottom']).toBe('0')
    expect(media('min-width: 1024px')).toMatch(/--nav-clearance\s*:\s*0/)
  })
  it('the viewport never scrolls sideways: the page is not wider than the viewport', () => {
    expect(d('.app-shell')['min-width']).toBe('0')
    expect(d('.app-main')['min-width']).toBe('0')
    expect(d('.app-main')['max-width']).toBeDefined()
  })
})

describe('bottom bar (plan 4.5)', () => {
  it('floats inset 12 px plus the safe area, 70 high, radius 24, max 480 centred', () => {
    const bar = d('.bottom-bar')
    expect(bar['position']).toBe('fixed')
    expect(bar['height']).toBe('var(--nav-height)')
    expect(bar['bottom']).toMatch(/var\(--nav-inset\).*env\(safe-area-inset-bottom/)
    expect(bar['border-radius']).toBe('var(--radius-nav)')
    expect(bar['box-shadow']).toBe('var(--elev-2)')
    expect(bar['max-width']).toBe('480px')
    expect(bar['background']).toBe('var(--color-surface)')
    expect(code).toMatch(/\.bottom-bar[^{}]*\{[^{}]*(margin-inline\s*:\s*auto|margin\s*:[^;]*auto)/)
  })
  it('items are 62 x 54, radius 16, icon over a 11/800 label', () => {
    const link = d('.bottom-bar__link')
    expect(link['width']).toBe('62px')
    expect(link['height']).toBe('54px')
    expect(link['border-radius']).toBe('var(--radius-button)')
    expect(link['flex-direction']).toBe('column')
    expect(link['gap']).toBe('2px')
    expect(link['color']).toBe('var(--color-muted)')
    const label = d('.bottom-bar__label')
    expect(label['font-size']).toBe('var(--text-nav-size)')
    expect(label['font-weight']).toBe('var(--text-nav-weight)')
  })
  it('the current tab has a soft pill and accent text (via aria-current, not a class)', () => {
    const active = d(".bottom-bar__link[aria-current='page']")
    expect(active['background']).toBe('var(--color-soft)')
    expect(active['color']).toBe('var(--color-accent-text)')
  })
  it('Scan is a 58 x 58 accent button, radius 20, in the bar (no upward translate)', () => {
    const scan = d(".bottom-bar__link[data-accent='true']")
    expect(scan['width']).toBe('58px')
    expect(scan['height']).toBe('58px')
    expect(scan['border-radius']).toBe('var(--radius-button-lg)')
    expect(scan['background']).toBe('var(--color-accent)')
    expect(scan['color']).toBe('var(--color-on-accent)')
    expect(Object.keys(scan)).not.toContain('transform')
    expect(code).not.toMatch(/translateY\(\s*-/)
  })
  it('on /scan the Scan button gets a 3 px soft ring', () => {
    const ring = d(".bottom-bar__link[data-accent='true'][aria-current='page']")
    expect(`${ring['box-shadow'] ?? ''} ${ring['outline'] ?? ''}`).toMatch(/3px/)
    expect(`${ring['box-shadow'] ?? ''} ${ring['outline'] ?? ''}`).toMatch(/var\(--color-soft/)
  })
  it('is hidden from 1024 up, where the side rail takes over', () => {
    expect(media('min-width: 1024px')).toMatch(/\.bottom-bar\s*\{[^}]*display\s*:\s*none/)
  })
})

describe('side rail (plan 4.5)', () => {
  it('is hidden on phones and 88 wide from 1024, 240 wide from 1440', () => {
    expect(d('.side-rail')['display']).toBe('none')
    const wide = media('min-width: 1024px')
    expect(wide).toMatch(/\.app-shell\s*\{[^}]*grid-template-columns\s*:\s*88px\s+minmax\(0,\s*1fr\)/)
    expect(wide).toMatch(/\.side-rail\s*\{[^}]*display\s*:\s*flex/)
    expect(media('min-width: 1440px')).toMatch(/grid-template-columns\s*:\s*240px\s+minmax\(0,\s*1fr\)/)
  })
  it('does not switch layout at 900 any more (that was the board bug)', () => {
    expect(code).not.toMatch(/min-width\s*:\s*900px/)
  })
  it('the current destination is a soft pill 56 x 32 behind the icon, Scan a 56 square accent', () => {
    const wide = media('min-width: 1024px')
    expect(wide).toMatch(/\.side-rail__link\[aria-current='page'\][^{}]*\{[^}]*background\s*:\s*var\(--color-soft\)/)
    expect(wide).toMatch(/56px/)
    expect(wide).toMatch(/\.side-rail__link\[data-accent='true'\][^{}]*\{[^}]*background\s*:\s*var\(--color-accent\)/)
  })
})

describe('chromeless routes are full viewport (B3)', () => {
  it('the frame is a plain block with no padding and the full dynamic viewport height', () => {
    const frame = d('.app-shell--chromeless')
    expect(frame['display']).toBe('block')
    expect(frame['padding']).toBe('0')
    expect(frame['min-height']).toBe('100dvh')
  })
  it('the main has no max-width or centring margin', () => {
    const main = d('.app-main--full')
    expect(main['max-width']).toBe('none')
    expect(main['margin']).toBe('0')
  })
  it('no media query re-applies the grid to the chromeless frame', () => {
    expect(media('min-width: 1024px')).toMatch(/\.app-shell:not\(\.app-shell--chromeless\)/)
    expect(media('min-width: 1440px')).not.toMatch(/\.app-shell\s*\{/)
  })
})

describe('avatar menu (5.17)', () => {
  it('is a 240 wide popover, radius 20, elevation 2', () => {
    const menu = d('.your-menu')
    expect(menu['width']).toBe('240px')
    expect(menu['border-radius']).toBe('var(--radius-tile-sm)')
    expect(menu['box-shadow']).toBe('var(--elev-2)')
    expect(menu['max-width']).toMatch(/100(vw|%)/)
  })
  it('rows are 48 high with the icon and label side by side; the avatar button is a 40 px rounded square', () => {
    const item = d('.your-menu__item')
    expect(item['min-height']).toBe('48px')
    expect(item['display']).toBe('flex')
    expect(item['gap']).toBeDefined()
    const trigger = d('.your-menu-button')
    expect(trigger['width']).toBe('40px')
    expect(trigger['height']).toBe('40px')
    expect(trigger['border-radius']).toBe('14px')
  })
  it('Sign out is danger tertiary text; the divider is a hairline', () => {
    expect(d(".your-menu__item[data-tone='danger']")['color']).toBe('var(--status-danger-fg)')
    expect(d('.your-menu__divider')['background']).toBe('var(--color-line)')
  })
  it('the scrim covers the viewport, below the menu', () => {
    const scrim = d('.your-menu-scrim')
    expect(scrim['position']).toBe('fixed')
    expect(scrim['inset']).toBe('0')
    expect(scrim['background']).toBe('var(--scrim)')
    expect(Number(scrim['z-index'])).toBeLessThan(Number(d('.your-menu')['z-index']))
  })
})

describe('top bar', () => {
  it('drops the brand word on phones, shows it from 1024', () => {
    expect(d('.top-bar__brand')['display']).toBe('none')
    expect(media('min-width: 1024px')).toMatch(/\.top-bar__brand\s*\{[^}]*display\s*:\s*(block|inline)/)
  })
})
