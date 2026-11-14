// The receipt pages' header. The wrapper's marker lets receipt.css space the header and keep the sticky bar at the foot (b8-rxweb, design 3.3).
import { PageHeader, type PageHeaderProps } from '../../../ui'

export function ReceiptPageHeader(props: PageHeaderProps) {
  return (
    <div className="receipt-page-header">
      <PageHeader {...props} />
    </div>
  )
}
