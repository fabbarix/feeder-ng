import { previewText, type RulePreview as Preview } from '../lib/rulePreview'

export interface RulePreviewProps {
  preview: Preview
  currency: string
  /** the rule's value unit as the editor shows it ('g', 'kg', 'oz', 'lb'; '' for a price rule) */
  unit?: string
}

/** Renders previewText(preview, currency, unit) in an element with role="status" (polite live region). */
export function RulePreview({ preview, currency, unit }: RulePreviewProps) {
  return (
    <p role="status" className="pg__muted">
      {previewText(preview, currency, unit)}
    </p>
  )
}
