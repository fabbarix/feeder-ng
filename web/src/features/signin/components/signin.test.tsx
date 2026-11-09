import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { NotInvitedPage } from './NotInvitedPage'
import { SignedOut } from './SignedOut'
import { SignInPage } from './SignInPage'

describe('SignInPage', () => {
  it('invites the visitor to continue with Google', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in to Feeder' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', '/auth/google/login')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('explains a cancelled sign-in', () => {
    render(<SignInPage reason="denied" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/cancelled/i)
    expect(screen.getByRole('link', { name: 'Continue with Google' })).toBeInTheDocument()
  })

  it('explains a failed sign-in', () => {
    render(<SignInPage reason="failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/did not work/i)
  })
})

describe('NotInvitedPage', () => {
  it('says the account is not invited and how to get in', () => {
    render(<NotInvitedPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Not invited' })).toBeInTheDocument()
    expect(screen.getByText(/ask an Admin/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Use a different Google sign-in' })).toHaveAttribute('href', '/auth/google/login')
  })
})

describe('SignedOut', () => {
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <SignedOut />
      </MemoryRouter>,
    )

  it('shows sign-in at the root', () => {
    at('/')
    expect(screen.getByRole('heading', { name: 'Sign in to Feeder' })).toBeInTheDocument()
  })

  it('shows the reason from the query string', () => {
    at('/sign-in?error=failed')
    expect(screen.getByRole('alert')).toHaveTextContent(/did not work/i)
  })

  it('shows Not invited at /not-invited', () => {
    at('/not-invited')
    expect(screen.getByRole('heading', { name: 'Not invited' })).toBeInTheDocument()
  })
})
