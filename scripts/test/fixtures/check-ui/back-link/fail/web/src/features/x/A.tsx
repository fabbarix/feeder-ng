import { BackLink, PageHeader } from '../../ui'
import { IconButton } from '../../ui'
import { Link, useNavigate } from 'react-router-dom'

export const A = () => {
  const navigate = useNavigate()
  return (
    <div>
      <PageHeader title="X" leading={<BackLink to="/settings" label="Settings" />} />
      <Link to="/products">Back to Products</Link>
      <IconButton icon="back" label="Back" onClick={() => navigate('/recipes')} />
    </div>
  )
}
