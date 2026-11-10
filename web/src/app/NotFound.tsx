import { useNavigate } from 'react-router-dom'
import { Button, EmptyState } from '../ui'
import { shellStrings } from './strings'

/** The `*` route: a page-not-found state inside the shell (or chromeless frame), with a way back to Today. */
export function NotFound() {
  const navigate = useNavigate()
  return (
    <EmptyState
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
