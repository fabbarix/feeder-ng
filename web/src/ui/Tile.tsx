import type { ElementType, HTMLAttributes, ReactNode } from 'react'

export type TileSize = 'sm' | 'md' | 'lg' | 'wide' | 'full'
export type TileTone = 'neutral' | 'accent' | 'spoil' | 'leftover'

export interface TileProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick'> {
  size?: TileSize
  tone?: TileTone
  onClick?: () => void
  as?: 'div' | 'section' | 'article'
  className?: string
  children?: ReactNode
  'aria-label'?: string
}

/** The basic Bento card. Becomes a button when it has an onClick. */
export function Tile({ size = 'md', tone = 'neutral', onClick, as = 'div', className, children, ...rest }: TileProps) {
  const classes = ['tile', className].filter(Boolean).join(' ')
  if (onClick) {
    return (
      <button type="button" className={classes} data-size={size} data-tone={tone} onClick={onClick} {...rest}>
        {children}
      </button>
    )
  }
  const Tag: ElementType = as
  return (
    <Tag className={classes} data-size={size} data-tone={tone} {...rest}>
      {children}
    </Tag>
  )
}
