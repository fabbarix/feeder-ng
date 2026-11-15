// Outside web/src/features the rule does not look: a primitive may use its first option for display.
export const shown = (options: { label: string }[], index: number | null) => options[index ?? 0] ?? options[0]
