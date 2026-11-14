// Beta 7: each photo row has Edit beside Remove (design 3.2, mock-up 13: "Edit · Remove").
// Pinned API of ./ReceiptPhotoList:
//   <ReceiptPhotoList photos disabled onRemove onEdit />
//     onEdit(id: string): void      new, required. A button per row, accessible name "Edit photo N" (N = 1-based position), before Remove
//     disabled: true disables Edit and Remove together (a read runs, or photos are being prepared)
//   The row's thumbnail is the photo's previewUrl, so an edited photo (a new previewUrl) shows the edited image.
//   Focus after the sheet closes is the screen's job (it focuses the row's Edit button); this list only has to make that button findable by name.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ReceiptPhotoList } from './ReceiptPhotoList'

const photo = (n: number, url = `blob:p/${n}`) => ({ id: `p${n}`, previewUrl: url, dataUrl: `data:image/jpeg;base64,${n}`, width: 1500, height: 2000 })
function view(n = 2, over: Partial<Parameters<typeof ReceiptPhotoList>[0]> = {}) {
  const handlers = { onRemove: vi.fn(), onEdit: vi.fn() }
  const props = { photos: Array.from({ length: n }, (_, i) => photo(i + 1)), disabled: false, ...handlers, ...over }
  return { ...handlers, ...render(<ReceiptPhotoList {...props} />), props }
}

describe('ReceiptPhotoList', () => {
  it('has an "Edit photo N" button and a "Remove photo N" button in every row', () => {
    view(3)
    const rows = within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => {
      expect(within(row).getByRole('button', { name: `Edit photo ${i + 1}` })).toBeInTheDocument()
      expect(within(row).getByRole('button', { name: `Remove photo ${i + 1}` })).toBeInTheDocument()
    })
  })
  it('Edit comes before Remove in the row (reading and tab order)', () => {
    view(1)
    const names = within(screen.getByRole('listitem')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names.indexOf('Edit photo 1')).toBeGreaterThanOrEqual(0)
    expect(names.indexOf('Edit photo 1')).toBeLessThan(names.indexOf('Remove photo 1'))
  })
  it('Edit reports the photo id, and does not remove it', async () => {
    const { onEdit, onRemove } = view(2)
    await userEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
    expect(onEdit).toHaveBeenCalledExactlyOnceWith('p2')
    expect(onRemove).not.toHaveBeenCalled()
  })
  it('disabled disables Edit and Remove', () => {
    view(2, { disabled: true })
    for (const b of screen.getAllByRole('button')) expect(b).toBeDisabled()
    expect(screen.getAllByRole('button', { name: /^Edit photo/ })).toHaveLength(2)
  })
  it('shows the preview of each photo, and the new one after an edit', () => {
    const { rerender, props } = view(2)
    const srcs = () => within(screen.getByRole('list', { name: 'Photos' })).getAllByRole('img').map((i) => i.getAttribute('src'))
    expect(srcs()).toEqual(['blob:p/1', 'blob:p/2'])
    rerender(<ReceiptPhotoList {...props} photos={[photo(1), photo(2, 'blob:p/9')]} />)
    expect(srcs()).toEqual(['blob:p/1', 'blob:p/9'])
  })
})
