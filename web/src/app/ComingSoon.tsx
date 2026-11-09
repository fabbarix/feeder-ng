import { EmptyState } from '../ui'
import { shellStrings } from './strings'

/** Placeholder for a core destination that no feature provides yet. */
export function ComingSoon({ title }: { title: string }) {
  return <EmptyState title={title} description={shellStrings.comingSoon} />
}
