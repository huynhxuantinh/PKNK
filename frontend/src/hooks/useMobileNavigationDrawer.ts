import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useMobileNavigationDrawer(
  open: boolean,
  onClose: () => void,
  triggerRef: RefObject<HTMLButtonElement | null>,
  drawerRef: RefObject<HTMLDivElement | null>,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const drawer = drawerRef.current
    if (!drawer) return
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : triggerRef.current
    const focusable = () => Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector))
    const frame = window.requestAnimationFrame(() => {
      focusable()[0]?.focus()
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) {
        event.preventDefault()
        drawer.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [drawerRef, open, triggerRef])

  useEffect(() => {
    if (!open || typeof window === 'undefined') return
    const desktopQuery = window.matchMedia('(min-width: 1121px)')
    const closeOnDesktop = () => {
      if (desktopQuery.matches) onCloseRef.current()
    }
    desktopQuery.addEventListener('change', closeOnDesktop)
    closeOnDesktop()
    return () => desktopQuery.removeEventListener('change', closeOnDesktop)
  }, [open])
}
