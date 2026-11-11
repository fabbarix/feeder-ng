// R2-1 (G-01): the barrel exports Menu, and the dev Gallery shows it in both schemes.
import { render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Gallery } from '../Gallery'
import * as ui from '../index'

describe('Menu in the ui barrel and the Gallery', () => {
  it('exports Menu and useMenuKeys', () => {
    for (const name of ['Menu', 'useMenuKeys']) expect((ui as Record<string, unknown>)[name], name).toBeDefined()
  })
  it.each(['light', 'dark'] as const)('%s section lists Menu with a working trigger', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    expect(within(section).getByRole('heading', { level: 3, name: 'Menu' })).toBeInTheDocument()
    expect(section.querySelector("[aria-haspopup='menu']")).not.toBeNull()
  })
})
