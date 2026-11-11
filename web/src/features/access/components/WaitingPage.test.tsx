import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { WaitingPage } from './WaitingPage'

const renderPage = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('WaitingPage', () => {
  it('tells the visitor an approval is pending and shows only their own Google details', () => {
    renderPage(<WaitingPage kind="waiting" status={{ status: 'pending', email: 'zia@example.test', name: 'Zia Rosa' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeInTheDocument()
    expect(screen.getByText(/someone in the household/i)).toBeInTheDocument()
    expect(screen.getByText('Zia Rosa')).toBeInTheDocument()
    expect(screen.getByText('zia@example.test')).toBeInTheDocument()
  })

  it('does not name the household, its Users or its Members', () => {
    const { container } = renderPage(<WaitingPage kind="waiting" status={{ status: 'pending', email: 'zia@example.test', name: 'Zia' }} />)
    expect(container.textContent).not.toMatch(/admin@|user@|recipe|meal plan|shopping/i)
  })

  it('offers a different Google account and a way back to check', () => {
    renderPage(<WaitingPage kind="waiting" status={{ status: 'pending', email: 'zia@example.test', name: 'Zia' }} />)
    expect(screen.getByRole('link', { name: 'Use a different Google sign-in' })).toHaveAttribute('href', '/auth/google/login')
  })

  it('says the request was answered when the status is none, and invites a new sign-in', () => {
    renderPage(<WaitingPage kind="waiting" status={{ status: 'none' }} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Request answered' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toHaveAttribute('href', '/auth/google/login')
  })

  it('explains a rate limit without creating false hope', () => {
    renderPage(<WaitingPage kind="limited" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Please try again later' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/too many|a little while/i)
  })

  it('explains a full queue', () => {
    renderPage(<WaitingPage kind="full" />)
    expect(screen.getByRole('heading', { level: 1, name: 'Too many requests right now' })).toBeInTheDocument()
    expect(screen.getByText(/ask someone in the household to add you directly/i)).toBeInTheDocument()
  })
})
