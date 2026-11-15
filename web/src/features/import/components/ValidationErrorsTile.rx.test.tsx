// B9-28 (R-E, DS-06): the errors of a refused file are rows with the JSON path as key and the message as detail, not bullet sentences,
// and a refused file is a warn tile (it loses nothing), not danger.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ValidationErrorsTile } from './ValidationErrorsTile'

import type { FileError } from '../types'

const error: FileError = { kind: 'schema', errors: [{ path: '$.recipes[0].yield', message: 'must be greater than 0' }, { path: '$.recipes[0].ingredients[1].quantity', message: 'must be greater than 0' }] }

describe('ValidationErrorsTile, rows and tone', () => {
  it('lists each error as a row: the path as its key, the message as its detail', () => {
    const { container } = render(<ValidationErrorsTile error={error} />)
    expect(container.querySelector('ul.import-list')).toBeNull()
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.classList.contains('detail-row') || r.classList.contains('list-row'))).toBe(true)
    expect(within(rows[0]!).getByText('$.recipes[0].yield').tagName).toBe('CODE')
    expect(within(rows[0]!).getByText('must be greater than 0')).toBeInTheDocument()
  })
  it('is a warn tile announced as an alert', () => {
    render(<ValidationErrorsTile error={error} />)
    expect(screen.getByRole('alert').closest('[data-status]')).toHaveAttribute('data-status', 'warn')
  })
})
