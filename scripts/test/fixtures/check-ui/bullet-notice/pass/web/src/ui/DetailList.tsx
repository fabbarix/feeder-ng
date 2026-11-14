import type { ReactNode } from 'react'
import { Tile } from './Tile'

export const DetailList = ({ children }: { children?: ReactNode }) => (
  <ul role="list">
    <li>{children}</li>
  </ul>
)
export const Unused = Tile
