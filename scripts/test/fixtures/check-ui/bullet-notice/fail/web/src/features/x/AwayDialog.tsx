import { Dialog } from '../../ui/Dialog'

export const AwayDialog = ({ lines }: { lines: string[] }) => (
  <Dialog open onClose={() => {}} title="Away">
    <ul>
      {lines.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  </Dialog>
)
