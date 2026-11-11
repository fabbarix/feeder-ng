// R2-1: the `info` status (R2-2 depends on it) uses the info colour pair, not a --status-* token.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chip } from './Chip'
import { Tile } from './Tile'
import { declarations, readUiCss } from './test-utils'

describe('status="info"', () => {
  it('Tile variant=status carries it and styles with --color-info-bg/fg', () => {
    render(
      <Tile variant="status" status="info">
        x
      </Tile>,
    )
    expect(screen.getByText('x')).toHaveAttribute('data-status', 'info')
    expect(declarations(readUiCss('Tile.css'), ".tile[data-variant='status'][data-status='info']")).toMatchObject({
      background: 'var(--color-info-bg)',
      color: 'var(--color-info-fg)',
    })
  })
  it.each(['state', 'status'] as const)('Chip kind=%s carries it, shows the info glyph, and styles with --color-info-bg/fg', (kind) => {
    const { container } = render(
      <Chip kind={kind} status="info">
        note
      </Chip>,
    )
    const chip = screen.getByText('note').closest('.chip')!
    expect(chip).toHaveAttribute('data-status', 'info')
    expect(container.querySelector('svg')).not.toBeNull()
    expect(declarations(readUiCss('Chip.css'), `.chip[data-kind='${kind}'][data-status='info']`)).toMatchObject({
      background: 'var(--color-info-bg)',
      color: 'var(--color-info-fg)',
    })
  })
})
