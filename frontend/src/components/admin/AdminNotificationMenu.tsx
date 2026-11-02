import { useCallback, useEffect, useRef, useState } from 'react'

import { apiRequest } from '../../api/client'
import type { Notification, NotificationsResponse } from '../../types/api'

function relativeTime(value: string) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000))
  if (seconds < 60) return 'Vừa xong'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export function AdminNotificationMenu() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const controllerRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true)
    setError('')
    try {
      const response = await apiRequest<NotificationsResponse>(
        '/notifications/?unread=true',
        { signal: controller.signal },
        { auth: true },
      )
      if (!controller.signal.aborted) {
        setItems(response.data)
        setCount(response.meta.count)
      }
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError instanceof Error ? requestError.message : 'Không thể tải thông báo.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const intervalId = window.setInterval(() => void load(), 30_000)
    return () => {
      window.clearInterval(intervalId)
      controllerRef.current?.abort()
    }
  }, [load])

  async function markRead(notification: Notification) {
    if (notification.read_at) return
    try {
      await apiRequest(`/notifications/${notification.id_notification}/read/`, { method: 'POST' }, { auth: true })
      setItems((current) => current.filter((item) => item.id_notification !== notification.id_notification))
      setCount((current) => Math.max(0, current - 1))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể cập nhật thông báo.')
    }
  }

  async function markAllRead() {
    try {
      await apiRequest('/notifications/read-all/', { method: 'POST' }, { auth: true })
      setItems([])
      setCount(0)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể cập nhật thông báo.')
    }
  }

  return (
    <div className="admin-notification-menu">
      <button
        className="admin-notification-trigger"
        type="button"
        aria-label={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {count > 0 && <span className="admin-notification-count">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <section className="admin-notification-popover" aria-label="Thông báo chưa đọc">
          <header>
            <div><strong>Thông báo</strong><span>{count ? `${count} chưa đọc` : 'Đã đọc hết'}</span></div>
            {count > 0 && <button type="button" onClick={() => void markAllRead()}>Đánh dấu đã đọc</button>}
          </header>
          {loading && <p className="admin-notification-state">Đang tải thông báo…</p>}
          {!loading && error && <div className="admin-notification-state is-error"><span>{error}</span><button type="button" onClick={() => void load()}>Thử lại</button></div>}
          {!loading && !error && !items.length && <p className="admin-notification-state">Chưa có thông báo mới.</p>}
          {!loading && !error && items.slice(0, 8).map((notification) => (
            <button className="admin-notification-item" type="button" key={notification.id_notification} onClick={() => void markRead(notification)}>
              <strong>{notification.title}</strong>
              <span>{notification.body}</span>
              <time dateTime={notification.created_at}>{relativeTime(notification.created_at)}</time>
            </button>
          ))}
        </section>
      )}
    </div>
  )
}
