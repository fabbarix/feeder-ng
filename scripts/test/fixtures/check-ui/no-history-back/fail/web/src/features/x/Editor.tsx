// fixture: four ways to leave an editor by history. Each is a violation; the comment below is not.
import { useNavigate } from 'react-router-dom'

export function Editor() {
  const navigate = useNavigate()
  // navigate(-1) in a comment does not count
  return (
    <>
      <button onClick={() => navigate(-1)}>Cancel</button>
      <button onClick={() => window.history.back()}>Back</button>
      <button onClick={() => history.back()}>Back too</button>
      <button onClick={() => history.go(-1)}>Back three</button>
    </>
  )
}
