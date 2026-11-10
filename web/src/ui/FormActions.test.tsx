// R2-F (F-03/F-04): one action row for pages, sheets and dialogs. DOM order = destructive, tertiary, secondary, primary (primary last);
// from 600 px the row is right-aligned with the destructive action at the far left; below 600 px the buttons stack, full width,
// primary on top (column-reverse).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { FormActions } from './FormActions'
import { declarations, readUiCss } from './test-utils'

describe('FormActions', () => {
  const full = (
    <FormActions
      primary={<Button type="submit">Save</Button>}
      secondary={<Button variant="secondary">Save and add</Button>}
      tertiary={<Button variant="tertiary">Cancel</Button>}
      destructive={<Button variant="danger-tertiary">Delete</Button>}
    />
  )

  it('orders destructive, tertiary, secondary, primary in the DOM (primary last)', () => {
    const { container } = render(full)
    const names = [...container.querySelectorAll('button')].map((b) => b.textContent)
    expect(names).toEqual(['Delete', 'Cancel', 'Save and add', 'Save'])
  })

  it('wraps each slot in its own element so CSS can place it', () => {
    const { container } = render(full)
    const root = container.querySelector('.form-actions')!
    expect(root).not.toBeNull()
    for (const slot of ['destructive', 'tertiary', 'secondary', 'primary']) {
      expect(root.querySelector(`.form-actions__${slot}`), slot).not.toBeNull()
    }
    expect(within(root.querySelector('.form-actions__primary') as HTMLElement).getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('renders only the slots given (primary alone is valid)', () => {
    const { container } = render(<FormActions primary={<Button>Save</Button>} />)
    expect(container.querySelectorAll('.form-actions > *')).toHaveLength(1)
  })

  it('sits in a BottomSheet footer and a Dialog action area without a second container', () => {
    render(
      <>
        <BottomSheet open title="Add Member" onClose={() => {}} footer={<FormActions primary={<Button>Add</Button>} tertiary={<Button variant="tertiary">Cancel</Button>} />}>
          body
        </BottomSheet>
      </>,
    )
    const footer = document.querySelector('.sheet__footer')!
    expect(footer.querySelector('.form-actions')).not.toBeNull()
    expect(within(footer as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Add'])
  })

  it('Dialog actions can carry it too', () => {
    render(
      <Dialog open title="Delete Shop" onClose={() => {}} actions={<FormActions primary={<Button variant="danger">Delete</Button>} tertiary={<Button variant="tertiary">Keep</Button>} />}>
        Sure?
      </Dialog>,
    )
    expect(screen.getByRole('dialog').querySelector('.dialog__actions .form-actions')).not.toBeNull()
  })
})

describe('FormActions.css', () => {
  const css = readUiCss('FormActions.css')

  it('fills the footer it sits in and is a wrapping flex row', () => {
    expect(declarations(css, '.form-actions')).toMatchObject({ display: 'flex', 'inline-size': '100%', gap: 'var(--space-2)' })
  })

  it('phone first: below 600 px it is a column-reverse stack (primary on top) with full-width buttons', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*599px\)/)
    const phone = css.slice(css.search(/@media\s*\(max-width:\s*599px\)/))
    expect(phone).toMatch(/flex-direction:\s*column-reverse/)
    expect(phone).toMatch(/\.form-actions\s+\.button\s*\{[^}]*inline-size:\s*100%/)
  })

  it('from 600 px: one row, right-aligned, primary not full width, destructive pushed to the far left', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*600px\)/)
    const desk = css.slice(css.search(/@media\s*\(min-width:\s*600px\)/))
    expect(desk).toMatch(/justify-content:\s*flex-end/)
    expect(desk).toMatch(/\.form-actions__destructive\s*\{[^}]*margin-inline-end:\s*auto/)
    expect(desk).not.toMatch(/inline-size:\s*100%/)
  })

  it('the desktop rule never sets the primary full width (F-03)', () => {
    const desk = css.slice(css.search(/@media\s*\(min-width:\s*600px\)/))
    expect(desk).not.toMatch(/form-actions__primary[^}]*(inline-size|width):\s*100%/)
  })
})
