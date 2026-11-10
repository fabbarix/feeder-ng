export const A = () => (
  <form>
    <input
      id="agree"
      type="checkbox"
      onChange={() => setAgree(true)}
    />
    <input
      value={n > 2 ? 'x' : 'y'}
      type={'date'}
    />
    <input value="a"
      type="radio" />
  </form>
)
