import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { importStrings as s } from '../strings'
import { ImportSource } from './ImportSource'

describe('ImportSource', () => {
  it('submits pasted JSON', async () => {
    const onSubmit = vi.fn()
    render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const review = screen.getByRole('button', { name: s.review })
    expect(review).toBeDisabled()
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{"format":"feeder-recipe-file"}')
    expect(review).toBeEnabled()
    await userEvent.click(review)
    expect(onSubmit).toHaveBeenCalledWith('{"format":"feeder-recipe-file"}')
  })
  it('submits the text of an uploaded file', async () => {
    const onSubmit = vi.fn()
    render(<ImportSource busy={false} onSubmit={onSubmit} />)
    const file = new File(['{"a":1}'], 'soup.feeder.json', { type: 'application/json' })
    await userEvent.upload(screen.getByLabelText(s.uploadLabel), file)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('{"a":1}'))
  })
  it('is disabled while busy', async () => {
    render(<ImportSource busy onSubmit={vi.fn()} />)
    await userEvent.click(screen.getByLabelText(s.pasteLabel))
    await userEvent.paste('{}')
    expect(screen.getByRole('button', { name: s.review })).toBeDisabled()
  })
})
