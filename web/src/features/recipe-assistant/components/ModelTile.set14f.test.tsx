// B9-51 (SET-14f): "Refresh models" sits directly after the Model Select in one FieldRow (align end); the price tier is no leading glyph
// on an option but a meta label, "Price per 1M tokens"; the option's own meta line keeps "$ · Fastest · description".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { models } from '../fixtures'
import { toModelOptions } from '../lib/modelOptions'
import { ModelTile } from './ModelTile'

function setup() {
  render(
    <ModelTile
      value="claude-haiku-5-5"
      options={toModelOptions(models, 'claude-haiku-5-5')}
      canRefresh
      createLabel={(q) => `Use model ID “${q}”`}
      onChange={vi.fn()}
      onCreate={vi.fn()}
      onRefresh={vi.fn()}
    />,
  )
}

describe('ModelTile (SET-14f)', () => {
  it('the Select and Refresh models are the two children of one FieldRow aligned to the end', () => {
    setup()
    const row = screen.getByRole('combobox', { name: 'Model' }).closest('.field-row')!
    expect(row).not.toBeNull()
    expect(row).toHaveAttribute('data-align', 'end')
    const button = screen.getByRole('button', { name: 'Refresh models' })
    expect(row).toContainElement(button)
    // directly after the Select: nothing between them in document order
    const select = row.querySelector('.ui-field, .select')!
    expect(select.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the price is a meta label "Price per 1M tokens", not a glyph before each option', async () => {
    setup()
    expect(within(screen.getByRole('region', { name: 'Model' })).getByText(/Price per 1M tokens/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    const options = await screen.findAllByRole('option')
    for (const o of options) expect(o.querySelector('.chip'), o.textContent ?? '').toBeNull()
    expect(options[0]).toHaveTextContent('$ · Fastest · Fastest and cheapest.')
  })

  it('the label is tied to the Select as its description', () => {
    setup()
    expect(screen.getByRole('combobox', { name: 'Model' })).toHaveAccessibleDescription(/Price per 1M tokens/)
  })
})
