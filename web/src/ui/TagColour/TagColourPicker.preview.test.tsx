// TagColourPicker: the helper and error lines sit above the live preview (TG-UI review nit, settled by TG-S).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagColourPicker } from './TagColourPicker'

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const preview = <span data-testid="pv">preview</span>

describe('TagColourPicker: where the preview sits', () => {
  it('the order is label, swatches, helper, preview', () => {
    render(<TagColourPicker label="Tag colour" value="sage" onChange={() => {}} helper="Colours only help tell Tags apart." preview={preview} />)
    const group = screen.getByRole('radiogroup', { name: 'Tag colour' })
    const helper = screen.getByText('Colours only help tell Tags apart.')
    const pv = screen.getByTestId('pv')
    expect(follows(group, helper)).toBe(true)
    expect(follows(helper, pv)).toBe(true)
  })

  it('an error line also comes before the preview', () => {
    render(<TagColourPicker label="Tag colour" value="sage" onChange={() => {}} error="Pick a colour" preview={preview} />)
    expect(follows(screen.getByText('Pick a colour'), screen.getByTestId('pv'))).toBe(true)
  })

  it('the preview stays outside the radiogroup and keeps its class', () => {
    render(<TagColourPicker label="Tag colour" value="sage" onChange={() => {}} helper="h" preview={preview} />)
    expect(screen.getByRole('radiogroup').contains(screen.getByTestId('pv'))).toBe(false)
    expect(screen.getByTestId('pv').closest('.tag-colour-picker__preview')).not.toBeNull()
  })

  it('the helper still describes the radiogroup, and the preview does not', () => {
    render(<TagColourPicker label="Tag colour" value="sage" onChange={() => {}} helper="Colours only help tell Tags apart." preview={preview} />)
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription('Colours only help tell Tags apart.')
  })
})
