// B9-19 (SHORT-04, decision SHORT 2): mounted once in AppShell. While a text field has focus on a coarse pointer it sets
// `html[data-keyboard="open"]` (the bottom bar steps aside) and `--keyboard-inset` (the StickyActionBar sits on the keyboard).
// Both clear KEYBOARD_RESTORE_MS after focus leaves, so moving field to field never flickers the bar back.
import { useEffect } from 'react'
import { isTextEntry, keyboardInset, keyboardOpen, KEYBOARD_RESTORE_MS } from './keyboard'
import { COARSE_QUERY } from './viewport'

const INSET_PROPERTY = '--keyboard-inset'

function coarsePointer(): boolean {
  return typeof globalThis.matchMedia === 'function' && globalThis.matchMedia(COARSE_QUERY).matches
}

export function useKeyboardInset(): void {
  useEffect(() => {
    const html = document.documentElement
    let isOpen = false
    let restore: ReturnType<typeof setTimeout> | undefined

    const cancelRestore = () => {
      if (restore !== undefined) clearTimeout(restore)
      restore = undefined
    }
    const measure = () => {
      const vv = globalThis.visualViewport
      const px = vv ? keyboardInset({ innerHeight: globalThis.innerHeight, vvHeight: vv.height, vvOffsetTop: vv.offsetTop }) : 0
      html.style.setProperty(INSET_PROPERTY, `${px}px`)
    }
    const close = () => {
      cancelRestore()
      isOpen = false
      html.removeAttribute('data-keyboard')
      html.style.removeProperty(INSET_PROPERTY)
    }

    const onFocusIn = (e: FocusEvent) => {
      if (!keyboardOpen({ coarse: coarsePointer(), textEntryFocused: isTextEntry(e.target as Element | null) })) return
      cancelRestore()
      isOpen = true
      html.setAttribute('data-keyboard', 'open')
      measure()
    }
    const onFocusOut = () => {
      if (!isOpen) return
      cancelRestore()
      restore = setTimeout(close, KEYBOARD_RESTORE_MS)
    }
    const onViewport = () => {
      if (isOpen) measure()
    }

    const vv = globalThis.visualViewport
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    vv?.addEventListener('resize', onViewport)
    vv?.addEventListener('scroll', onViewport)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      vv?.removeEventListener('resize', onViewport)
      vv?.removeEventListener('scroll', onViewport)
      close()
    }
  }, [])
}
