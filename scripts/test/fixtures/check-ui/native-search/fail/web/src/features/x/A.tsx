export const A = () => (
  <div>
    <input type="search" placeholder="Find" />
    <input
      className="plain"
      type='search'
      onChange={(e) => e.target.value}
    />
    <input type="text" />
  </div>
)
