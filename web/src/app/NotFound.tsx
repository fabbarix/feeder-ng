import { useNavigate } from 'react-router-dom'
import { Button, EmptyState } from '../ui'
import { useDocumentTitle } from '../ui/lib/useDocumentTitle'
import { shellStrings } from './strings'

/**
 * The `*` route: a page-not-found state inside the shell (or chromeless frame), with a way back to Today. It is the whole page, so its
 * title is the page's h1 and the document is titled "Page not found · Feeder" (A11Y-01).
 */
export function NotFound() {
  const navigate = useNavigate()
  useDocumentTitle([shellStrings.notFoundTitle])
  return (
    <EmptyState
      headingLevel={1}
      icon="info"
      title={shellStrings.notFoundTitle}
      description={shellStrings.notFoundText}
      action={
        <Button variant="primary" onClick={() => navigate('/')}>
          {shellStrings.goToToday}
        </Button>
      }
    />
  )
}
