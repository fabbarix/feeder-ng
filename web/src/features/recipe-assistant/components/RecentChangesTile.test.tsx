import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { settingsOn } from '../fixtures'
import { RecentChangesTile } from './RecentChangesTile'

const NOW = new Date('2026-11-10T12:00:00Z')

describe('RecentChangesTile', () => {
  it('is a labelled section with one row per change, newest first as given', () => {
    render(<RecentChangesTile changes={settingsOn.changes} now={NOW} />)
    const section = screen.getByRole('region', { name: 'Recent changes' })
    const items = within(section).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Anna changed the model to Claude Sonnet 5.5')
    expect(items[0]).toHaveTextContent('2 h ago')
    expect(items[1]).toHaveTextContent('Anna turned the Recipe Assistant on')
  })
  it('says so when there are none', () => {
    render(<RecentChangesTile changes={[]} now={NOW} />)
    expect(screen.getByText('No changes yet.')).toBeInTheDocument()
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})
