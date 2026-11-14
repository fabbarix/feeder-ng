import { DetailList, DetailRow } from '../../ui/DetailList'
import { Tile } from '../../ui/Tile'

export const NoticeTile = ({ lines }: { lines: { name: string; short: string }[] }) => (
  <Tile variant="status" status="spoil">
    <DetailList tone="spoil">
      {lines.map((l) => (
        <DetailRow key={l.name} label={l.name} state={l.short} />
      ))}
    </DetailList>
  </Tile>
)
