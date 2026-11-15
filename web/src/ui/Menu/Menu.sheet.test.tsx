// B9-14 / DS-01: below 768 px a Menu's sheet is NOT inside the trigger's row (it is portalled to document.body), is start-aligned,
// has one row per choice that the whole row targets, and keeps the 40 px circular Close beside a long title. The trigger keeps its
// accessible name; the sheet title is `title` (a Leftover passes the Recipe name) or the label.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../lib/viewport.test-helper'
import { Menu } from './Menu'

afterEach(() => vi.unstubAllGlobals())

const view = (onHad = vi.fn()) =>
  render(
    <MemoryRouter>
      <ul>
        <li data-testid="row" className="list-row">
          <span className="list-row__trailing" data-testid="trailing">
            <Menu
              label="Actions for Cauliflower al gorgonzola with chestnut mushrooms"
              title="Cauliflower al gorgonzola with chestnut mushrooms"
              items={[
                { id: 'had-it', label: 'Had it', onSelect: onHad },
                { id: 'threw-out', label: 'Threw it out', tone: 'danger' },
                { id: 'freeze', label: 'Freeze it' },
              ]}
            />
          </span>
        </li>
      </ul>
    </MemoryRouter>,
  )

describe('Menu as a sheet (DS-01)', () => {
  it('opens a sheet that is a child of document.body, not of the row or its trailing slot', async () => {
    stubViewportWidth(390)
    view()
    await userEvent.click(screen.getByRole('button', { name: /^Actions for Cauliflower/ }))
    const sheet = screen.getByRole('dialog')
    expect(sheet.parentElement).toBe(document.body)
    expect(screen.getByTestId('row').contains(sheet)).toBe(false)
  })

  it('titles the sheet with the given title while the trigger keeps its "Actions for …" name', async () => {
    stubViewportWidth(390)
    view()
    const trigger = screen.getByRole('button', { name: 'Actions for Cauliflower al gorgonzola with chestnut mushrooms' })
    await userEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Cauliflower al gorgonzola with chestnut mushrooms' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Cauliflower al gorgonzola with chestnut mushrooms')
  })

  it('every choice is a row button that runs its action and closes the sheet', async () => {
    stubViewportWidth(390)
    const onHad = vi.fn()
    view(onHad)
    await userEvent.click(screen.getByRole('button', { name: /^Actions for/ }))
    const sheet = screen.getByRole('dialog')
    for (const name of ['Had it', 'Threw it out', 'Freeze it']) expect(within(sheet).getByRole('button', { name })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Had it' }))
    expect(onHad).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the sheet has the 40 px circular Close, and no Cancel (a Menu sheet is dismissed, not cancelled)', async () => {
    stubViewportWidth(390)
    view()
    await userEvent.click(screen.getByRole('button', { name: /^Actions for/ }))
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('close-button')
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('from 768 px nothing changes: the popover, no dialog', async () => {
    stubViewportWidth(1024)
    view()
    await userEvent.click(screen.getByRole('button', { name: /^Actions for/ }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
