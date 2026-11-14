import { createElement, type HTMLAttributes } from 'react'
import './Stack.css'

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Spacing token step: --space-2, --space-3 or --space-4. Default 3. */
  gap?: '2' | '3' | '4'
  /** Default div; a list keeps its semantics. */
  as?: 'div' | 'section' | 'ul' | 'ol'
}
export interface ClusterProps extends HTMLAttributes<HTMLElement> {
  /** Spacing token step; only --space-2 exists for a Cluster. */
  gap?: '2'
  as?: 'div' | 'ul' | 'ol'
}

const withClass = (base: string, className?: string) => (className ? `${base} ${className}` : base)

/** A vertical grid on the spacing tokens (DS-07). Replaces `.pg`, `.pg__stack` and `.pg__group`. */
export function Stack({ gap = '3', as = 'div', className, ...rest }: StackProps) {
  return createElement(as, { ...rest, className: withClass('stack', className), 'data-gap': gap })
}

/** A wrapping row on --space-2 (DS-07). Replaces `.pg__row`; a child may set its own `align-self`. */
export function Cluster({ gap = '2', as = 'div', className, ...rest }: ClusterProps) {
  return createElement(as, { ...rest, className: withClass('cluster', className), 'data-gap': gap })
}
