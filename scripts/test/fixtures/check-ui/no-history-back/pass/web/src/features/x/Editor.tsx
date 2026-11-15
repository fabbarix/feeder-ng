// fixture: leaving by a known route with replace, and the one allowed use of history: a back that only runs when the app has history.
import { useLocation, useNavigate } from 'react-router-dom'

export function Editor({ id }: { id?: number }) {
  const navigate = useNavigate()
  const location = useLocation()
  const leave = () => {
    if (location.key !== 'default') navigate(-1)
  }
  return (
    <>
      <button onClick={() => navigate(id === undefined ? '/recipes' : `/recipes/${id}`, { replace: true })}>Cancel</button>
      <button onClick={leave}>Back</button>
      {/* not a history call: */}
      <button onClick={() => navigate(1)}>Forward</button>
      <button onClick={() => navigate('/plan')}>Plan</button>
    </>
  )
}
