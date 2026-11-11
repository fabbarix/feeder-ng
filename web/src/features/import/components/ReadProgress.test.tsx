// WP-E/G: progress per read state with Cancel; a live region (ra-e-import.md section 6.2, accessibility).
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
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
  it('says where the read is in "Step n of N" for this kind of read, without a second copy of the stage', () => {
    view({ kind: 'photo', state: 'reading' })
    expect(screen.getByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })
  it('shows the stage text once only', () => {
    view({ kind: 'url', state: 'reading' })
    expect(screen.getAllByText('Reading the recipe…')).toHaveLength(1)
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument()
  })
  it('without a state yet it counts from the first step', () => {
    view({ kind: 'text', state: undefined })
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
  })
  it('takes focus when it appears (a group with the progress name), so a keyboard user is not left on a vanished button', () => {
    view()
    const group = screen.getByRole('group', { name: 'Reading the recipe' })
    expect(group).toHaveAttribute('tabindex', '-1')
    expect(group).toHaveFocus()
  })
  it('does not take focus again when the stage changes', async () => {
    const { rerender, props } = view({ state: 'fetching' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    cancel.focus()
    rerender(<ReadProgress {...props} state="reading" />)
    expect(cancel).toHaveFocus()
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
    it('is rendered empty first and filled afterwards, so the first stage is announced', () => {
      const html = renderToString(<ReadProgress kind="url" state="fetching" elapsedSeconds={0} onCancel={() => undefined} />)
      expect(html).toMatch(/<p[^>]*role="status"[^>]*><\/p>/)
      view({ state: 'fetching' })
      expect(screen.getByRole('status')).toHaveTextContent('Opening the page…')
    })
    it('announces only the stage: not the step count, not the seconds, not Cancel', () => {
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
