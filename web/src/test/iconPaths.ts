import { render } from '@testing-library/react'
import { createElement } from 'react'
import { Icon } from '../ui/Icon'
import type { IconName } from '../ui/icons'

/** The `d` attributes of an svg's paths, joined: identifies a glyph at one weight. */
export const pathsOf = (svg: Element | null): string =>
  Array.from(svg?.querySelectorAll('path') ?? [])
    .map((p) => p.getAttribute('d'))
    .join('|')

/** The path signatures of a registered icon at every weight (a Button picks the weight itself). */
export function glyphSignatures(name: IconName): string[] {
  return (['regular', 'bold', 'fill', 'duotone'] as const).map((weight) => {
    const { container, unmount } = render(createElement(Icon, { name, weight }))
    const sig = pathsOf(container.querySelector('svg'))
    unmount()
    return sig
  })
}

/** True when the svg is the named icon at some weight. */
export const isIcon = (svg: Element | null, name: IconName): boolean => glyphSignatures(name).includes(pathsOf(svg))
