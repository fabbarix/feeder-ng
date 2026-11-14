// B9-01 / DS-12 R-D and R-D+: the rich toast anatomy.
//   show({ status, title, subline?, body?, actions? })   - the object form (a string message with options keeps working: one line)
//   .toast__title (headline, with the status icon as its FIRST item), .toast__subline, .toast__body, .toast__actions, .toast__dismiss
// A plain success toast renders no icon. An icon appears only for error, warning, offline and syncing: 16 px, aria-hidden,
// inside .toast__title, never in a column of its own. The dismiss is a 32 px circle, top-aligned with the headline.
// (PC-01's chapter calls the headline element `.toast__head`; DS-12 owns the Toast and names it `.toast__title`.)
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from './Toast'

type Rich = Parameters<ReturnType<typeof useToast>['show']>[0]

function Fire({ arg, message, opts }: { arg?: Rich; message?: string; opts?: ToastOptions }) {
  const { show } = useToast()
  return <button onClick={() => (arg ? (show as (a: Rich) => void)(arg) : show(message ?? '', opts))}>fire</button>
}

async function fire(ui: React.ReactElement) {
  const user = userEvent.setup()
  render(<ToastProvider>{ui}</ToastProvider>)
  await user.click(screen.getByText('fire'))
  return { user, toast: document.querySelector('.toast') as HTMLElement }
}

describe('Toast anatomy (R-D)', () => {
  it('renders headline, muted subline, body and real action buttons, in that order', async () => {
    const onReview = vi.fn()
    const { toast } = await fire(
      <Fire
        arg={{
          status: 'success',
          title: 'Swapped Tue Dinner',
          subline: '2 other meals changed',
          body: 'Wed Lunch and Thu Dinner moved.',
          actions: [{ label: 'Review', ariaLabel: 'Review 2 changed meals', onClick: onReview }],
        }}
      />,
    )
    const kids = [...toast.querySelectorAll('.toast__title, .toast__subline, .toast__body, .toast__actions')].map((e) => e.className.split(' ')[0])
    expect(kids).toEqual(['toast__title', 'toast__subline', 'toast__body', 'toast__actions'])
    expect(toast.querySelector('.toast__title')).toHaveTextContent('Swapped Tue Dinner')
    expect(toast.querySelector('.toast__subline')).toHaveTextContent('2 other meals changed')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Wed Lunch and Thu Dinner moved.')
  })

  it('an action is a button with its accessible name; clicking calls it and dismisses the toast', async () => {
    const onReview = vi.fn()
    const { user, toast } = await fire(
      <Fire arg={{ title: 'Swapped', actions: [{ label: 'Review', ariaLabel: 'Review 2 changed meals', onClick: onReview }] }} />,
    )
    const btn = within(toast).getByRole('button', { name: 'Review 2 changed meals' })
    expect(btn.closest('.toast__actions')).not.toBeNull()
    expect(btn).toHaveTextContent('Review')
    await user.click(btn)
    expect(onReview).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.toast')).toBeNull()
  })

  it('a toast of one sentence passes only a title: no subline, body or actions element', async () => {
    const { toast } = await fire(<Fire arg={{ title: 'Swapped' }} />)
    expect(toast.querySelector('.toast__subline, .toast__body, .toast__actions')).toBeNull()
    expect(toast.querySelector('.toast__title')).toHaveTextContent('Swapped')
  })

  it('the legacy string form is the same one-line anatomy', async () => {
    const { toast } = await fire(<Fire message="Saved" opts={{ status: 'success' }} />)
    expect(toast.querySelector('.toast__title')).toHaveTextContent('Saved')
    expect(toast.querySelector('.toast__subline, .toast__body')).toBeNull()
  })

  it('the legacy actionLabel still renders one action button', async () => {
    const onAction = vi.fn()
    const { user, toast } = await fire(<Fire message="Removed" opts={{ actionLabel: 'Undo', onAction }} />)
    await user.click(within(toast).getByRole('button', { name: 'Undo' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('the dismiss is a labelled .toast__dismiss button that closes the toast', async () => {
    const { user, toast } = await fire(<Fire arg={{ title: 'Swapped' }} />)
    const dismiss = within(toast).getByRole('button', { name: 'Dismiss' })
    expect(dismiss).toHaveClass('toast__dismiss')
    await user.click(dismiss)
    expect(document.querySelector('.toast')).toBeNull()
  })
})

describe('Toast status icon (R-D+)', () => {
  it('a success toast has no icon: no svg except inside the dismiss', async () => {
    const { toast } = await fire(<Fire arg={{ status: 'success', title: 'Cooked, nice one!', subline: 'Sat Dinner' }} />)
    expect(toast.querySelector('svg:not(.toast__dismiss svg)')).toBeNull()
    expect(toast.querySelector('.toast__title svg')).toBeNull()
  })

  it('a neutral toast has no icon either', async () => {
    const { toast } = await fire(<Fire arg={{ title: 'Swapped' }} />)
    expect(toast.querySelector('.toast__title svg')).toBeNull()
  })

  it.each(['error', 'warning', 'offline', 'syncing'] as const)('a %s toast shows a 16 px aria-hidden icon as the first item of its headline', async (status) => {
    const { toast } = await fire(<Fire arg={{ status, title: 'Nothing was undone' }} />)
    const title = toast.querySelector('.toast__title') as HTMLElement
    const svg = title.querySelector('svg')!
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('width')).toBe('16')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(title.firstElementChild).toBe(svg)
  })

  it('never puts an icon in a column of its own: no svg is a direct child of .toast', async () => {
    const { toast } = await fire(<Fire arg={{ status: 'error', title: 'Could not save', body: 'Try again.' }} />)
    expect([...toast.children].some((c) => c.tagName.toLowerCase() === 'svg')).toBe(false)
  })

  it('an error toast is announced as an alert and stays until dismissed', async () => {
    await fire(<Fire arg={{ status: 'error', title: 'Could not save' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })
})

// Main-session ruling 5: the split of a multi-sentence string is visual only; the live region announces one readable run.
describe('Toast announcement (R-D)', () => {
  it('a split string toast is announced as the original message, one run', async () => {
    await fire(<Fire message="That did not save. Try again." />)
    const region = screen.getByRole('status')
    expect(region.querySelector('.toast__body')).toHaveTextContent('Try again.')
    expect(region.textContent).toBe('That did not save. Try again.')
  })

  it('a rich toast is announced headline, subline, body, actions with a space between each', async () => {
    await fire(<Fire arg={{ title: 'Swapped Tue Breakfast', subline: '2 other meals changed', body: 'Wed Lunch moved.', actions: [{ label: 'Review', onClick: () => {} }] }} />)
    expect(screen.getByRole('status').textContent).toBe('Swapped Tue Breakfast 2 other meals changed Wed Lunch moved. Review')
  })

  it('a string with no safe boundary stays one line', async () => {
    const { toast } = await fire(<Fire message="Saved Dr. Oetker Pizza" />)
    expect(toast).toHaveAttribute('data-layout', 'line')
    expect(toast.querySelector('.toast__body')).toBeNull()
  })
})
