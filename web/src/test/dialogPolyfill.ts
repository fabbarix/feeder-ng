// jsdom has HTMLDialogElement but no showModal()/close() behaviour. This polyfill emulates the parts
// the shared primitives rely on (docs/dev/design/wp4-primitives-b.md): `open`, `returnValue`, the
// `cancel` (Escape, cancelable) and `close` events, initial focus, and focus restore on close().
// Real browsers also make everything outside a modal dialog inert; that is NOT emulated (do not test it here).

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const modalStack: HTMLDialogElement[] = []
const opener = new WeakMap<HTMLDialogElement, Element | null>()

function topModal(): HTMLDialogElement | undefined {
  while (modalStack.length > 0) {
    const top = modalStack[modalStack.length - 1]
    if (top && top.isConnected && top.open) return top
    modalStack.pop()
  }
  return undefined
}

function focusInside(dialog: HTMLDialogElement): void {
  const target = dialog.querySelector<HTMLElement>('[autofocus]') ?? dialog.querySelector<HTMLElement>(FOCUSABLE)
  if (target) target.focus()
  else {
    if (!dialog.hasAttribute('tabindex')) dialog.setAttribute('tabindex', '-1')
    dialog.focus()
  }
}

export function installDialogPolyfill(): void {
  if (typeof HTMLDialogElement === 'undefined') return
  const proto = HTMLDialogElement.prototype
  if ((proto as { __feederPolyfill?: boolean }).__feederPolyfill === true) return
  if (typeof proto.showModal === 'function') return // a real implementation
  Object.defineProperty(proto, '__feederPolyfill', { value: true })

  proto.show = function show(this: HTMLDialogElement) {
    this.setAttribute('open', '')
    opener.set(this, document.activeElement)
    focusInside(this)
  }
  proto.showModal = function showModal(this: HTMLDialogElement) {
    if (this.open) throw new DOMException('The dialog is already open', 'InvalidStateError')
    this.setAttribute('open', '')
    opener.set(this, document.activeElement)
    modalStack.push(this)
    focusInside(this)
  }
  proto.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.open) return
    this.removeAttribute('open')
    if (returnValue !== undefined) this.returnValue = returnValue
    const i = modalStack.indexOf(this)
    if (i >= 0) modalStack.splice(i, 1)
    const from = opener.get(this)
    if (from instanceof HTMLElement && from.isConnected) from.focus()
    this.dispatchEvent(new Event('close'))
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    const dialog = topModal()
    if (!dialog) return
    const cancel = new Event('cancel', { cancelable: true })
    dialog.dispatchEvent(cancel)
    if (!cancel.defaultPrevented) dialog.close()
  })
}
