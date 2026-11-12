// PhotoList: the photos in page order, reorderable with the shared Sortable (docs/dev/design/photo-read.md D7, sections 5 and 6).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { layoutRows } from '../../../ui/Sortable/sortable.test-helper'
import { heicPhoto, imagePhoto, linkPhoto } from '../fakePhotoPages.test-helper'
import type { Photo } from '../lib/photoPages'
import { PhotoList } from './PhotoList'

const three = [imagePhoto('p1'), imagePhoto('p2'), imagePhoto('p3')]
function view(photos: Photo[] = three, over: Partial<Parameters<typeof PhotoList>[0]> = {}) {
  const handlers = { onEdit: vi.fn(), onRemove: vi.fn(), onMove: vi.fn() }
  const props = { photos, previewUrl: (id: string) => `blob:preview/${id}`, ...handlers, ...over }
  const out = render(<PhotoList {...props} />)
  layoutRows(out.container)
  return { ...handlers, ...out, props }
}

describe('PhotoList', () => {
  it('is an ordered list named "Photos in page order" with one row per photo, numbered by position', () => {
    view()
    const list = screen.getByRole('list', { name: 'Photos in page order' })
    expect(list.tagName).toBe('OL')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    rows.forEach((row, i) => expect(within(row).getByText(`Photo ${i + 1}`)).toBeInTheDocument())
  })

  it('renders nothing when there is no photo (the sources say what to do)', () => {
    view([])
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('gives each row a drag handle named by its photo', () => {
    view()
    for (const n of [1, 2, 3]) expect(screen.getByRole('button', { name: `Reorder Photo ${n}` })).toBeInTheDocument()
  })

  it('moves a photo with the keyboard: Space, an arrow, Space reports the original and final index once', async () => {
    const { onMove } = view()
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Reorder Photo 1' }).focus()
    await user.keyboard(' {ArrowDown}{ArrowDown} ')
    expect(onMove).toHaveBeenCalledExactlyOnceWith(0, 2)
  })

  it('announces the move through the Sortable live region', async () => {
    view()
    const user = userEvent.setup()
    screen.getByRole('button', { name: 'Reorder Photo 2' }).focus()
    await user.keyboard(' {ArrowUp}')
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain('Photo 2 moved to position 1 of 3.')
  })

  it('Edit photo n and Remove photo n report the photo\'s id', async () => {
    const { onEdit, onRemove } = view()
    await userEvent.click(screen.getByRole('button', { name: 'Edit photo 2' }))
    expect(onEdit).toHaveBeenCalledWith('p2')
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 3' }))
    expect(onRemove).toHaveBeenCalledWith('p3')
  })

  it('shows a preview only for photos that have one (as-is and link do not)', () => {
    const { container } = view([imagePhoto('p1'), heicPhoto('p2'), linkPhoto('p3')], { previewUrl: (id) => (id === 'p1' ? 'blob:preview/p1' : undefined) })
    expect(container.querySelectorAll('img')).toHaveLength(1)
  })

  it('turns the handles and buttons off when disabled (a read is running)', () => {
    view(three, { disabled: true })
    expect(screen.getByRole('button', { name: 'Reorder Photo 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit photo 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeDisabled()
  })
})

describe('PhotoList: after Remove', () => {
  const removeAndRerender = async (before: Photo[], after: Photo[], n: number) => {
    const v = view(before)
    await userEvent.click(screen.getByRole('button', { name: `Remove photo ${n}` }))
    v.rerender(<PhotoList {...v.props} photos={after} />)
    return v
  }

  it('says "Photo 2 removed." politely', async () => {
    await removeAndRerender(three, [three[0]!, three[2]!], 2)
    expect(screen.getAllByRole('status').map((s) => s.textContent)).toContain('Photo 2 removed.')
  })
  it('focus goes to the next row\'s Edit button', async () => {
    await removeAndRerender(three, [three[0]!, three[2]!], 2)
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toHaveFocus()
  })
  it('removing the first row focuses the new first row\'s Edit button', async () => {
    await removeAndRerender(three, [three[1]!, three[2]!], 1)
    expect(screen.getByRole('button', { name: 'Edit photo 1' })).toHaveFocus()
  })
  it('removing the last row focuses the previous row\'s Edit button', async () => {
    await removeAndRerender(three, [three[0]!, three[1]!], 3)
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toHaveFocus()
  })
})

describe('PhotoList: after Remove, focus goes to the row now at that position', () => {
  const rerenderWithout = async (before: Photo[], after: Photo[], n: number) => {
    const v = view(before)
    await userEvent.click(screen.getByRole('button', { name: `Remove photo ${n}` }))
    v.rerender(<PhotoList {...v.props} photos={after} />)
  }
  const [a, b] = [imagePhoto('p1'), imagePhoto('p2')]
  const link = linkPhoto('p4')
  const heic = heicPhoto('p5')

  it('a row without an Edit button (a link) gets its Remove button focused', async () => {
    await rerenderWithout([a, link, b], [link, b], 1)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toHaveFocus()
  })
  it('the same for an as-is photo', async () => {
    await rerenderWithout([a, heic, b], [heic, b], 1)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toHaveFocus()
  })
  it('a row with an Edit button still gets its Edit button, even beside rows without one', async () => {
    await rerenderWithout([a, link, b], [a, b], 2)
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toHaveFocus()
  })
  it('only rows without an Edit button left: the Remove button of the row at that position', async () => {
    await rerenderWithout([a, link], [link], 1)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toHaveFocus()
  })
  it('removing the last row focuses the new last row, whatever kind it is', async () => {
    await rerenderWithout([link, a], [link], 2)
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toHaveFocus()
  })
  it('the position is by page position, not by the number of Edit buttons before it', async () => {
    await rerenderWithout([link, a, b], [link, b], 2)
    expect(screen.getByRole('button', { name: 'Edit photo 2' })).toHaveFocus()
  })
})
