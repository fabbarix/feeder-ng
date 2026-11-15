// B9-30 (SET-04, shared with SET-05): `compact` is the small ImagePicker of an entity page's last tile.
// API pinned (types.ts ImagePickerCommon): compact?: boolean; monogram?: string (the name the empty 72 px Thumb takes its letter from).
//   Empty:  the 72 px Thumb as a monogram, the text "No Picture yet." (the host's `helper` replaces it), and two outline small buttons,
//           "Choose a file" and "Take photo" (only where a camera route exists). No dashed drop zone, no Paste image / Paste link buttons.
//   Filled: the 72 px picture with "Change" and "Remove" (outline small buttons); no Rotate and no Crop.
//   The group is named by `label` and carries data-compact="true". Choosing a file uploads it as the full picker does.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { fakeDeps, fakeMedia, ID_A, pngFile } from './testing'

const user = userEvent.setup({ applyAccept: false })
const group = () => screen.getByRole('group', { name: 'Picture' })
const setup = (over: { value?: string; helper?: string; camera?: boolean } = {}) => {
  const deps = fakeDeps(over.camera ? { mediaDevices: fakeMedia().media } : {})
  const onChange = vi.fn()
  const view = render(<ImagePicker compact monogram="Flour" hideLabel label="Picture" value={over.value ?? ''} helper={over.helper} onChange={onChange} deps={deps} />)
  return { deps, onChange, ...view }
}

describe('ImagePicker compact, empty', () => {
  it('shows the 72 px monogram, "No Picture yet." and outline "Choose a file"', () => {
    setup()
    expect(group()).toHaveAttribute('data-compact', 'true')
    const thumb = group().querySelector('.thumb')!
    expect(thumb).toHaveAttribute('data-size', '72')
    expect(thumb).toHaveTextContent('F')
    expect(within(group()).getByText('No Picture yet.')).toBeInTheDocument()
    const choose = within(group()).getByRole('button', { name: 'Choose a file' })
    expect(choose).toHaveAttribute('data-variant', 'secondary')
    expect(choose).toHaveAttribute('data-size', 'sm')
  })

  it('has no dashed drop zone, no Paste buttons and no limit helper', () => {
    setup()
    expect(screen.queryByTestId('file-drop-zone')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Paste image' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Paste link' })).toBeNull()
    expect(screen.queryByText(/up to 8 MB/)).toBeNull()
  })

  it('"Take photo" is there only where a camera route exists', () => {
    const { unmount } = setup()
    expect(screen.queryByRole('button', { name: 'Take photo' })).toBeNull()
    unmount()
    setup({ camera: true })
    expect(screen.getByRole('button', { name: 'Take photo' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('the host helper replaces "No Picture yet."', () => {
    setup({ helper: 'Rows show the letter F until there is one.' })
    expect(screen.getByText('Rows show the letter F until there is one.')).toBeInTheDocument()
    expect(screen.queryByText('No Picture yet.')).toBeNull()
  })

  it('choosing a file uploads it and tells the host the image id', async () => {
    const { deps, onChange, container } = setup()
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(ID_A))
    expect(deps.api.uploadDataUrl).toHaveBeenCalledTimes(1)
  })

  it('"Choose a file" opens the native chooser kept inside the picker', async () => {
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    setup()
    await user.click(screen.getByRole('button', { name: 'Choose a file' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
  })
})

describe('ImagePicker compact, with a Picture', () => {
  it('shows the picture at 72 px with "Change" and "Remove", and no Rotate or Crop', () => {
    setup({ value: ID_A })
    const img = within(group()).getByRole('img', { name: 'Picture' })
    expect(img).toHaveAttribute('src', `/api/images/${ID_A}`)
    expect(group().querySelector('.thumb')).toHaveAttribute('data-size', '72')
    expect(within(group()).getByRole('button', { name: 'Change' })).toHaveAttribute('data-variant', 'secondary')
    expect(within(group()).getByRole('button', { name: 'Remove' })).toHaveAttribute('data-variant', 'secondary')
    for (const name of ['Rotate left', 'Rotate right', 'Crop', 'Choose a file', 'Replace image']) expect(screen.queryByRole('button', { name })).toBeNull()
    expect(screen.queryByText('No Picture yet.')).toBeNull()
  })

  it('"Remove" tells the host with an empty id', async () => {
    const { onChange } = setup({ value: ID_A })
    await user.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('"Change" opens the chooser, and a new file replaces the picture', async () => {
    const { onChange, container } = setup({ value: ID_A })
    const click = vi.spyOn(HTMLInputElement.prototype, 'click')
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]:not([capture])')!, pngFile())
    await waitFor(() => expect(onChange).toHaveBeenCalled())
  })
})

describe('the full picker is unchanged', () => {
  it('without `compact` there is still the drop zone and Paste image', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Paste image' })).toBeInTheDocument()
  })
})
