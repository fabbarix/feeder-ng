// beta.7 (page-layout guard P4 on /supplies/:id): the Restock level is a number, so its field is a short one (size sm, at most
// 240 px from 820 px), not the full-width text field the guard measured at 300 to 314 px.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RestockLevelTile } from './RestockLevelTile'

describe('RestockLevelTile', () => {
  it('shows the Restock level in a short field (data-size sm)', () => {
    render(<RestockLevelTile level={1000} baseUnit="ml" system="metric" onSave={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: /Restock level/ }).closest('[data-size]')).toHaveAttribute('data-size', 'sm')
  })
})
