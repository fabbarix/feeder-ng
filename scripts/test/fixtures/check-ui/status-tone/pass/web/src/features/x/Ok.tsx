import { Chip, Tile } from '../../ui'

// A comment may talk about status="spoil" and tone: 'danger' without being a violation.
export function Ok() {
  return (
    <Tile variant="status" status="warn">
      <Chip kind="status" status="info">Start Tue 21:30</Chip>
      <Chip kind="state" status="neutral">Not cooked</Chip>
      <Chip kind="status" status={'leftover'}>Leftover</Chip>
      <Chip kind="status" status="success">Cooked</Chip>
    </Tile>
  )
}

export const toneOf = { spoilDays: 2, dangerous: false }
export const label = 'a status of spoil in a string that is not an attribute'
