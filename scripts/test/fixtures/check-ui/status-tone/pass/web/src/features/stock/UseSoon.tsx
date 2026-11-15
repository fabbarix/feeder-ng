import { Tile } from '../../ui'

// Food going off: spoil is the right tone here, so the file is on scripts/check-ui.allow-tones.
export function UseSoon() {
  return <Tile variant="status" status="spoil">Use soon</Tile>
}
