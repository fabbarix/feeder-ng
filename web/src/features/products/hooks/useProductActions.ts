import { useNavigate } from 'react-router-dom'
import { useConfirm, useToast, useUndoToast } from '../../../ui'
import { deleteOutcome } from '../lib/archive'
import { errorText } from '../lib/productForm'
import { strings } from '../strings'
import type { ProductDetail } from '../types'
import type { UseProduct } from './useProduct'
import { useAttempt } from './useAttempt'

/**
 * The Product page's archive and delete flows (R8). Archive acts at once with Undo (SAFE-02); Unarchive acts at once. Delete asks with a danger
 * dialog; on 409 product_bought it offers to archive instead ("Keep" leaves the Product active), and any other failure is
 * shown as an alert. The server decides what may be deleted.
 */
export function useProductActions(product: ProductDetail | undefined, p: UseProduct) {
  const dialogs = useConfirm()
  const toast = useToast()
  const undo = useUndoToast()
  const navigate = useNavigate()
  const { error, setError, attempt } = useAttempt()

  const setArchived = async (archived: boolean) => {
    if (!product) return
    const ok = await attempt(() => (archived ? p.archive() : p.unarchive()))
    if (ok) toast.show(archived ? strings.archivedToast(product.name) : strings.unarchivedToast(product.name), { status: 'success' })
  }

  // SAFE-02: Archive loses nothing, so it acts at once and offers Undo (which unarchives).
  const archive = async () => {
    if (!product) return
    const ok = await attempt(() => p.archive())
    if (ok) undo.show({ headline: strings.archivedToast(product.name), undo: () => p.unarchive() })
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
        // the delete was refused; archiving instead loses nothing, so Archive keeps focus (B9-18)
        focus: 'confirm',
      })
      if (archiveInstead) await setArchived(true)
    }
  }

  return { error, archive, unarchive, remove }
}
