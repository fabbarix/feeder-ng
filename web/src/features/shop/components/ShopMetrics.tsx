// DS-SHOP (docs/design/system.md §2, §4): the header metrics as a metric strip (BentoGrid min="metric"): "Left to get" with its
// progress, the estimated total, and the Scan tile (the one primary action). Render only.
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
  const { left, ticked, total, estimated, unpriced } = summary
  const percent = total > 0 ? Math.min(100, (ticked / total) * 100) : 0
  return (
    <BentoGrid min="metric" label={shopStrings.summary}>
      <Tile variant="soft" className="shop-metrics__tile">
        <div role="progressbar" aria-label={shopStrings.leftToGet} aria-valuemin={0} aria-valuemax={total} aria-valuenow={ticked} className="shop-metrics__bar">
          <span className="shop-metrics__fill" style={{ inlineSize: `${percent}%` }} />
        </div>
        <p className="shop-metrics__label">{shopStrings.leftToGet}</p>
        <span className="shop-metrics__value" data-metric="left">
          {left}
        </span>
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
      <Tile className="shop-metrics__tile">
        {unpriced ? <p className="shop-metrics__caption">{unpriced.text}</p> : null}
        <Button size="sm" icon="scan" onClick={onScan}>
          {shopStrings.scan}
        </Button>
      </Tile>
    </BentoGrid>
  )
}
