import { Tile } from '../../ui/Tile'

export const NoticeTile = ({ lines }: { lines: string[] }) => (
  <Tile variant="status" status="spoil">
    <ul>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  </Tile>
)
