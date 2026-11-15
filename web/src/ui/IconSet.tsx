import { Children, type ReactNode } from 'react'
import './IconSet.css'

export interface IconSetProps {
  /** Names the set as a group ("Actions for Pasta"). Without it the set has no role: each button carries its own name. */
  label?: string
  className?: string
  children: ReactNode
}

/**
 * A row of icon actions (A11Y-09). Its gap is --icon-set-gap: 8 px on a fine pointer, so a focus ring stops short of its
 * neighbour, and 12 px on a coarse one, so 32 px buttons keep a 44 px pitch and their hit areas never overlap.
 */
export function IconSet({ label, className, children }: IconSetProps) {
  return (
    <div className={['icon-set', className].filter(Boolean).join(' ')} role={label ? 'group' : undefined} aria-label={label}>
      {Children.toArray(children)}
    </div>
  )
}
