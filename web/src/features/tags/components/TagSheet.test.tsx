// TagSheet: a BottomSheet <dialog> with Name, the Tag colour picker and a live pill; keyboard and screen reader.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fish } from '../fixtures'
import type { SheetState } from '../types'
import { TagSheet, type TagSheetProps } from './TagSheet'

function show(over: Partial<TagSheetProps> = {}) {
  const props: TagSheetProps = {
    sheet: { mode: 'edit', tag: fish },
    newColour: 'mustard',
    onClose: vi.fn(),
    onSave: vi.fn(async () => ({ ok: true as const })),
    onMerge: vi.fn(),
    onDelete: vi.fn(),
    ...over,
  }
  render(<TagSheet {...props} />)
  return props
}
const sheet = (name: string) => screen.getByRole('dialog', { name })
const checked = () => screen.getAllByRole('radio').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.getAttribute('aria-label'))

describe('TagSheet: structure', () => {
  it('renders nothing while closed', () => {
    show({ sheet: null })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('a new Tag: a <dialog> named "Add Tag", an empty Name, the next colour checked, no Merge or Delete', () => {
    show({ sheet: { mode: 'new' } })
    const d = sheet('Add Tag')
    expect(d.tagName).toBe('DIALOG')
    expect(within(d).getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(checked()).toEqual(['Mustard'])
    expect(within(d).getByRole('button', { name: 'Save Tag' })).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: 'Merge into…' })).toBeNull()
    expect(within(d).queryByRole('button', { name: 'Delete Tag' })).toBeNull()
  })

  it('an existing Tag: "Edit Tag", its name and colour, Merge into… and Delete Tag', () => {
    show()
    const d = sheet('Edit Tag')
    expect(within(d).getByRole('textbox', { name: 'Name' })).toHaveValue('fish')
    expect(checked()).toEqual(['Sky'])
    expect(within(d).getByRole('button', { name: 'Merge into…' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Delete Tag' })).toBeInTheDocument()
  })

  it('the Tag colour picker is a radiogroup named "Tag colour" with ten named swatches and a helper line', () => {
    show()
    const group = within(sheet('Edit Tag')).getByRole('radiogroup', { name: 'Tag colour' })
    expect(within(group).getAllByRole('radio').map((r) => r.getAttribute('aria-label'))).toEqual(['Tomato', 'Apricot', 'Mustard', 'Olive', 'Sage', 'Teal', 'Sky', 'Blue', 'Plum', 'Rose'])
    expect(group).toHaveAccessibleDescription('Colours only help tell Tags apart.')
  })

  it('uses no native control: no <select>, no colour or checkbox input', () => {
    show()
    expect(document.querySelector('select, input[type="color"], input[type="checkbox"], input[type="radio"]')).toBeNull()
  })

  it('focus starts in the Name field', async () => {
    show()
    await waitFor(() => expect(within(sheet('Edit Tag')).getByRole('textbox', { name: 'Name' })).toHaveFocus())
  })
})

describe('TagSheet: the live pill', () => {
  it('shows the typed name in the chosen colour, and follows both', async () => {
    show()
    const preview = screen.getByTestId('tag-preview')
    expect(preview).toHaveTextContent('fish')
    expect(preview.querySelector('.chip[data-kind="tag"][data-tag-colour="sky"]')).not.toBeNull()
    const name = screen.getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Seafood')
    await userEvent.click(screen.getByRole('radio', { name: 'Rose' }))
    expect(preview).toHaveTextContent('Seafood')
    expect(preview.querySelector('.chip[data-tag-colour="rose"]')).not.toBeNull()
  })

  it('shows "Tag name" while the name is empty', () => {
    show({ sheet: { mode: 'new' } })
    expect(screen.getByTestId('tag-preview')).toHaveTextContent('Tag name')
  })

  it('sits after the helper line in the document, outside the radiogroup', () => {
    show()
    const group = screen.getByRole('radiogroup', { name: 'Tag colour' })
    const helper = screen.getByText('Colours only help tell Tags apart.')
    const preview = screen.getByTestId('tag-preview')
    expect(group.contains(preview)).toBe(false)
    expect(helper.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('TagSheet: Save', () => {
  it('sends the name as typed and the chosen colour', async () => {
    const { onSave } = show({ sheet: { mode: 'new' } })
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), '  Soup ')
    await userEvent.click(screen.getByRole('radio', { name: 'Olive' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save Tag' }))
    expect(onSave).toHaveBeenCalledWith({ name: '  Soup ', colour: 'olive' })
  })

  it('Enter in the Name field saves', async () => {
    const { onSave } = show()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), '{Enter}')
    expect(onSave).toHaveBeenCalledWith({ name: 'fish', colour: 'sky' })
  })

  it('is disabled while the name is blank, so nothing is sent', async () => {
    const { onSave } = show({ sheet: { mode: 'new' } })
    const save = screen.getByRole('button', { name: 'Save Tag' })
    expect(save).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), '   ')
    expect(save).toBeDisabled()
    await userEvent.keyboard('{Enter}')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('a refusal shows its sentence under Name, keeps what was typed, and clears when the User types', async () => {
    const onSave = vi.fn(async () => ({ ok: false as const, error: 'There is already a Tag called Seafood' }))
    show({ onSave })
    const name = screen.getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'seafood')
    await userEvent.click(screen.getByRole('button', { name: 'Save Tag' }))
    expect(await screen.findByText('There is already a Tag called Seafood')).toBeInTheDocument()
    expect(name).toHaveAccessibleDescription(/There is already a Tag called Seafood/)
    expect(name).toHaveValue('seafood')
    expect(screen.getByRole('dialog', { name: 'Edit Tag' })).toBeInTheDocument()
    await userEvent.type(name, 's')
    expect(screen.queryByText('There is already a Tag called Seafood')).toBeNull()
  })

  it('a refusal without a sentence shows no error under Name', async () => {
    show({ onSave: vi.fn(async () => ({ ok: false as const })) })
    await userEvent.click(screen.getByRole('button', { name: 'Save Tag' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save Tag' })).toBeEnabled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('TagSheet: keyboard', () => {
  it('Escape closes it', async () => {
    const { onClose } = show()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the Close button is named', async () => {
    const { onClose } = show()
    await userEvent.click(within(sheet('Edit Tag')).getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('arrow keys move through the swatches, selecting each one, with Tab leaving the group', async () => {
    show({ sheet: { mode: 'new' }, newColour: 'tomato' })
    screen.getByRole('radio', { name: 'Tomato' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(checked()).toEqual(['Mustard'])
    expect(screen.getByRole('radio', { name: 'Mustard' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(checked()).toEqual(['Rose'])
    await userEvent.keyboard('{ArrowRight}')
    expect(checked()).toEqual(['Tomato'])
  })

  it('Merge into… and Delete Tag call their handlers', async () => {
    const { onMerge, onDelete } = show()
    await userEvent.click(screen.getByRole('button', { name: 'Merge into…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete Tag' }))
    expect(onMerge).toHaveBeenCalledTimes(1)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})

describe('TagSheet: Delete while the impact loads', () => {
  it('disables Delete Tag while busy, so a fast double tap cannot ask twice', async () => {
    const { onDelete } = show({ busy: true })
    const del = screen.getByRole('button', { name: 'Delete Tag' })
    expect(del).toBeDisabled()
    await userEvent.click(del)
    expect(onDelete).not.toHaveBeenCalled()
  })
  it('enables it otherwise', () => {
    show({ busy: false })
    expect(screen.getByRole('button', { name: 'Delete Tag' })).toBeEnabled()
  })
})

describe('TagSheet: reopening', () => {
  it('starts afresh for another Tag, and for a new one', async () => {
    function Host() {
      const [state, setState] = useState<SheetState | null>({ mode: 'edit', tag: fish })
      return (
        <>
          <button onClick={() => setState({ mode: 'new' })}>go new</button>
          <TagSheet sheet={state} newColour="plum" onClose={() => setState(null)} onSave={async () => ({ ok: true })} onMerge={() => {}} onDelete={() => {}} />
        </>
      )
    }
    render(<Host />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), ' soup')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'go new' }))
    const d = await screen.findByRole('dialog', { name: 'Add Tag' })
    expect(within(d).getByRole('textbox', { name: 'Name' })).toHaveValue('')
    expect(checked()).toEqual(['Plum'])
  })
})
