import { useNavigate } from 'react-router-dom'
import { useConfirm, useToast } from '../../../ui'
import { deleteOutcome } from '../lib/archive'
import { errorText } from '../lib/productForm'
import { strings } from '../strings'
import type { ProductDetail } from '../types'
import type { UseProduct } from './useProduct'
import { useAttempt } from './useAttempt'

/**
 * The Product page's archive and delete flows (R8). Archive asks first; Unarchive acts at once. Delete asks with a danger
 * dialog; on 409 product_bought it offers to archive instead ("Keep" leaves the Product active), and any other failure is
 * shown as an alert. The server decides what may be deleted.
 */
export function useProductActions(product: ProductDetail | undefined, p: UseProduct) {
  const dialogs = useConfirm()
  const toast = useToast()
  const navigate = useNavigate()
  const { error, setError, attempt } = useAttempt()

  const setArchived = async (archived: boolean) => {
    if (!product) return
    const ok = await attempt(() => (archived ? p.archive() : p.unarchive()))
    if (ok) toast.show(archived ? strings.archivedToast(product.name) : strings.unarchivedToast(product.name), { status: 'success' })
  }

  const archive = async () => {
    if (!product) return
    const yes = await dialogs.confirm({ title: strings.archiveTitle(product.name), body: strings.archiveBody, confirmLabel: strings.archive })
    if (yes) await setArchived(true)
  }

  const unarchive = () => setArchived(false)

  const remove = async () => {
    if (!product) return
    const yes = await dialogs.confirm({
      title: strings.deleteTitle(product.name),
      body: strings.deleteBody,
      confirmLabel: strings.deleteConfirm,
      tone: 'danger',
    })
    if (!yes) return
    setError(null)
    try {
      await p.remove()
      navigate('/products')
    } catch (e) {
      if (deleteOutcome(e) !== 'bought') {
        setError(errorText(e))
        return
      }
      const archiveInstead = await dialogs.confirm({
        title: strings.boughtTitle(product.name),
        body: strings.boughtBody,
        confirmLabel: strings.archive,
        cancelLabel: strings.keep,
      })
      if (archiveInstead) await setArchived(true)
    }
  }

  return { error, archive, unarchive, remove }
}
