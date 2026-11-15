// Writes a generated palette onto an element as CSS custom properties.
import { generatePalette, toCssVars, type Scheme, type ThemeInput } from './palette'

export function applyTheme(root: HTMLElement, input: ThemeInput, scheme: Scheme): void {
  const vars = toCssVars(generatePalette(input, scheme))
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
  root.style.colorScheme = scheme
  root.dataset.scheme = scheme
  // B9-49 (RES-08): a returning User's page ground (index.html, html[data-boot='shell']) follows the theme applied since, so a scheme
  // or accent changed later is not left behind the page.
  const bg = vars['--color-bg']
  if (root.dataset.boot === 'shell' && bg) root.style.setProperty('--boot-bg', bg)
}
