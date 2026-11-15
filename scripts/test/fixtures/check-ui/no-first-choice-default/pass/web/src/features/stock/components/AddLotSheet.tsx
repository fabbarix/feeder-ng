// Fixture: nothing here is a first-choice default.
export function pick(choices: { id: number }[], pickedId: number | null, initialId: number | null) {
  // const chosen = choices.find((c) => c.id === pickedId) ?? choices[0]   (a comment is not scanned)
  /* ?? options[0] */
  const chosen = choices.find((c) => c.id === (pickedId ?? initialId))
  return chosen ?? null
}
export const second = (choices: string[]) => choices[1] ?? choices[2]
export const named = (props: { choices: string[] }) => props.choices.length > 0 ? props.choices[0] : null
export const other = (restChoices: string[]) => restChoices[1] ?? restChoices[0]
