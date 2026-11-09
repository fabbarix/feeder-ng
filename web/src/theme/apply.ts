// Writes a generated palette onto an element as CSS custom properties.
import { generatePalette, toCssVars, type Scheme, type ThemeInput } from './palette'

export function applyTheme(root: HTMLElement, input: ThemeInput, scheme: Scheme): void {
  const vars = toCssVars(generatePalette(input, scheme))
  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }
  root.style.colorScheme = scheme
  root.dataset.scheme = scheme
}
