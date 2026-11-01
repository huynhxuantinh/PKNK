import { createContext, type ButtonHTMLAttributes, type FormHTMLAttributes, type InputHTMLAttributes, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

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

export function AdminModal({ open, title, description, children, onClose }: { open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" aria-describedby={description ? 'admin-modal-description' : undefined} onKeyDown={(event) => event.key === 'Escape' && onClose()} tabIndex={-1}><header><div><h2 id="admin-modal-title">{title}</h2>{description && <p id="admin-modal-description">{description}</p>}</div><AdminButton tone="quiet" type="button" onClick={onClose} aria-label="Đóng">×</AdminButton></header><div className="admin-modal__body">{children}</div></section></div>
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

export function useAdminToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useAdminToast must be used inside AdminToastProvider.')
  return context
}
