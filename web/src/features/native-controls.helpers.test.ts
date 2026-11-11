// R2-L-b: the per-User secondary-colour ban exempts the shared Button variant AND the FormActions `secondary={...}` JSX prop
// (R2-F: <FormActions secondary={<Button variant="secondary">…</Button>} />), and nothing else.
import { describe, expect, it } from 'vitest'
import { stripAllowedSecondary } from './native-controls.helpers'

const BAN = /secondary(Colou?r|Accent)?\b/i
const offends = (text: string) => BAN.test(stripAllowedSecondary(text))

describe('stripAllowedSecondary', () => {
  it('exempts <Button variant="secondary">', () => {
    expect(offends('<Button variant="secondary">Save</Button>')).toBe(false)
  })
  it('exempts the FormActions secondary={…} prop, with a Button variant inside it', () => {
    expect(offends('<FormActions primary={p} secondary={<Button variant="secondary">Save and add</Button>} />')).toBe(false)
    expect(offends('<FormActions\n  primary={p}\n  secondary={x}\n/>')).toBe(false)
  })
  it('still bans the per-User colour words', () => {
    for (const bad of ['secondaryColour', 'secondaryColor', 'secondaryAccent', 'user.secondary', 'const secondary = pick()', '--color-secondary', 'secondary-colour']) {
      expect(offends(bad), bad).toBe(true)
    }
  })
  it('does not let the exemption hide a colour word next to it', () => {
    expect(offends('<FormActions secondary={x} secondaryColour="red" />')).toBe(true)
    expect(offends('<Button variant="secondary" data-secondaryColor="1" />')).toBe(true)
  })
})
