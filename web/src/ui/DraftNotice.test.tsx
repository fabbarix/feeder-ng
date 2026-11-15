// B9-18 (SAFE-01 "restored with a DraftNotice (info tile, outline buttons)"): ui/DraftNotice.{tsx,css}.
//
// API pinned here:
//   <DraftNotice title: string  meta?: string  actions: { label: string; onClick: () => void; ariaLabel?: string }[] />
//   An info status Tile (variant status, status info, span full): role="status" labelled by its title, led by the decorative history
//   icon (the safe-01 mock); it never takes focus; the actions are
//   outline (secondary) buttons, size sm, in the order given; at most two actions (a third is a programming error and is not drawn).
//   The words come from lib/drafts/draftCopy.ts (draftCopy.test.ts), so Recipe editor, Import Review and Receipt review agree.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftNotice } from './DraftNotice'
import { declarations, readUiCss } from './test-utils'

const props = {
  title: 'Your unsaved changes are back',
  meta: 'The page closed before you saved, on Sat 14 Nov at 15:02. Feeder kept them on this phone.',
}

describe('DraftNotice', () => {
  it('is an info status tile, a status region named by its title, and it does not take focus', () => {
    render(<DraftNotice {...props} actions={[{ label: 'Discard changes', onClick: () => {} }]} />)
    const region = screen.getByRole('status', { name: 'Your unsaved changes are back' })
    expect(region).toHaveAttribute('data-variant', 'status')
    expect(region).toHaveAttribute('data-status', 'info')
    expect(region).toHaveAttribute('data-span', 'full')
    expect(region).toHaveTextContent(props.meta)
    expect(document.body).toHaveFocus()
  })

  it('the buttons are outline (secondary) buttons, small, never tertiary', () => {
    render(<DraftNotice {...props} actions={[{ label: 'Restore my changes', onClick: () => {} }, { label: 'Discard them', onClick: () => {} }]} />)
    for (const name of ['Restore my changes', 'Discard them']) {
      const b = screen.getByRole('button', { name })
      expect(b).toHaveAttribute('data-variant', 'secondary')
      expect(b).toHaveAttribute('data-size', 'sm')
    }
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Restore my changes', 'Discard them'])
  })

  it('an action calls its handler', async () => {
    const onClick = vi.fn()
    render(<DraftNotice {...props} actions={[{ label: 'Discard changes', onClick }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('an action can carry its own accessible name', () => {
    render(<DraftNotice {...props} actions={[{ label: 'Continue', ariaLabel: 'Continue the Lasagne draft', onClick: () => {} }]} />)
    expect(screen.getByRole('button', { name: 'Continue the Lasagne draft' })).toHaveTextContent('Continue')
  })

  it('the meta is optional', () => {
    render(<DraftNotice title="New Recipe draft: Lasagne" actions={[{ label: 'Continue', onClick: () => {} }]} />)
    expect(within(screen.getByRole('status')).queryByText(/Feeder kept/)).toBeNull()
    expect(document.querySelector('.draft-notice__meta')).toBeNull()
  })

  // Main-session ruling (B9-18 review): the approved safe-01 mock draws the history icon, so the notice has it (decorative).
  it('draws the history icon, decorative, before the title, and no bullet list', () => {
    render(<DraftNotice {...props} actions={[]} />)
    const region = screen.getByRole('status')
    const icons = region.querySelectorAll('svg')
    expect(icons).toHaveLength(1)
    expect(icons[0]).toHaveAttribute('aria-hidden', 'true')
    expect(icons[0]!.compareDocumentPosition(region.querySelector('.draft-notice__title')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(region).toHaveAccessibleName('Your unsaved changes are back')
    expect(region.querySelector('ul, li')).toBeNull()
  })

  it('the stylesheet: title is body-strong, meta is meta; actions are a wrapping row with a gap (no tertiary text button)', () => {
    const css = readUiCss('DraftNotice.css')
    expect(declarations(css, '.draft-notice__title')['font-weight']).toBe('var(--text-body-strong-weight)')
    expect(declarations(css, '.draft-notice__meta')['font-size']).toBe('var(--text-meta-size)')
    const actions = declarations(css, '.draft-notice__actions')
    expect(actions['display']).toBe('flex')
    expect(actions['flex-wrap']).toBe('wrap')
    expect(actions['gap']).toMatch(/--space-/)
  })
})
