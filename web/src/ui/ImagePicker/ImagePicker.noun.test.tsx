// B9-37 (w2c follow-up, GLOSSARY Photo / Picture): a host names its picture, and Add / Replace / Remove say that noun, never "image".
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImagePicker } from './ImagePicker'
import { pictureActionLabels } from './strings'
import { fakeDeps, ID_A } from './testing'

describe('ImagePicker noun', () => {
  it('an empty picker with noun "Photo" offers "Add Photo"', () => {
    render(<ImagePicker label="Step photo" noun="Photo" value="" onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getAllByText('Add Photo').length).toBeGreaterThan(0)
    expect(screen.queryByText('Add an image')).toBeNull()
  })

  it('a set picker with noun "Photo" says Replace Photo and Remove Photo', () => {
    render(<ImagePicker label="Recipe photo" noun="Photo" value={ID_A} onChange={() => {}} deps={fakeDeps()} />)
    expect(screen.getByRole('button', { name: /^Replace Photo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Photo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove image' })).toBeNull()
  })

  it('without a noun the words stay as before', () => {
    expect(pictureActionLabels()).toEqual({ add: 'Add an image', replace: 'Replace image', remove: 'Remove image' })
    expect(pictureActionLabels('Picture')).toEqual({ add: 'Add Picture', replace: 'Replace Picture', remove: 'Remove Picture' })
  })
})
