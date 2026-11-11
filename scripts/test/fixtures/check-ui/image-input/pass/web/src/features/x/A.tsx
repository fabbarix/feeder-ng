import { FileDrop, ImagePicker } from '../../ui'
// accept="image/*" in a comment is not a violation
export const A = ({ id }: { id: string }) => (
  <div>
    <FileDrop label="Recipe file" accept=".json,application/json" onFiles={() => {}} />
    <ImagePicker label="Photo" value={id} onChange={() => {}} />
    <img src={`/api/images/${id}`} alt="" />
  </div>
)
