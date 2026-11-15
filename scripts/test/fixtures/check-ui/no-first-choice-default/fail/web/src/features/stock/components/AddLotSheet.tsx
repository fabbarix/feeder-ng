// Fixture: five first-choice defaults (the last line has two).
export function pick(choices: { id: number }[], pickedId: number | null) {
  const chosen = choices.find((c) => c.id === pickedId) ?? choices[0]
  return chosen
}
export function pickOption(options: { value: string }[], value: string | null) {
  return options.find((o) => o.value === value) ?? options[0]
}
export const first = (props: { choices: string[] }) => props.choices[1] ?? props.choices[0]
export const either = (options: string[], choices: string[]) => options[1] ?? options[0] ?? choices[0]
