// B9-01 / DS-12 R-A: no tertiary action. A `link` Button exists only inside running text; inside an action surface
// (Tile, Toast, BottomSheet footer, Dialog, OfflineBanner, notices) it logs console.error (lib/actionSurface.ts).
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { ActionSurface } from './lib/actionSurface'
import { Tile } from './Tile'

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => error.mockRestore())

const linkErrors = () => error.mock.calls.filter((c: unknown[]) => /link/i.test(String(c[0])))

describe('Button variant="link" is for running text only (DS-12)', () => {
  it('renders data-variant="link" and stays silent inside a paragraph', () => {
    render(
      <p>
        See the <Button variant="link">Planning rules</Button> for details.
      </p>,
    )
    expect(screen.getByRole('button', { name: 'Planning rules' })).toHaveAttribute('data-variant', 'link')
    expect(linkErrors()).toHaveLength(0)
  })

  it('logs console.error for a link Button inside ActionSurface', () => {
    render(
      <ActionSurface>
        <Button variant="link">Show more</Button>
      </ActionSurface>,
    )
    expect(linkErrors().length).toBeGreaterThan(0)
  })

  it('logs console.error for a link Button inside a Tile', () => {
    render(
      <Tile>
        <Button variant="link">Show more</Button>
      </Tile>,
    )
    expect(linkErrors().length).toBeGreaterThan(0)
  })

  it('logs console.error for a link Button in a BottomSheet footer', () => {
    render(
      <BottomSheet open onClose={() => {}} title="T" footer={<Button variant="link">Later</Button>}>
        body
      </BottomSheet>,
    )
    expect(linkErrors().length).toBeGreaterThan(0)
  })

  it('logs console.error for a link Button in a Dialog action row', () => {
    render(<Dialog open onClose={() => {}} title="T" actions={<Button variant="link">Later</Button>} />)
    expect(linkErrors().length).toBeGreaterThan(0)
  })

  it('a secondary Button inside a Tile is fine', () => {
    render(
      <Tile>
        <Button variant="secondary">Dismiss</Button>
      </Tile>,
    )
    expect(linkErrors()).toHaveLength(0)
  })
})
