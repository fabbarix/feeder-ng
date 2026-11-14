// b8-pantry G3: the subheaders of a grouped Select ("Ingredients", "Supplies"): the second and later groups are set off from the
// rows above them, so a subheader reads as the start of a new group and not as a row's label.
import { describe, expect, it } from 'vitest'
import { cssRules } from '../../test/cssRules'

const { valueAt } = cssRules(['ui/Select/Select.css'])

describe('a grouped Select', () => {
  it('sets every group after the first apart by --space-2 above its subheader', () => {
    expect(valueAt('.select__group + .select__group', 'margin-block-start', 0)).toBe('var(--space-2)')
  })
  it('keeps the first subheader on the list edge (no extra margin)', () => {
    expect(valueAt('.select__group', 'margin-block-start', 0)).toBeUndefined()
  })
  it('keeps the sticky subheader opaque, so rows scroll under it', () => {
    expect(valueAt('.select__group-title', 'position', 0)).toBe('sticky')
    expect(valueAt('.select__group-title', 'background', 0)).toBe('var(--color-surface)')
  })
})
