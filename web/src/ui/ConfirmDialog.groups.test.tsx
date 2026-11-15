// B9-18 (SAFE R1 "ConfirmDialog rules", leave dialog SAFE-01): ConfirmDialog grows `groups`, `details`, `note` and `focus`.
//
// API pinned here (ui/ConfirmDialog.tsx; every existing prop keeps working):
//   ConfirmRow    = { key: string; state?: string; detail?: string }               an R-E DetailRow (key body-strong, state at the end, muted detail)
//   ConfirmGroup  = { label: string; rows: ConfirmRow[] }                          "Goes", "Stays", "Goes with Sam": a small uppercase label over DetailList rows
//   ConfirmOptions.groups?: ConfirmGroup[]                                         after the body, in order
//   ConfirmOptions.details?: { summary: string; rows: ConfirmRow[] }               a longer set behind a one-line <details> summary (closed by default)
//   ConfirmOptions.note?: string                                                   one muted meta line last ("You can undo it straight after.")
//   ConfirmOptions.focus?: 'cancel' | 'confirm'                                    default 'cancel' in EVERY tone: the safe button has focus on open;
//                                                                                  'confirm' only for questions that lose nothing
//   body: the first paragraph is the lead line (weight 600 through .confirm-dialog__lead); more paragraphs stay plain
// No Close button, ever (R-B). Cancel is the outline button; Escape is Cancel. On close, focus returns to the opener.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, ConfirmProvider, useConfirm } from './ConfirmDialog'
import { declarations, readUiCss } from './test-utils'

const base = { open: true, title: 'Remove Sam?', confirmLabel: 'Remove Sam', onConfirm: () => {}, onCancel: () => {} }

describe('groups: R-E rows under a small label, never bullet sentences', () => {
  const groups = [
    { label: 'Goes with Sam', rows: [{ key: 'Sign-in', state: 'Ends', detail: 'sam@example.com · not on the Allowlist' }, { key: 'Preferences', state: '7' }] },
    { label: 'Stays', rows: [{ key: 'Cooked history', state: 'Kept' }] },
  ]

  it('each group is a labelled DetailList: the label, then one row per item with key, state and detail', () => {
    render(<ConfirmDialog {...base} body="Sam no longer counts towards portions." groups={groups} tone="danger" />)
    const dialog = screen.getByRole('dialog', { name: 'Remove Sam?' })
    const lists = within(dialog).getAllByRole('list')
    expect(lists).toHaveLength(2)
    expect(within(dialog).getByText('Goes with Sam')).toBeInTheDocument()
    expect(within(dialog).getByText('Stays')).toBeInTheDocument()
    const rows = within(lists[0]!).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.querySelector('.detail-row__label')).toHaveTextContent('Sign-in')
    expect(rows[0]!.querySelector('.detail-row__state')).toHaveTextContent('Ends')
    expect(rows[0]!.querySelector('.detail-row__detail')).toHaveTextContent('sam@example.com · not on the Allowlist')
    expect(rows[1]!.querySelector('.detail-row__detail')).toBeNull()
  })

  it('the group label names its list for a screen reader (aria-labelledby)', () => {
    render(<ConfirmDialog {...base} groups={groups} tone="danger" />)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('list', { name: 'Goes with Sam' })).toBeInTheDocument()
    expect(within(dialog).getByRole('list', { name: 'Stays' })).toBeInTheDocument()
  })

  it('groups come after the body and before the note and the buttons', () => {
    render(<ConfirmDialog {...base} body="Lead." groups={groups} note="You can undo it straight after." tone="danger" />)
    const order = [...screen.getByRole('dialog').querySelectorAll('.confirm-dialog__lead, .confirm-dialog__group, .confirm-dialog__note, .dialog__actions')].map((e) => e.className.split(' ')[0])
    expect(order).toEqual(['confirm-dialog__lead', 'confirm-dialog__group', 'confirm-dialog__group', 'confirm-dialog__note', 'dialog__actions'])
  })

  it('a group with no rows is not drawn', () => {
    render(<ConfirmDialog {...base} groups={[{ label: 'Goes', rows: [] }, groups[1]!]} tone="danger" />)
    expect(screen.queryByText('Goes')).toBeNull()
    expect(screen.getByText('Stays')).toBeInTheDocument()
  })

  it('never renders bullet sentences: rows are DetailRow list items, the body has no list', () => {
    render(<ConfirmDialog {...base} body={['One.', 'Two.']} tone="danger" />)
    expect(screen.queryByRole('list')).toBeNull()
  })
})

