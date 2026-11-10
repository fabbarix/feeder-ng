import { Link } from 'react-router-dom'
import { ListGroup, ListRow, PageHeader, Tile } from '../../../ui'
import { AccessRequestList } from '../components/AccessRequestList'
import { useAccessRequestsPage } from '../hooks/useAccessRequestsPage'
import { agoText, historyLine } from '../lib/format'
import { accessStrings } from '../strings'
import '../access.css'

/** /settings/access-requests: the pending requests, any User may answer them, plus the recent history. */
export function AccessRequestsPage() {
  const page = useAccessRequestsPage()
  return (
    <div className="access">
      <PageHeader title={accessStrings.title} leading={<Link to="/settings">{accessStrings.backToSettings}</Link>} />
      <Tile as="section" span="full" aria-label={accessStrings.title}>
        <AccessRequestList requests={page.requests} now={page.now} onApprove={page.approve} onDeny={page.deny} />
      </Tile>
      <section className="access__stack">
        <h2 className="access__overline">{accessStrings.history}</h2>
        {page.events.length === 0 ? (
          <p className="access__muted">{accessStrings.historyEmpty}</p>
        ) : (
          <ListGroup label={accessStrings.history}>
            {page.events.map((e, i) => (
              <ListRow key={`${e.at}-${e.kind}-${e.email}-${i}`} title={historyLine(e)} meta={agoText(e.at, page.now)} />
            ))}
          </ListGroup>
        )}
      </section>
    </div>
  )
}
