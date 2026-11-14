// B9-01 / DS-12: the chapter's BDD scenarios are screen behaviour, which the Go godog suite cannot drive, so each is a vitest
// test named after the scenario (TEAM-BRIEF BDD ruling). The real layout half is page-layout P29 (boundary under 3:1).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { DetailList, DetailRow } from './DetailList'
import { IconButton } from './IconButton'
import { Tile } from './Tile'
import { ToastProvider, useToast, type ToastContent } from './Toast'
import { declarations, readUiCss } from './test-utils'

function Fire({ arg }: { arg: ToastContent }) {
  const { show } = useToast()
  return <button onClick={() => show(arg)}>fire</button>
}

async function toastFor(arg: ToastContent) {
  const user = userEvent.setup()
  const view = render(
    <ToastProvider>
      <Fire arg={arg} />
    </ToastProvider>,
  )
  await user.click(screen.getByText('fire'))
  const toast = document.querySelector('.toast') as HTMLElement
  return { toast, view }
}

describe('DS-12 scenarios', () => {
  it('Every action on a tinted tile has a visible outline', () => {
    render(
      <Tile variant="status" status="spoil">
        <Button variant="secondary">Dismiss</Button>
        <IconButton icon="more" label="More" />
      </Tile>,
    )
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-variant', 'secondary')
    const button = declarations(readUiCss('Button.css'), ".button[data-variant='secondary']")
    expect(button['background']).toBe('var(--color-surface)')
    expect(button['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    const icon = readUiCss('IconButton.css')
    expect(declarations(icon, '.icon-button')['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(declarations(icon, ".tile[data-variant='status'] .icon-button")['background']).toBe('var(--color-surface)')
  })

  it('A sheet with a Cancel button has no Close button', () => {
    render(
      <BottomSheet open onClose={() => {}} onCancel={() => {}} title="Freeze" footer={<Button>Freeze 1.25 portions</Button>}>
        body
      </BottomSheet>,
    )
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    const footer = document.querySelector('.sheet__footer') as HTMLElement
    expect(within(footer).getAllByRole('button')[0]).toHaveAccessibleName('Cancel')
  })

  it('A sheet without a Cancel button has a circular Close', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Menu">
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('button', { name: 'Close' })).toHaveClass('close-button')
    expect(declarations(readUiCss('CloseButton.css'), '.close-button')['border-radius']).toBe('50%')
  })

  it('A success toast has no icon; an error toast shows its icon before its headline', async () => {
    const ok = await toastFor({ status: 'success', title: 'Swapped' })
    expect(ok.toast.querySelector('.toast__title svg')).toBeNull()
    ok.view.unmount()
    const err = await toastFor({ status: 'error', title: "Couldn't save" })
    const title = err.toast.querySelector('.toast__title') as HTMLElement
    expect(title.firstElementChild?.tagName.toLowerCase()).toBe('svg')
  })

  it('A toast with detail has a headline, a subline, a body and real buttons', async () => {
    const { toast } = await toastFor({
      status: 'success',
      title: 'Swapped Tue Breakfast',
      subline: '2 other meals changed',
      body: 'Wed Lunch and Thu Dinner use the Leftovers now.',
      actions: [{ label: 'Review', onClick: () => {} }],
    })
    expect(toast.querySelector('.toast__title')).toHaveTextContent('Swapped Tue Breakfast')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent('2 other meals changed')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Wed Lunch and Thu Dinner use the Leftovers now.')
    expect(within(toast).getByRole('button', { name: 'Review' })).toHaveClass('toast__action')
  })

  it('The Stock shortfall after Cooked lists each Ingredient as a row with its shortfall at the end', () => {
    // The primitive's half; the Shortfall notice itself moves to DetailList in its theme package (PC-02).
    render(
      <DetailList tone="info">
        <DetailRow label="Flour" state="200 g short" detail="The Recipe used 300 g · Stock showed 100 g" />
        <DetailRow label="Eggs" state="none in Stock" />
      </DetailList>,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.lastElementChild).toHaveClass('detail-row__detail')
    expect(rows[0]!.children[1]).toHaveClass('detail-row__state')
    expect(declarations(readUiCss('DetailList.css'), '.detail-row__state')['text-align']).toBe('end')
  })
})
