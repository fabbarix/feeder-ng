// Mentioning BackLink in a comment is fine; only code is scanned.
import { Breadcrumbs, Button, IconButton } from '../../ui'

export const A = ({ onChangeShop }: { onChangeShop: () => void }) => (
  <div>
    <Breadcrumbs items={[{ label: 'Settings', to: '/settings' }, { label: 'Meal Slots' }]} />
    {/* a back step inside one screen is not a page hierarchy link */}
    <IconButton icon="back" label="Back" onClick={onChangeShop} />
    <Button>Back to Today</Button>
  </div>
)
