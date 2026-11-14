import { useToast } from '../../ui/Toast'

export const ChangedToast = ({ lines }: { lines: string[] }) => {
  const { show } = useToast()
  return (
    <button onClick={() => show('Changed', { status: 'success' })}>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </button>
  )
}
