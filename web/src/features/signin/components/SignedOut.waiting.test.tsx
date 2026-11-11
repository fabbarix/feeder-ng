import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignedOut } from './SignedOut'

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

describe('SignedOut (A1)', () => {
  it('shows the waiting page at /waiting-for-approval', async () => {
    at('/waiting-for-approval')
    expect(await screen.findByRole('heading', { level: 1, name: 'Waiting for approval' })).toBeInTheDocument()
    expect(await screen.findByText('zia@example.test')).toBeInTheDocument()
  })

  it('shows the rate-limit message at ?state=limited', async () => {
    at('/waiting-for-approval?state=limited')
    expect(await screen.findByRole('heading', { level: 1, name: 'Please try again later' })).toBeInTheDocument()
  })

  it('still shows Not invited for an unverified address', () => {
    at('/not-invited')
    expect(screen.getByRole('heading', { level: 1, name: 'Not invited' })).toBeInTheDocument()
  })
})
