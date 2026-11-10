import { TextField } from '../../ui/TextField'
export const A = () => (
  <form>
    <input
      type="text"
      placeholder="checkbox"
      onChange={(e) => set(e.target.value)}
    />
    {/* <input type="checkbox" /> */}
    // <input type="radio" />
    <input
      value={n > 2 ? 'x' : 'y'}
      type="search"
    />
  </form>
)
