import { Tile } from './Tile'

// A primitive may not default to a food or loss tone either: one more violation (7 in all).
export function Primitive() {
  return <Tile variant="status" status="danger">x</Tile>
}
