// A raw capture= after a shared ImageFileInput closes is still a violation (one, on the input line).
import { ImageFileInput } from '../../ui'
export const B = () => (
  <div>
    <ImageFileInput capture onFiles={() => {}} />
    <input hidden capture={'user'} />
  </div>
)
