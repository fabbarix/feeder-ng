import { previewText, type RulePreview as Preview } from '../lib/rulePreview'

export interface RulePreviewProps {
  preview: Preview
  currency: string
}

/** Renders previewText(preview, currency) in an element with role="status" (polite live region). */
export function RulePreview({ preview, currency }: RulePreviewProps) {
  return (
    <p role="status" className="pg__muted">
      {previewText(preview, currency)}
    </p>
  )
}
