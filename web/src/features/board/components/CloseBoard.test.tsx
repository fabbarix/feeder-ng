// B9-47 (TB-04, A11Y-12): the board's way out. A round "Close kitchen board": a link to Today when the board was opened directly
// (location.key === 'default'), a button that goes back one entry when it was opened from inside the app. It dims after 10 s idle.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CloseBoard } from './CloseBoard'

const at = (entries: string[], index: number, idle = false) =>
  render(
    <MemoryRouter initialEntries={entries} initialIndex={index}>
      <Routes>
        <Route path="/board" element={<CloseBoard idle={idle} />} />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('CloseBoard', () => {
  it('opened directly (the first entry of the session) it is a link to Today named "Close kitchen board"', () => {
    at(['/board'], 0)
    const link = screen.getByRole('link', { name: 'Close kitchen board' })
    expect(link).toHaveAttribute('href', '/')
    expect(screen.queryByRole('button', { name: 'Close kitchen board' })).not.toBeInTheDocument()
  })

  it('opened from inside the app it is a button, and goes back one entry (to where the board was opened)', async () => {
    at(['/settings', '/board'], 1)
    await userEvent.click(screen.getByRole('button', { name: 'Close kitchen board' }))
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
  })

  it('opened directly, activating it goes to Today', async () => {
    at(['/board'], 0)
    await userEvent.click(screen.getByRole('link', { name: 'Close kitchen board' }))
    expect(await screen.findByText('elsewhere')).toBeInTheDocument()
  })

  it('is the board\'s round control: .board-close with an X icon that no screen reader reads', () => {
    const { container } = at(['/board'], 0)
    const close = container.querySelector('.board-close')!
    expect(close).not.toBeNull()
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('dims when idle (data-idle="true"), and is at full strength otherwise', () => {
    const { container, rerender } = at(['/board'], 0, false)
    expect(container.querySelector('.board-close')).not.toHaveAttribute('data-idle', 'true')
    rerender(
      <MemoryRouter initialEntries={['/board']}>
        <Routes>
          <Route path="/board" element={<CloseBoard idle />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(container.querySelector('.board-close')).toHaveAttribute('data-idle', 'true')
  })

  it('stays focusable while dimmed (it dims, it does not hide)', () => {
    at(['/board'], 0, true)
    expect(screen.getByRole('link', { name: 'Close kitchen board' })).not.toHaveAttribute('tabindex', '-1')
  })
})
