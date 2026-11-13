import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDialog, ConfirmProvider, useConfirm, type ConfirmChoice } from './ConfirmDialog'

const base = { open: true, title: 'Delete Chicken tikka traybake?', body: 'It is removed from future Planned Meals.', confirmLabel: 'Delete' }

describe('ConfirmDialog', () => {
  it('shows title, body, Cancel and the confirm label', () => {
    render(<ConfirmDialog {...base} onConfirm={() => {}} onCancel={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Delete Chicken tikka traybake?' })
    expect(dialog).toHaveTextContent('It is removed from future Planned Meals.')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('a danger confirm focuses Cancel first, ignores the backdrop, and Escape cancels', async () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} tone="danger" onConfirm={() => {}} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).not.toHaveBeenCalled()
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('a default confirm focuses the confirm button and the backdrop cancels', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...base} confirmLabel="Save" onConfirm={() => {}} onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus()
    fireEvent.click(screen.getByRole('dialog'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('fires onConfirm, onCancel and onAlternate from their buttons; custom cancel label', async () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const onAlternate = vi.fn()
    render(
      <ConfirmDialog {...base} cancelLabel="Keep it" alternateLabel="Archive instead" onConfirm={onConfirm} onCancel={onCancel} onAlternate={onAlternate} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Archive instead' }))
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onAlternate).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

function Ask(props: { onResult: (r: boolean | ConfirmChoice) => void; alternate?: boolean }) {
  const { confirm, choose } = useConfirm()
  return (
    <button
      onClick={async () => {
        const opts = { title: 'Delete it?', confirmLabel: 'Delete', tone: 'danger' as const, alternateLabel: props.alternate ? 'Archive instead' : undefined }
        props.onResult(props.alternate ? await choose(opts) : await confirm(opts))
      }}
    >
      Ask
    </button>
  )
}

describe('useConfirm', () => {
  it('resolves true on confirm and false on Cancel', async () => {
    const results: unknown[] = []
    render(<ConfirmProvider><Ask onResult={(r) => results.push(r)} /></ConfirmProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(results).toEqual([true, false])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('resolves false on Escape and returns focus to the trigger', async () => {
    const results: unknown[] = []
    render(<ConfirmProvider><Ask onResult={(r) => results.push(r)} /></ConfirmProvider>)
    const trigger = screen.getByRole('button', { name: 'Ask' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(results).toEqual([false])
    expect(trigger).toHaveFocus()
  })

  it('choose() distinguishes confirm, alternate and cancel', async () => {
    const results: unknown[] = []
    render(<ConfirmProvider><Ask alternate onResult={(r) => results.push(r)} /></ConfirmProvider>)
    for (const name of ['Archive instead', 'Delete', 'Cancel']) {
      await userEvent.click(screen.getByRole('button', { name: 'Ask' }))
      await userEvent.click(screen.getByRole('button', { name }))
    }
    expect(results).toEqual(['alternate', 'confirm', 'cancel'])
  })

  it('queues a second request made while one is open', async () => {
    const results: string[] = []
    function Two() {
      const { confirm } = useConfirm()
      const [started, setStarted] = useState(false)
      return (
        <button
          disabled={started}
          onClick={() => {
            setStarted(true)
            void confirm({ title: 'First?', confirmLabel: 'Yes' }).then((r) => results.push(`first:${r}`))
            void confirm({ title: 'Second?', confirmLabel: 'Yes' }).then((r) => results.push(`second:${r}`))
          }}
        >
          Go
        </button>
      )
    }
    render(<ConfirmProvider><Two /></ConfirmProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByRole('dialog', { name: 'First?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(await screen.findByRole('dialog', { name: 'Second?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(results).toEqual(['first:true', 'second:false'])
  })

  it('fails loudly outside a ConfirmProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Ask onResult={() => {}} />)).toThrow(/ConfirmProvider/)
    spy.mockRestore()
  })
})

describe('ConfirmDialog: body line breaks', () => {
  it('keeps the line breaks of a multi-line body (one line per item reads as lines)', () => {
    render(<ConfirmDialog {...base} body={'Replaces 3 meals.\nTue Dinner: Stew\nWed Lunch: Pie'} onConfirm={() => {}} onCancel={() => {}} />)
    const body = screen.getByText(/Replaces 3 meals\./)
    expect(body).toHaveTextContent('Tue Dinner: Stew')
    expect(getComputedStyle(body).whiteSpace).toBe('pre-line')
  })
})
