// The Test connection result: progress, per-check list, mapped errors. Announced politely.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TestResultTile } from './TestResultTile'

const ok = { ok: true, latencyMs: 812, model: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5' }, checks: [{ name: 'key', ok: true }, { name: 'model', ok: true }, { name: 'output', ok: true }] } as const

describe('TestResultTile', () => {
  it('renders nothing visible before a test has run, but keeps its live region', () => {
    render(<TestResultTile running={false} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toBeEmptyDOMElement()
  })
  it('while running says "Testing the connection…"', () => {
    render(<TestResultTile running />)
    expect(within(screen.getByRole('status')).getByText('Testing the connection…')).toBeInTheDocument()
  })
  it('a success lists the three checks and the model', () => {
    render(<TestResultTile running={false} result={{ ...ok, checks: [...ok.checks] }} />)
    const region = screen.getByRole('status')
    for (const t of ['API key accepted', 'Model available', 'Model answered correctly']) expect(within(region).getByText(t)).toBeInTheDocument()
    expect(within(region).getByText('Connected to Claude Haiku 5.5')).toBeInTheDocument()
    expect(within(region).getByText(/0\.8 s/)).toBeInTheDocument()
  })
  it('a failure lists each check, marked passed or failed in text (not colour alone), with the mapped reason', () => {
    render(
      <TestResultTile
        running={false}
        result={{ ok: false, latencyMs: 90, checks: [{ name: 'key', ok: false, code: 'assistant_bad_key' }] }}
      />,
    )
    const region = screen.getByRole('status')
    expect(within(region).getByText("The Recipe Assistant's API key was refused.")).toBeInTheDocument()
    expect(within(region).getByText('Failed')).toBeInTheDocument()
    expect(within(region).queryByText(/Connected to/)).toBeNull()
  })
  it('a request error shows its message as a danger status', () => {
    render(<TestResultTile running={false} errorMessage="A new address needs the key typed again." />)
    expect(within(screen.getByRole('status')).getByText('A new address needs the key typed again.')).toBeInTheDocument()
  })
})
