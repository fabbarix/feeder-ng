// B9-30 (rule R-A): in the full ImagePicker the file button is an outlined button and "or drop it here" is text inside the dashed zone,
// not the tail of the button's name. API pinned:
//   ui/fields/FileDrop gets `hint?: string`. With a hint the zone shows it as text (class .file-drop__hint) after the button, the button's
//   default text is "Choose a file", and the button is the shared outline look (.file-drop__button has a boundary: border, not a bare fill).
//   Without `hint` FileDrop keeps today's single "Choose a file or drop it here" button (the import screens still use it).
//   ImagePicker passes hint "or drop it here"; its button is named "Choose a file" (empty) or "Replace image: choose a file" (filled).
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readUiCss } from '../test-utils'
import { ImagePicker } from './ImagePicker'
import { fakeDeps, ID_A } from './testing'

describe('ImagePicker file button (R-A)', () => {
  it('is "Choose a file", and "or drop it here" is text inside the zone', () => {
    render(<ImagePicker label="Recipe photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    const zone = screen.getByTestId('file-drop-zone')
    const button = within(zone).getByRole('button', { name: 'Choose a file' })
    expect(button).toHaveTextContent(/^Choose a file$/)
    expect(within(zone).getByText('or drop it here')).toBeInTheDocument()
    expect(button.contains(within(zone).getByText('or drop it here'))).toBe(false)
  })

  it('with a picture the button says what it replaces', () => {
    render(<ImagePicker label="Recipe photo" value={ID_A} onChange={() => {}} deps={fakeDeps()} />)
    expect(within(screen.getByTestId('file-drop-zone')).getByRole('button', { name: 'Replace image: choose a file' })).toBeInTheDocument()
  })
})

describe('FileDrop.css (R-A)', () => {
  const css = readUiCss('fields/FileDrop.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const rule = (selector: string) => [...css.matchAll(new RegExp(`${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[1]).join(' ')

  it('the button has a boundary of at least 3:1 (the outline token), not a bare surface fill', () => {
    const body = rule('.file-drop__button')
    expect(body).toMatch(/border\s*:[^;]*var\(--color-outline\)/)
    expect(body).not.toMatch(/border\s*:\s*0\b/)
  })

  it('the hint is muted text', () => {
    expect(rule('.file-drop__hint')).toMatch(/color\s*:\s*var\(--color-muted\)/)
  })
})
