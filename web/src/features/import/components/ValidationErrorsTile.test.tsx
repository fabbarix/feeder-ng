import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { importStrings as s } from '../strings'
import { ValidationErrorsTile } from './ValidationErrorsTile'

describe('ValidationErrorsTile', () => {
  it('lists every schema error with its JSON path', () => {
    render(
      <ValidationErrorsTile
        error={{ kind: 'schema', errors: [
          { path: '$.recipes[0].yield', message: 'must be greater than 0' },
          { path: '$.recipes[0].ingredients[1].quantity', message: 'must be greater than 0' },
        ] }}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(s.errorsTitle)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('$.recipes[0].yield').tagName).toBe('CODE')
    expect(screen.getByText('$.recipes[0].ingredients[1].quantity')).toBeInTheDocument()
  })
  it.each([
    [{ kind: 'version', version: '2' } as const, s.unsupportedVersion('2')],
    [{ kind: 'syntax' } as const, s.notJson],
    [{ kind: 'tooLarge' } as const, s.tooLarge],
    [{ kind: 'other', message: 'Boom' } as const, 'Boom'],
  ])('says what is wrong for %j', (error, text) => {
    render(<ValidationErrorsTile error={error} />)
    expect(screen.getByRole('alert')).toHaveTextContent(text)
  })
})
