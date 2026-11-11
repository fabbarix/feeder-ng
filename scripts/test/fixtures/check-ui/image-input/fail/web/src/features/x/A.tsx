// Three features that build their own image input: each line below is one violation.
import { FileDrop } from '../../ui'
export const A = () => (
  <div>
    <FileDrop label="Photo" accept="image/*" onFiles={() => {}} />
    <FileDrop label="Photo" accept=".png,.jpg" onFiles={() => {}} />
    <input hidden capture="environment" />
  </div>
)
