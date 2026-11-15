// B9-20 (RES-02): the unknown state of a data screen: offline, and nothing ever loaded. Never an empty state, never an
// error, and no button: the screen fills itself when the connection returns.
import { Icon } from './Icon'
import './LoadState.css'

export interface LoadStateProps {
  title: string
  text: string
  /** default "Waiting for a connection" */
  status?: string
  in?: 'page' | 'tile'
  headingLevel?: 2 | 3
}

export function LoadState({ title, text, status = 'Waiting for a connection', in: where = 'page', headingLevel = 2 }: LoadStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <section className="load-state" role="status" data-in={where}>
      <div className="load-state__art" aria-hidden="true">
        <Icon name="offline" size={64} />
      </div>
      <Heading className="load-state__title">{title}</Heading>
      <p className="load-state__text">{text}</p>
      <p className="load-state__wait">
        <Icon name="offline" size={16} />
        <span>{status}</span>
      </p>
    </section>
  )
}
