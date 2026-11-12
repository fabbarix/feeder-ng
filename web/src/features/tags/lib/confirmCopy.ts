// The wording of the Merge and Delete confirms (spec 4.1) from the summaries of lib/tags. Plain TypeScript, no React.
import type { DeleteSummary, MergeSummary } from '../../../lib/tags'

export interface ConfirmCopy {
  title: string
  body: string
}

export function mergeConfirmCopy(_summary: MergeSummary): ConfirmCopy {
  throw new Error('TG-S: not implemented')
}

export function deleteConfirmCopy(_summary: DeleteSummary): ConfirmCopy {
  throw new Error('TG-S: not implemented')
}
