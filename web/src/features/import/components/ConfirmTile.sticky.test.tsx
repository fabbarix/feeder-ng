// R2-4 L-03 (Import part). NEW FILE: features/import/** belongs to the Recipe Assistant until WP-E merges; this is red until the R2-4
// Import edits are applied (docs/dev/design/r2-4-stock-shop-cook.md, "Deferred Import edits").
// The Confirm bar is a StickyActionBar with a FormActions row, not a card with its own sticky CSS.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmTile } from './ConfirmTile'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const css = readFileSync(`${cwd}/src/features/import/import.css`, 'utf8')

describe('ConfirmTile as a StickyActionBar', () => {
  it('is a labelled group "Import actions" (the shared bar)', () => {
    render(<ConfirmTile canConfirm busy={false} open={0} onConfirm={() => {}} />)
    const bar = screen.getByRole('group', { name: 'Import actions' })
    expect(bar).toHaveClass('sticky-action-bar')
  })
  it('the Confirm button is the primary of a FormActions row inside the bar', () => {
    render(<ConfirmTile canConfirm busy={false} open={0} onConfirm={() => {}} />)
    const button = screen.getByRole('button', { name: /confirm/i })
    expect(button.closest('.form-actions__primary')).not.toBeNull()
    expect(button.closest('.sticky-action-bar')).not.toBeNull()
  })
  it('says how many questions are open, inside the bar, and keeps Confirm disabled', () => {
    const onConfirm = vi.fn()
    render(<ConfirmTile canConfirm={false} busy={false} open={2} onConfirm={onConfirm} />)
    expect(screen.getByRole('group', { name: 'Import actions' })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
  })
  it('is no Tile any more', () => {
    render(<ConfirmTile canConfirm busy={false} open={0} onConfirm={() => {}} />)
    expect(document.querySelector('.tile')).toBeNull()
  })
  it('import.css no longer has its own sticky confirm rule', () => {
    expect(css).not.toMatch(/\.import-confirm\s*\{[^}]*position:\s*sticky/)
  })
})
