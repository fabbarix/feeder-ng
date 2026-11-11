// WP-E/G: progress per read state with Cancel; a live region (ra-e-import.md section 6.2, accessibility).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReadProgress } from './ReadProgress'

type Props = Parameters<typeof ReadProgress>[0]
const view = (over: Partial<Props> = {}) => {
  const onCancel = vi.fn()
  const props: Props = { kind: 'url', state: 'fetching', elapsedSeconds: 0, onCancel, ...over }
  const r = render(<ReadProgress {...props} />)
  return { onCancel, props, ...r }
}

describe('ReadProgress', () => {
  it.each([
    ['url', 'fetching', 'Opening the page…'],
    ['photo', 'preparing', 'Preparing the photos…'],
    ['text', 'reading', 'Reading the recipe…'],
    ['url', 'checking', 'Checking the result…'],
    ['url', 'images', 'Fetching photos…'],
  ] as const)('%s read in state %s says "%s"', (kind, state, text) => {
    view({ kind, state })
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })
  it('has Cancel, which cancels', async () => {
    const { onCancel } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
  it('lists the stages of this kind of read and marks the current one', () => {
    view({ kind: 'photo', state: 'reading' })
    const items = within(screen.getByRole('list', { name: 'Steps' })).getAllByRole('listitem')
    expect(items.map((i) => i.textContent)).toEqual(['Preparing the photos…', 'Reading the recipe…', 'Checking the result…'])
    expect(items.map((i) => i.getAttribute('aria-current'))).toEqual([null, 'step', null])
  })
  it('shows an indeterminate bar (no fake percentage)', () => {
    view()
    const bar = screen.getByRole('progressbar')
    expect(bar).not.toHaveAttribute('aria-valuenow')
    expect(bar).toHaveAccessibleName(/Reading|Opening|recipe/i)
  })

  describe('live region', () => {
    it('is one polite status region that stays in the document while the state changes (changes are announced)', () => {
      const { rerender, props } = view({ state: 'fetching' })
      const region = screen.getByRole('status')
      expect(region).toHaveAttribute('aria-live', 'polite')
      rerender(<ReadProgress {...props} state="reading" />)
      expect(screen.getByRole('status')).toBe(region)
      expect(region).toHaveTextContent('Reading the recipe…')
    })
    it('announces only the stage: not the stage list, not the seconds, not Cancel', () => {
      view({ kind: 'url', state: 'reading', elapsedSeconds: 45 })
      expect(screen.getByRole('status').textContent?.trim()).toBe('Reading the recipe…')
    })
    it('is not assertive (a progress update must not interrupt)', () => {
      view()
      expect(document.querySelector('[aria-live="assertive"]')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })
  })

  describe('"Still working…"', () => {
    it('is hidden for the first 19 s', () => {
      view({ elapsedSeconds: 19 })
      expect(screen.queryByText(/Still working/)).toBeNull()
    })
    it('shows from 20 s', () => {
      view({ elapsedSeconds: 25 })
      expect(screen.getByText('Still working… 25 s')).toBeInTheDocument()
    })
  })

  it('without a state yet (the POST just answered) it still says something useful', () => {
    view({ state: undefined, kind: 'text' })
    expect(screen.getByRole('status')).toHaveTextContent('Reading the recipe…')
  })
})
