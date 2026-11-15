// DS-SHOP (docs/design/system.md §2, §4): the header metrics as a metric strip (BentoGrid min="metric"): "16 of 18 left" over a
// full-width progress track, the estimated total, and the Scan tile (the one primary action, until the list is complete). Render only.
import { BentoGrid } from '../../../ui/BentoGrid'
import { Button } from '../../../ui/Button'
import { Tile } from '../../../ui/Tile'
import type { ShopSummary } from '../lib/summary'
import { shopStrings } from '../strings'

export interface ShopMetricsProps {
  summary: ShopSummary
  onScan: () => void
}

export function ShopMetrics({ summary, onScan }: ShopMetricsProps) {
  const { left, ticked, total, percent, leftOf, meta, estimated, unpriced, complete } = summary
  return (
    <BentoGrid min="metric" label={shopStrings.summary}>
      <Tile className="shop-metrics__tile">
        <div role="progressbar" aria-label={shopStrings.leftToGet} aria-valuemin={0} aria-valuemax={total} aria-valuenow={ticked} className="shop-metrics__bar">
          <span className="shop-metrics__fill" style={{ inlineSize: `${percent}%` }} />
        </div>
        <p className="shop-metrics__figure">
          <span className="shop-metrics__value" data-metric="left">
            {left}
          </span>{' '}
          <span className="shop-metrics__unit">{leftOf}</span>
        </p>
        <p className="shop-metrics__meta">{meta}</p>
      </Tile>
      {estimated ? (
        <Tile className="shop-metrics__tile">
          <p className="shop-metrics__label">{shopStrings.estimatedTotal}</p>
          <span className="shop-metrics__value" data-metric="total">
            {estimated.text}
          </span>
          <p className="shop-metrics__caption">{estimated.caption}</p>
        </Tile>
      ) : null}
      <Tile className="shop-metrics__scan-tile">
        {complete ? (
          <p className="shop-metrics__caption">{shopStrings.everyLineTicked}</p>
        ) : unpriced ? (
          <p className="shop-metrics__caption">{unpriced.text}</p>
        ) : null}
        {/* B9-43 (SSP-09): with every Line ticked the complete tile owns the one primary; Scan steps back to an outlined secondary */}
        <Button size="sm" icon="scan" variant={complete ? 'secondary' : 'primary'} className="shop-metrics__scan" onClick={onScan}>
          {shopStrings.scan}
        </Button>
      </Tile>
    </BentoGrid>
  )
}
