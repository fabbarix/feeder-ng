// B9-14 / SHORT-02 "The FormActions rule" and the destructive slot (SAFE-02):
//   more?: MenuEntry[] ({ id, label, onSelect, tone? }) and moreLabel?: string (default "More actions"; callers pass "More for Dinner").
//   The `more` slot renders the shared ⋮ Menu first in the row (`.form-actions__more`), an outlined IconButton named by moreLabel
//   with aria-haspopup="menu". Below 768 px its items open in the Menu's sheet; from 768 px in the popover.
//   DOM order: more, destructive, tertiary, secondary, primary.
//   The row is ONE row at every width: never column-reverse. Below 600 px each button starts from its natural width (flex: 1 1 auto).
//   The destructive slot below 600 px is the row under the others, beneath a 1 px --color-line divider (SAFE-02; the plan's rule);
//   from 600 px it stays at the far start of the row. A caller that wants Delete inside the ⋮ passes it as a `tone: 'danger'` item.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { stubViewportWidth } from './lib/viewport.test-helper'
import { readUiCss } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

const row = () =>
  render(
    <MemoryRouter>
      <FormActions
        primary={<Button type="submit">Save Meal Slot</Button>}
        more={[
          { id: 'dates', label: 'Change a date' },
          { id: 'delete', label: 'Delete Meal Slot', tone: 'danger' },
        ]}
        moreLabel="More for Dinner"
      />
    </MemoryRouter>,
  )

describe('FormActions more (SHORT-02)', () => {
  it('renders a ⋮ button named "More for Dinner" with aria-haspopup="menu", first in the row', () => {
    const { container } = row()
    const more = screen.getByRole('button', { name: 'More for Dinner' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    expect(more).toHaveClass('icon-button')
    expect(more.closest('.form-actions__more')).not.toBeNull()
    const buttons = [...container.querySelectorAll('.form-actions button')]
    expect(buttons[0]).toBe(more)
    expect(buttons.at(-1)).toHaveTextContent('Save Meal Slot')
  })

  it('the default name is "More actions"', () => {
    render(
      <MemoryRouter>
        <FormActions primary={<Button>Go</Button>} more={[{ id: 'a', label: 'A' }]} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: 'More actions' })).toBeInTheDocument()
  })

  it('renders no ⋮ without `more`, and none for an empty list', () => {
    const { container, rerender } = render(<FormActions primary={<Button>Go</Button>} />)
    expect(container.querySelector('.form-actions__more')).toBeNull()
    rerender(<FormActions primary={<Button>Go</Button>} more={[]} />)
    expect(container.querySelector('.form-actions__more')).toBeNull()
  })

  it('opens the Menu: a popover from 768 px listing the items, the danger item in the danger tone', async () => {
    stubViewportWidth(1024)
    row()
    await userEvent.click(screen.getByRole('button', { name: 'More for Dinner' }))
    const menu = screen.getByRole('menu', { name: 'More for Dinner' })
    expect(within(menu).getByRole('menuitem', { name: 'Change a date' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Delete Meal Slot' })).toHaveAttribute('data-tone', 'danger')
  })

  it('on a phone the same items open as the Menu sheet, titled with the label, as rows', async () => {
    stubViewportWidth(390)
    row()
    await userEvent.click(screen.getByRole('button', { name: 'More for Dinner' }))
    const sheet = screen.getByRole('dialog', { name: 'More for Dinner' })
    expect(within(sheet).getByRole('button', { name: 'Delete Meal Slot' })).toBeInTheDocument()
  })

  it('choosing an item calls its onSelect and closes the menu', async () => {
    stubViewportWidth(1024)
    const onSelect = vi.fn()
    render(
      <MemoryRouter>
        <FormActions primary={<Button>Go</Button>} more={[{ id: 'dates', label: 'Change a date', onSelect }]} moreLabel="More for Dinner" />
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'More for Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Change a date' }))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('orders more, destructive, tertiary, secondary, primary in the DOM (primary last)', () => {
    const { container } = render(
      <MemoryRouter>
        <FormActions
          primary={<Button>Save</Button>}
          secondary={<Button variant="secondary">Save and add</Button>}
          tertiary={<Button variant="secondary">Cancel</Button>}
          destructive={<Button variant="danger-secondary">Delete</Button>}
          more={[{ id: 'a', label: 'A' }]}
          moreLabel="More for X"
        />
      </MemoryRouter>,
    )
    expect([...container.querySelectorAll('.form-actions button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['More for X', 'Delete', 'Cancel', 'Save and add', 'Save'])
  })
})

describe('FormActions.css (one row; the destructive divider)', () => {
  const css = readUiCss('FormActions.css')
  const media = (q: RegExp) => [...css.matchAll(/@media\s*([^{]+)\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/g)].filter((m) => q.test(m[1]!)).map((m) => m[2]!).join('\n')
  const ruleBody = (text: string, sel: string) => text.match(new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? ''

  it('never stacks: no column-reverse or column direction anywhere', () => {
    expect(css).not.toMatch(/column-reverse/)
    expect(css).not.toMatch(/flex-direction:\s*column/)
  })
  it('on a phone each button starts from its natural width and the row shares what is left', () => {
    const phone = media(/37\.5em|599px/)
    expect(phone).toMatch(/\.form-actions\s*>\s*\*[^{]*\{[^}]*flex:\s*1 1 auto/)
  })
  it('the ⋮ slot does not grow and is 44 px square', () => {
    const body = ruleBody(css, '.form-actions__more')
    expect(body).toMatch(/flex:\s*none/)
  })
  it('below 600 px the destructive slot is its own row under a 1 px --color-line divider', () => {
    const phone = media(/width\s*<\s*37\.5em|max-width:\s*599px/)
    const body = ruleBody(phone, '.form-actions__destructive')
    expect(body).toMatch(/flex-basis:\s*100%|inline-size:\s*100%|width:\s*100%/)
    expect(body).toMatch(/order:\s*1/)
    expect(body).toMatch(/border-(block-start|top):\s*1px solid var\(--color-line\)/)
  })
  it('the ⋮ slot sits at the far start from 600 px (margin-inline-end: auto)', () => {
    const wide = media(/min-width:\s*37\.5em/)
    expect(ruleBody(wide, '.form-actions__more')).toMatch(/margin-inline-end:\s*auto/)
  })
})
