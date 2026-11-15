import type { ReactElement, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BentoGrid, Icon, Tile, TileMetric } from '../../../ui'
import type { Metric } from '../lib/metrics'
import { todayStrings as s } from '../strings'
import '../today.css'

export interface MetricStripProps {
  metrics: Metric[]
}

/** Where the Lines to get metric leads (TB-03). */
const LINES_LINK = '/shop'

/**
 * DS-TODAY: the metric strip, one labelled grid by minimum width (metric, so it fills its row). One status- or neutral-coloured tile per
 * metric: its value and icon in one row (B9-44, TB-03: the icon can never cover the number), then its label. "Lines to get" is a link to the
 * Shop (its whole tile); the streak and Leftovers are not interactive. A value with a short unit is spelled out for assistive technology
 * ("12 d" reads "12 days", TB-08). Renders nothing for no metrics.
 */
export function MetricStrip({ metrics }: MetricStripProps): ReactElement | null {
  if (metrics.length === 0) return null
  return (
    <div className="today-metrics">
      <BentoGrid min="metric" label={s.metricsLabel}>
        {metrics.map((m) => {
          const body: ReactNode = (
            <>
              <span className="today-metric__head">
                <TileMetric value={m.value} label={m.label} name={m.name} />
                <span className="today-metric__icon" aria-hidden="true">
                  <Icon name={m.icon} size={20} />
                </span>
              </span>
            </>
          )
          return (
            <Tile
              key={m.id}
              as="div"
              variant={m.tone === 'neutral' ? 'surface' : 'status'}
              status={m.tone === 'neutral' ? undefined : m.tone}
              className="today-metric"
              data-metric={m.id}
            >
              {m.id === 'lines' ? (
                <Link className="today-metric__link" to={LINES_LINK}>
                  {body}
                </Link>
              ) : (
                <span className="today-metric__body">{body}</span>
              )}
            </Tile>
          )
        })}
      </BentoGrid>
    </div>
  )
}
