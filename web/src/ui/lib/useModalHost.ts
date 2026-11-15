// Batch w3e (B9-34 Take back, RES-03): a modal <dialog> makes everything outside it inert and draws over it, so a toast raised while a
// sheet stays open (Take back's "Your 50 g of Carrot was taken back", with Undo) was hidden under the scrim and its Undo unreachable.
// Nothing outside the top layer can sit above a modal dialog (a popover cannot either), so the toast region is portalled INTO the
// topmost open modal dialog while there is one. A non-modal dialog (data-modal="false", useModalDialog) is not a host.
import { useEffect, useState } from 'react'

/** The topmost open modal dialog (the last in document order: a stacked one is portalled after its opener), or null. */
export function topModalDialog(doc: Document = document): HTMLDialogElement | null {
  const open = [...doc.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter((d) => d.dataset['modal'] !== 'false')
  return open.length ? open[open.length - 1]! : null
}

export function useModalHost(): HTMLDialogElement | null {
  const [host, setHost] = useState<HTMLDialogElement | null>(null)
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    const update = () => setHost(topModalDialog())
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] })
    return () => mo.disconnect()
  }, [])
  return host
}
