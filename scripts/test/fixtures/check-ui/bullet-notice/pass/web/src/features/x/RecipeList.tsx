export const RecipeList = ({ names }: { names: string[] }) => (
  <ul>
    {names.map((n) => (
      <li key={n}>{n}</li>
    ))}
  </ul>
)
