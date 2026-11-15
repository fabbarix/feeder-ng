// B9-49 (A11Y-10, RES-07, TB-13, RES-08; plan section 9): shell scenarios with no rule number of their own (P1..P43 are all assigned, and
// P37, which this package owns, is about titles). As in b9-25, each setup measures the page and THROWS on a finding: a setup that throws
// fails the scenario as "not inspected" and names the finding. Run only these: scripts/check-page-layout.sh --scenario shell-skip-link,...
//   shell-skip-link          /shop at 1440 and 390: the first focusable element is the skip link; focused it is inside the viewport; activating
//                            it focuses the page's h1 (else <main>) without changing the route (A11Y-10).
//   shell-offline-banner     /plan at 390 and 1440, offline: after scrolling 600 px the banner's top is between 0 and 16 px; from 1024 its left
//                            is at least the rail's right edge (RES-07).
//   nav-current-recipe / nav-current-recipe-edit / nav-current-ingredient
//                            /recipes/:id, /recipes/:id/edit and /ingredients/:id at 390 and 1440: exactly one link of the visible nav is
//                            current, and it is Recipes, Recipes, Settings (TB-13).
//   toast-region-chromeless  /board at 390: the toast region sits at the bottom edge (a 12 px gap), not 82 px up where the bottom bar would be: there
//                            is no bar on the Kitchen board or in Cook Mode (the B9-25/B9-49 follow-up).
//   boot-theme               / at 390: a returning User's cached theme (localStorage feeder.theme) is already on <html> in a fresh document's
//                            first moment, before React renders (RES-08).
import { evaluate, until } from '../helpers.mjs'

const noSkeleton = `!document.querySelector('[aria-busy="true"], .skeleton')`
const ready = `!!document.querySelector('main h1') && ${noSkeleton}`

const SKIP_LINK = `(async () => {
  const out = []
  const link = document.querySelector('a.skip-link')
  if (!link) return ['there is no .skip-link in the shell']
  const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter((e) => !e.closest('[hidden], [inert]'))
  if (focusable[0] !== link) out.push('the first focusable element is ' + (focusable[0] ? focusable[0].tagName.toLowerCase() + '.' + [...focusable[0].classList].join('.') : 'nothing') + ', not the skip link')
  if ((link.textContent || '').trim() !== 'Skip to content') out.push('the skip link reads "' + (link.textContent || '').trim() + '", not "Skip to content"')
  link.focus({ focusVisible: true })
  await new Promise((r) => setTimeout(r, 450))
  const r = link.getBoundingClientRect()
  if (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth) out.push('the focused skip link is not inside the viewport (' + [r.left, r.top, r.right, r.bottom].map((n) => Math.round(n)).join(', ') + ')')
  const before = location.pathname + location.search
  link.click()
  await new Promise((r) => setTimeout(r, 100))
  const want = document.getElementById('page-title') || document.getElementById('main-content')
  if (document.activeElement !== want) out.push('activating the skip link did not focus ' + (document.getElementById('page-title') ? 'the h1' : '<main>'))
  if (location.pathname + location.search !== before || location.hash !== '') out.push('activating the skip link changed the address to ' + location.pathname + location.search + location.hash)
  return out
})()`

const OFFLINE_BANNER = `(async () => {
  const out = []
  const spacer = document.createElement('div')
  spacer.style.height = '3000px'
  document.querySelector('main').append(spacer)
  window.dispatchEvent(new Event('offline'))
  const t0 = Date.now()
  while (!document.querySelector('.offline-banner') && Date.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 100))
  const banner = document.querySelector('.offline-banner')
  if (!banner) return ['no .offline-banner after the offline event']
  window.scrollTo(0, 600)
  await new Promise((r) => setTimeout(r, 300))
  if (scrollY < 500) out.push('the page did not scroll (scrollY ' + scrollY + '), so the banner was not tested')
  const b = banner.getBoundingClientRect()
  if (b.top < -0.5 || b.top > 16.5) out.push('after scrolling 600 px the banner\\'s top is at ' + Math.round(b.top * 10) / 10 + ' px, not between 0 and 16 (it must stay in view)')
  if (innerWidth >= 1024) {
    const rail = document.querySelector('nav.side-rail')
    const rr = rail ? rail.getBoundingClientRect() : null
    if (!rr || rr.width === 0) out.push('no visible side rail at ' + innerWidth + ' px')
    else if (b.left < rr.right - 0.5) out.push('the banner starts at ' + Math.round(b.left) + ' px, inside the rail (its right edge is ' + Math.round(rr.right) + ' px): it belongs in the page column')
  } else if (b.left < 16 - 0.5) out.push('the banner starts ' + Math.round(b.left) + ' px from the left edge, inside the page gutter (16 px)')
  if (!/Offline/.test(banner.textContent || '')) out.push('the banner does not say Offline')
  window.dispatchEvent(new Event('online'))
  spacer.remove()
  return out
})()`

