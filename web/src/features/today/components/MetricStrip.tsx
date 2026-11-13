import type { ReactElement } from 'react'
import { BentoGrid, Icon, Tile, TileMetric } from '../../../ui'
import type { Metric } from '../lib/metrics'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface MetricStripProps {
  metrics: Metric[]
}

/**
 * DS-TODAY: the metric strip, one labelled grid by minimum width (metric, so it fills its row). One status- or
 * soft-coloured tile per metric, each with its icon, the big value and its label. No tile is a button: the Leftovers
 * tile below owns the tap. Renders nothing for no metrics.
 */
export function MetricStrip({ metrics }: MetricStripProps): ReactElement | null {
  if (metrics.length === 0) return null
  return (
    <div className="today-metrics">
      <BentoGrid min="metric" label={s.metricsLabel}>
        {metrics.map((m) => (
          <Tile
            key={m.id}
            as="div"
            variant={m.tone === 'accent' ? 'soft' : 'status'}
            status={m.tone === 'accent' ? undefined : m.tone}
            data-metric={m.id}
          >
            <span className="today-metric__icon" aria-hidden="true">
              <Icon name={m.icon} size={20} />
            </span>
            <TileMetric value={m.value} label={m.label} />
          </Tile>
        ))}
      </BentoGrid>
    </div>
  )
}
