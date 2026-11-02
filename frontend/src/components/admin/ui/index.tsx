import { createContext, type ButtonHTMLAttributes, type FormHTMLAttributes, type InputHTMLAttributes, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import './ui.css'

type Tone = 'primary' | 'secondary' | 'quiet' | 'danger'
type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export function AdminButton({ className = '', tone = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button className={`admin-button admin-button--${tone} ${className}`.trim()} {...props} />
}

export function AdminCard({ className = '', children }: { className?: string; children: ReactNode }) {
  return <section className={`admin-card ${className}`.trim()}>{children}</section>
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`admin-status is-${tone}`}>{children}</span>
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="admin-empty-state"><strong>{title}</strong>{description && <p>{description}</p>}{action && <div>{action}</div>}</div>
}

export function Skeleton({ className = '', lines = 1 }: { className?: string; lines?: number }) {
  return <div className={`admin-skeleton ${className}`.trim()} aria-busy="true" aria-label="Đang tải">{Array.from({ length: lines }).map((_, index) => <i key={index} />)}</div>
}

export function AdminForm({ className = '', children, ...props }: FormHTMLAttributes<HTMLFormElement>) {
  return <form className={`admin-form ${className}`.trim()} {...props}>{children}</form>
}

export function FormRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`admin-form-row ${className}`.trim()}>{children}</div>
}

export function FormField({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className={`admin-form-field ${error ? 'has-error' : ''}`}><span>{label}</span>{children}{error ? <small role="alert">{error}</small> : hint && <em>{hint}</em>}</label>
}

export function DatePicker({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`admin-date-picker ${className}`.trim()} type="date" {...props} />
}

export function AdminModal({ open, title, description, children, onClose, className = '', placement = 'center' }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void; className?: string; placement?: 'center' | 'end' }) {
  const dialogRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusDialog = () => {
      const focusable = dialogRef.current?.querySelector<HTMLElement>(selector)
      ;(focusable || dialogRef.current)?.focus()
    }
    const frame = window.requestAnimationFrame(focusDialog)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(selector)]
      if (!focusable.length) {
        event.preventDefault()
        dialogRef.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null
  return <div className={`admin-modal-backdrop admin-modal-backdrop--${placement}`} role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section ref={dialogRef} className={`admin-modal admin-modal--${placement} ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" aria-describedby={description ? 'admin-modal-description' : undefined} tabIndex={-1}><header><div><h2 id="admin-modal-title">{title}</h2>{description && <p id="admin-modal-description">{description}</p>}</div><AdminButton tone="quiet" type="button" onClick={onClose} aria-label="Đóng">×</AdminButton></header><div className="admin-modal__body">{children}</div></section></div>
}

export type DataTableColumn<T> = { key: string; header: ReactNode; cell: (row: T) => ReactNode; className?: string }

export function DataTable<T>({ columns, rows, rowKey, empty }: { columns: DataTableColumn<T>[]; rows: T[]; rowKey: (row: T) => string | number; empty?: ReactNode }) {
  if (!rows.length && empty) return <>{empty}</>
  return <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr>{columns.map((column) => <th className={column.className} key={column.key}>{column.header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td className={column.className} key={column.key}>{column.cell(row)}</td>)}</tr>)}</tbody></table></div>
}

type Toast = { id: number; message: string; tone: StatusTone }
type ToastApi = { show: (message: string, tone?: StatusTone) => void }
const ToastContext = createContext<ToastApi | null>(null)

export function AdminToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const show = useCallback((message: string, tone: StatusTone = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4500)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return <ToastContext.Provider value={value}>{children}<div className="admin-toast-stack" aria-live="polite">{toasts.map((toast) => <div className={`admin-toast is-${toast.tone}`} key={toast.id}>{toast.message}</div>)}</div></ToastContext.Provider>
}

// Context hook is intentionally co-located with its provider.
// eslint-disable-next-line react-refresh/only-export-components
export function useAdminToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useAdminToast must be used inside AdminToastProvider.')
  return context
}