describe('details: a longer set behind a one-line summary', () => {
  const details = { summary: '1 Bought Planned Meal is replaced', rows: [{ key: 'Fri Dinner', state: 'Replaced', detail: 'Bought: Passata' }] }

  it('is a <details> with a summary, closed by default, with the same rows when open', async () => {
    render(<ConfirmDialog {...base} details={details} tone="danger" />)
    const el = screen.getByRole('dialog').querySelector('details')!
    expect(el).not.toBeNull()
    expect(el.open).toBe(false)
    expect(el.querySelector('summary')).toHaveTextContent('1 Bought Planned Meal is replaced')
    await userEvent.click(el.querySelector('summary')!)
    expect(el.open).toBe(true)
    const rows = within(el).getAllByRole('listitem')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.querySelector('.detail-row__state')).toHaveTextContent('Replaced')
  })

  it('the summary is a 32 px row with its own chevron: no native marker (CSS)', () => {
    const css = readUiCss('ConfirmDialog.css')
    expect(css).toMatch(/summary::-webkit-details-marker/)
    expect(declarations(css, '.confirm-dialog__summary')['min-block-size']).toBe('var(--space-8)')
  })
})

describe('note and lead', () => {
  it('the note is one muted meta line, the lead is the first paragraph', () => {
    render(<ConfirmDialog {...base} body={['Sam no longer counts towards portions.', 'Second paragraph.']} note="This can't be undone." tone="danger" />)
    const dialog = screen.getByRole('dialog')
    expect(dialog.querySelector('.confirm-dialog__lead')).toHaveTextContent('Sam no longer counts towards portions.')
    expect(dialog.querySelectorAll('.confirm-dialog__body')).toHaveLength(1)
    expect(dialog.querySelector('.confirm-dialog__note')).toHaveTextContent("This can't be undone.")
  })

  it('the lead is weight 600 and the note is meta and muted (CSS)', () => {
    const css = readUiCss('ConfirmDialog.css')
    expect(declarations(css, '.confirm-dialog__lead')['font-weight']).toBe('600')
    const note = declarations(css, '.confirm-dialog__note')
    expect(note['font-size']).toBe('var(--text-meta-size)')
    expect(note['color']).toMatch(/--color-text-muted|--color-muted/)
  })
})

describe('focus: the safe button on open, in every confirm', () => {
  it('a DEFAULT-tone confirm focuses Cancel too (it used to focus the confirm button)', () => {
    render(<ConfirmDialog {...base} title="Discard changes?" confirmLabel="Discard changes" />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('a danger confirm focuses Cancel; the cancelLabel names the safe button ("Keep editing")', () => {
    render(<ConfirmDialog {...base} tone="danger" cancelLabel="Keep editing" confirmLabel="Discard changes" />)
    expect(screen.getByRole('button', { name: 'Keep editing' })).toHaveFocus()
  })

  it("focus: 'confirm' puts the focus on the confirming button (a question that loses nothing)", () => {
    render(<ConfirmDialog {...base} title="Mark all cooked?" confirmLabel="Mark all cooked" focus="confirm" />)
    expect(screen.getByRole('button', { name: 'Mark all cooked' })).toHaveFocus()
  })

  it("focus: 'confirm' on a danger confirm is ignored: a danger confirm always focuses the safe button", () => {
    render(<ConfirmDialog {...base} tone="danger" focus="confirm" />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
  })

  it('has no Close button; Escape is Cancel', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} tone="danger" onCancel={onCancel} />)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('the scrim dismisses only in the default tone (unchanged)', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} tone="danger" onCancel={onCancel} />)
    screen.getByRole('dialog').click()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('on close, focus returns to the opener', async () => {
    function Opener() {
      const { confirm } = useConfirm()
      const ref = useRef<HTMLButtonElement>(null)
      const [done, setDone] = useState('')
      return (
        <>
          <button ref={ref} onClick={async () => setDone((await confirm({ title: 'Remove Sam?', confirmLabel: 'Remove', tone: 'danger' })) ? 'yes' : 'no')}>
            open
          </button>
          <output>{done}</output>
        </>
      )
    }
    render(
      <ConfirmProvider>
        <Opener />
      </ConfirmProvider>,
    )
    const opener = screen.getByRole('button', { name: 'open' })
    await userEvent.click(opener)
    await userEvent.keyboard('{Escape}')
    expect(await screen.findByText('no')).toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

describe('through useConfirm: groups, details, note and focus travel in the options', () => {
  it('confirm({ groups, details, note, focus }) renders them', async () => {
    function Opener() {
      const { confirm } = useConfirm()
      return (
        <button
          onClick={() =>
            void confirm({
              title: 'Regenerate the plan?',
              confirmLabel: 'Regenerate',
              groups: [{ label: 'Goes', rows: [{ key: 'Unpinned meals', state: '18' }] }],
              details: { summary: '1 Bought meal', rows: [{ key: 'Fri Dinner' }] },
              note: 'You can undo it straight after.',
              focus: 'confirm',
            })
          }
        >
          open
        </button>
      )
    }
    render(
      <ConfirmProvider>
        <Opener />
      </ConfirmProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'open' }))
    const dialog = screen.getByRole('dialog', { name: 'Regenerate the plan?' })
    expect(within(dialog).getByText('Unpinned meals')).toBeInTheDocument()
    expect(within(dialog).getByText('1 Bought meal')).toBeInTheDocument()
    expect(within(dialog).getByText('You can undo it straight after.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Regenerate' })).toHaveFocus()
  })
})
