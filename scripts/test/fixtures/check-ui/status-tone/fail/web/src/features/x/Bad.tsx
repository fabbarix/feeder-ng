import { Chip, Tile } from '../../ui'

// B9-17 status-tone: 7 violations (the fixture has 7 lines in two files), one per line that sets a status or tone to spoil or danger.
export function Bad() {
  return (
    <Tile variant="status" status="spoil">
      <Chip kind="status" status="danger">Couldn't plan</Chip>
      <Chip kind="state" status={'spoil'}>Rule conflict</Chip>
      <Chip kind="state" status={"danger"}>Not cooked</Chip>
    </Tile>
  )
}

export const toneStyle = (c: string) => (c === 'warn' ? { status: 'spoil' as const } : { tone: 'danger' as const })