const navCurrent = (expected) => `(() => {
  const out = []
  const navs = [...document.querySelectorAll('nav.bottom-bar, nav.side-rail')].filter((n) => getComputedStyle(n).display !== 'none' && n.getBoundingClientRect().width > 0)
  if (navs.length !== 1) return ['expected one visible nav, found ' + navs.length]
  const current = [...navs[0].querySelectorAll('a[aria-current="page"]')]
  if (current.length !== 1) out.push(current.length + ' links of the ' + navs[0].className + ' are current, expected exactly 1 (' + ${JSON.stringify(expected)} + ')')
  else if (current[0].textContent.trim() !== ${JSON.stringify(expected)}) out.push('"' + current[0].textContent.trim() + '" is the current item, expected "' + ${JSON.stringify(expected)} + '"')
  return out
})()`

const TOAST_REGION = `(() => {
  const region = document.querySelector('.toast-region')
  if (!region) return ['no .toast-region in the document']
  if (!document.querySelector('.app-shell--chromeless')) return ['the page is not a chromeless screen']
  const bottom = parseFloat(getComputedStyle(region).bottom)
  return bottom > 24 ? ['the toast region floats ' + Math.round(bottom) + ' px above the bottom edge on a screen with no bottom bar (at most 24)'] : []
})()`

const BOOT_THEME = `(async () => {
  const cache = { scheme: 'dark', accent: '#d9503f',
    light: { bg: '#fbf1ef', surface: '#fffaf9', surface2: '#f5e3e0', line: '#e6cbc7', text: '#2a1512', accent: '#b8402f' },
    dark: { bg: '#120b0a', surface: '#211615', surface2: '#302320', line: '#473633', text: '#f5ecea', accent: '#ff9686' } }
  const kept = localStorage.getItem('feeder.theme')
  localStorage.setItem('feeder.theme', JSON.stringify(cache))
  const frame = document.createElement('iframe')
  frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;opacity:0;pointer-events:none'
  frame.src = '/'
  document.body.append(frame)
  let first = null
  const t0 = Date.now()
  while (!first && Date.now() - t0 < 10000) {
    const d = frame.contentDocument
    if (d && d.URL !== 'about:blank' && d.documentElement && d.body) {
      first = { scheme: d.documentElement.dataset.scheme, boot: d.documentElement.dataset.boot, bg: d.documentElement.style.getPropertyValue('--boot-bg'), rendered: !!d.querySelector('.app-shell') }
    } else await new Promise((r) => setTimeout(r, 0))
  }
  frame.remove()
  if (kept === null) localStorage.removeItem('feeder.theme'); else localStorage.setItem('feeder.theme', kept)
  const out = []
  if (!first) return ['the fresh document never appeared']
  if (first.scheme !== 'dark') out.push('the first moment of a fresh document has data-scheme="' + first.scheme + '", not the cached "dark"')
  if (first.bg !== cache.dark.bg) out.push('--boot-bg is "' + first.bg + '" in the first moment, not the cached ' + cache.dark.bg)
  if (first.boot !== 'shell') out.push('data-boot is "' + first.boot + '", not "shell" (the skeleton)')
  return out
})()`

async function check(code, what) {
  const findings = await evaluate(code)
  if (findings.length > 0) throw new Error(`${what}: ${findings.join('; ')}`)
}

export default {
  order: 350,
  scenarios: [
    { name: 'shell-skip-link', route: '/shop', start: '/shop', setup: 'shellSkipLink', widths: [1440, 390], rules: ['P1'] },
    { name: 'shell-offline-banner', route: '/plan', start: '/plan', setup: 'shellOfflineBanner', widths: [390, 1440], rules: ['P1'] },
    { name: 'nav-current-recipe', route: '/recipes/:id', start: '/recipes/:id', setup: 'navCurrentRecipe', widths: [390, 1440], rules: ['P1'] },
    { name: 'nav-current-recipe-edit', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'navCurrentRecipeEdit', widths: [390, 1440], rules: ['P1'] },
    { name: 'nav-current-ingredient', route: '/ingredients/:id', start: '/ingredients/:id', setup: 'navCurrentIngredient', widths: [390, 1440], rules: ['P1'] },
    { name: 'toast-region-chromeless', route: '/board', start: '/board', setup: 'toastRegionChromeless', widths: [390], rules: ['P1'] },
    { name: 'boot-theme', route: '/', start: '/', setup: 'bootTheme', widths: [390], rules: ['P1'] },
  ],
  setups: {
    async shellSkipLink() {
      await until(ready, 'the Shop page')
      await check(SKIP_LINK, 'skip link')
    },
    async shellOfflineBanner() {
      await until(ready, 'the Plan page', 15000)
      await check(OFFLINE_BANNER, 'offline banner')
    },
    async navCurrentRecipe() {
      await until(ready, 'the Recipe page')
      await check(navCurrent('Recipes'), 'nav current on a Recipe page')
    },
    async navCurrentRecipeEdit() {
      await until(`!!document.querySelector('main .ui-field__control, main h1') && ${noSkeleton}`, 'the Recipe editor')
      await check(navCurrent('Recipes'), 'nav current on the Recipe editor')
    },
    async navCurrentIngredient() {
      await until(ready, 'the Ingredient page')
      await check(navCurrent('Settings'), 'nav current on an Ingredient page')
    },
    async toastRegionChromeless() {
      await until(`!!document.querySelector('.app-shell--chromeless h1, .app-shell--chromeless main')`, 'the Kitchen board')
      await check(TOAST_REGION, 'toast region on a chromeless screen')
    },
    async bootTheme() {
      await until(ready, 'Today')
      await check(BOOT_THEME, 'boot theme')
    },
  },
}
