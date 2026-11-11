import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readUiCss } from './test-utils'
import { ViewfinderStrip } from './ViewfinderStrip'

// IP1: the ImagePicker's camera is built on this primitive, so it gains a name and a photo size (the scanner keeps its defaults).
describe('ViewfinderStrip, photo size', () => {
  it('keeps the scanner defaults: region "Scanner", strip size, reticle', () => {
    const { container } = render(<ViewfinderStrip />)
    const region = screen.getByRole('region', { name: 'Scanner' })
    expect(region).not.toHaveAttribute('data-size', 'photo')
    expect(container.querySelector('.viewfinder-strip__reticle')).not.toBeNull()
  })

  it('label renames the region', () => {
    render(<ViewfinderStrip label="Camera" />)
    expect(screen.getByRole('region', { name: 'Camera' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Scanner' })).not.toBeInTheDocument()
  })

  it('size="photo" marks the region and drops the barcode reticle', () => {
    const { container } = render(<ViewfinderStrip label="Camera" size="photo" />)
    expect(screen.getByRole('region', { name: 'Camera' })).toHaveAttribute('data-size', 'photo')
    expect(container.querySelector('.viewfinder-strip__reticle')).toBeNull()
  })

  it('the photo picture is 4:3 instead of a fixed 140 px strip', () => {
    const css = readUiCss('ViewfinderStrip.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).toMatch(/\[data-size=['"]?photo['"]?\][^{]*\{[^}]*aspect-ratio\s*:\s*4\s*\/\s*3/)
  })
})
