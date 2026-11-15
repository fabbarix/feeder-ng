import type { CourseChoice } from '../../../lib/courses'
import type { RecipeDraft } from './draft'

// B9-37 stubs (RX-02; pinned by lib/editorSummary.test.ts): the one-line summaries of the two closed Disclosure sections.

/** "Description and source" summary: the first 60 characters of the description and the Source host, or "Optional" when both are empty. */
export function aboutSummary(_draft: Pick<RecipeDraft, 'description' | 'sourceUrl'>): string {
  throw new Error('B9-37: aboutSummary is not built yet')
}

/** "Planning" summary: Courses · up to three Tags (+N) · the overrides set; "Never planned" for a Base recipe. */
export function planningSummary(_draft: RecipeDraft, _courses: readonly CourseChoice[]): string {
  throw new Error('B9-37: planningSummary is not built yet')
}
