// The ask-before-waste row: "Chilli was to be used by Tue. Had it, threw it out, or wasn't there?". STUB (red).
import type { Leftover, LeftoverAnswer } from '../../lib/leftovers'

export interface LeftoverQuestionProps {
  leftover: Leftover
  today: string
  /** Disables the three buttons while an answer is saved. */
  busy?: boolean
  onAnswer: (answer: LeftoverAnswer, leftover: Leftover) => void
}

export function LeftoverQuestion(_props: LeftoverQuestionProps) {
  return null
}
