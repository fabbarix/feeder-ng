// B9-53 (TB-06, step 2): the Member sheet over Today during first run. Caption "Set up · step 2 of 5 · 1 Member so far" (the sheet's context line), R-B's circular
// Close in the header and NO Cancel in the footer, which holds "Save and add another" (secondary) and "Save" (primary), each on one line. Without `firstRun`
// the sheet is unchanged (MemberEditor.footer.test.tsx). Save and add another keeps the sheet open on an empty form.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { anna } from './fixtures'
import { MemberEditor } from './MemberEditor'

if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}

const CAPTION = 'Set up · step 2 of 5 · 1 Member so far'
function open(over: Record<string, unknown> = {}) {
  const h = { onSave: vi.fn(async () => {}), onSaveAndAddAnother: vi.fn(async () => {}), onClose: vi.fn() }
  render(<MemberEditor open users={[]} members={[anna]} onSave={h.onSave} onClose={h.onClose} firstRun={{ caption: CAPTION, onSaveAndAddAnother: h.onSaveAndAddAnother }} {...over} />)
  return h
}
const dialog = () => screen.getByRole('dialog')
const footer = () => dialog().querySelector('.sheet__footer') as HTMLElement

describe('the first-run Member sheet', () => {
  it('shows the caption above the title, and the caption is part of the dialog\'s name', () => {
    open()
    expect(within(dialog()).getByText(CAPTION)).toBeInTheDocument()
    expect(dialog()).toHaveAccessibleName(expect.stringContaining('step 2 of 5'))
    expect(within(dialog()).getByRole('heading', { name: 'Add Member' })).toBeInTheDocument()
  })

  it('has the circular Close in the header and no Cancel anywhere (R-B)', () => {
    open()
    expect(within(dialog()).getByRole('button', { name: /^Close/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull()
  })

  it('the footer holds "Save and add another" (secondary) then "Save" (primary), and nothing else', () => {
    open()
    const buttons = within(footer()).getAllByRole('button')
    expect(buttons.map((b) => b.textContent!.trim())).toEqual(['Save and add another', 'Save'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'secondary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'primary')
    expect(screen.queryByRole('button', { name: 'Save Member' })).toBeNull()
  })

  it('Save saves through onSave with the Member typed, and does not add another', async () => {
    const h = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Ben')
    await userEvent.click(within(footer()).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(h.onSave).toHaveBeenCalledTimes(1))
    expect(h.onSave).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ben' }), null)
    expect(h.onSaveAndAddAnother).not.toHaveBeenCalled()
  })

  it('Save and add another calls onSaveAndAddAnother, then the form is empty again with focus on Name and the sheet stays open', async () => {
    const h = open()
    await userEvent.type(screen.getByLabelText('Name'), 'Ben')
    await userEvent.click(within(footer()).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(h.onSaveAndAddAnother).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ben' }), null))
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''))
    expect(screen.getByLabelText('Name')).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(h.onSave).not.toHaveBeenCalled()
  })

  it('a refused Save and add another keeps what was typed', async () => {
    const h = open()
    h.onSaveAndAddAnother.mockRejectedValueOnce(new Error('nope'))
    await userEvent.type(screen.getByLabelText('Name'), 'Ben')
    await userEvent.click(within(footer()).getByRole('button', { name: 'Save and add another' }))
    await waitFor(() => expect(h.onSaveAndAddAnother).toHaveBeenCalled())
    expect(screen.getByLabelText('Name')).toHaveValue('Ben')
  })

  it('an empty Name is explained under Name and neither button saves', async () => {
    const h = open()
    await userEvent.click(within(footer()).getByRole('button', { name: 'Save and add another' }))
    expect(h.onSaveAndAddAnother).not.toHaveBeenCalled()
    await userEvent.click(within(footer()).getByRole('button', { name: 'Save' }))
    expect(h.onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Name')).toBeInvalid()
  })

  it('both labels stay on one line: the buttons size to their label (no wrapping class, no fixed width)', () => {
    open()
    for (const b of within(footer()).getAllByRole('button')) {
      expect(b.style.width).toBe('')
      expect(b.querySelectorAll('br')).toHaveLength(0)
    }
  })
})
