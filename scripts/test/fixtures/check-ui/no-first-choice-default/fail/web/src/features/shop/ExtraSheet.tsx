export const start = (choices: { id: number }[]) => (choices.length > 0 ? choices[2] : undefined) ?? choices[0]
