import type { RulePreview as Preview } from '../lib/rulePreview'

export interface RulePreviewProps {
  preview: Preview
  currency: string
}

/** Renders previewText(preview, currency) in an element with role="status" (polite live region). */
export function RulePreview(props: RulePreviewProps): never {
  void props
  throw new Error('TODO')
}
