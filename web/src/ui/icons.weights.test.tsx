import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon, type IconWeight } from './Icon'
import { icons, type IconName } from './icons'

// UF1 (docs/dev/design/uf1-icons.md): only the weights the app uses ship (regular, bold, fill, duotone).
// A glyph drawn at a missing weight is an empty svg, so every registered icon must draw at each used weight.
// web/vite.config.ts applies the weight-stripping plugin to the Phosphor modules in tests too (server.deps.inline),
// so these tests see the same modules as the production bundle.
const USED: readonly IconWeight[] = ['regular', 'bold', 'fill', 'duotone']
const NAMES = Object.keys(icons) as IconName[]

const pathCount = (name: IconName, weight: string) => {
  const { container, unmount } = render(<Icon name={name} weight={weight as IconWeight} />)
  const n = container.querySelectorAll('path, circle, rect, line, polygon, polyline').length
  unmount()
  return n
}

describe('icon weights', () => {
  it.each(USED)('every registered icon draws at the %s weight', (weight) => {
    const empty = NAMES.filter((name) => pathCount(name, weight) === 0)
    expect(empty, `icons with nothing drawn at ${weight}`).toEqual([])
  })

  it.each(['thin', 'light'])('the unused %s weight is stripped from the shipped Phosphor modules', (weight) => {
    expect(pathCount('today', weight)).toBe(0)
  })
})
