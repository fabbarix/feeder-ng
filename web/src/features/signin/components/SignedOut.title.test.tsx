// B9-49 (A11Y-01): the signed-out pages name the document. The sign-in page is "Sign in to Feeder" (the one title that does not end
// " · Feeder"); the other signed-out pages are "<h1> · Feeder" (a choice the chapter leaves open: closest to the rule for every other page).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SignedOut } from './SignedOut'

beforeEach(() => {
  document.title = 'Feeder'
})
afterEach(() => vi.unstubAllGlobals())

function at(route: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'pending', email: 'zia@example.test', name: 'Zia Rosa' }), { status: 200 })))
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[route]}>
        <SignedOut />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('SignedOut document titles', () => {
  it.each(['/', '/sign-in', '/sign-in?error=denied', '/sign-in?error=failed'])('the sign-in page at %s is "Sign in to Feeder"', (route) => {
    at(route)
    expect(document.title).toBe('Sign in to Feeder')
  })

  it('the Email not verified page is "Email not verified · Feeder"', () => {
    at('/email-not-verified')
    expect(document.title).toBe('Email not verified · Feeder')
  })

  it('the waiting page is "Waiting for approval · Feeder"', async () => {
    at('/waiting-for-approval')
    await screen.findByRole('heading', { level: 1, name: 'Waiting for approval' })
    expect(document.title).toBe('Waiting for approval · Feeder')
  })

  it('the rate-limit state: "Please try again later · Feeder"', async () => {
    at('/waiting-for-approval?state=limited')
    await screen.findByRole('heading', { level: 1, name: 'Please try again later' })
    expect(document.title).toBe('Please try again later · Feeder')
  })
})
