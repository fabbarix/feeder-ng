import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
// vitest blanks CSS imports (even ?raw), so the stylesheet is read as text, as the ui tests do (ui/test-utils.ts).
const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const css = readFileSync(`${cwd}/src/features/signin/signin.css`, 'utf8')
import { EmailNotVerifiedPage } from './EmailNotVerifiedPage'
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

describe('SignInPage look (5.16)', () => {
  it('shows the Feeder mark above the title, decorative because the title already says "Feeder"', () => {
    const { container } = render(<SignInPage />)
    const mark = container.querySelector('svg.signin__mark')!
    expect(screen.queryByRole('img', { name: 'Feeder' })).toBeNull()
    expect(mark).toHaveAttribute('aria-hidden', 'true')
    expect(mark.querySelector('title')).toBeNull()
    const title = screen.getByRole('heading', { level: 1, name: 'Sign in to Feeder' })
    expect(mark.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('the Google button is a white outlined link with the Google "G" before its label', () => {
    render(<SignInPage />)
    const link = screen.getByRole('link', { name: 'Continue with Google' })
    expect(link.querySelector('[data-google-g]')).not.toBeNull()
    expect(link.querySelector('[data-google-g]')).toHaveAttribute('aria-hidden', 'true')
    expect(link).toHaveAttribute('data-variant', 'google')
    expect(link).toHaveAttribute('href', '/auth/google/login')
  })

  it('centres the card at max-width 400', () => {
    expect(css).toMatch(/max-width:\s*400px/)
    expect(css).toMatch(/margin-inline:\s*auto|margin:\s*0 auto|place-items:\s*center|justify-content:\s*center/)
  })

  it('uses no colour literals in its CSS (tokens only; the Google G is an inline SVG)', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/)
  })
})

describe('EmailNotVerifiedPage', () => {
  it('says Google has not verified the email and offers another Google sign-in', () => {
    render(<EmailNotVerifiedPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Email not verified' })).toBeInTheDocument()
    expect(screen.getByText('Google has not verified this email.')).toBeInTheDocument()
    expect(screen.getByText('Google has not verified this email.').textContent).not.toMatch(/different Google sign-in/i)
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

  it('shows Email not verified at /email-not-verified', () => {
    at('/email-not-verified')
    expect(screen.getByRole('heading', { name: 'Email not verified' })).toBeInTheDocument()
  })

  it('redirects the old /not-invited to the Email not verified page', () => {
    at('/not-invited')
    expect(screen.getByRole('heading', { name: 'Email not verified' })).toBeInTheDocument()
  })
})
