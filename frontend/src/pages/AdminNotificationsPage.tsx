import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import type { Notification, NotificationsResponse } from "../types/api";
import { adminAppointmentPath } from "../notifications/adminNotificationNavigation";

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminNotificationsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[] | null>(null);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<NotificationsResponse["meta"] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await apiRequest<NotificationsResponse>(
        `/notifications/?page=${page}`,
        {},
        { auth: true },
      );
      setItems(response.data);
      setMeta(response.meta);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Không thể tải thông báo.",
      );
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(notification: Notification) {
    if (notification.read_at) return true;
    try {
      await apiRequest(
        `/notifications/${notification.id_notification}/read/`,
        { method: "POST" },
        { auth: true },
      );
      setItems((current) =>
        current?.map((item) =>
          item.id_notification === notification.id_notification
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ) ?? null,
      );
      setMeta((current) => current
        ? { ...current, unread_count: Math.max(0, current.unread_count - 1) }
        : current);
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể cập nhật thông báo.",
      );
      return false;
    }
  }

  async function openNotification(notification: Notification) {
    const destination = adminAppointmentPath(
      notification,
      location.pathname,
      location.search,
    )
    if (destination) {
      void markRead(notification)
      navigate(destination)
      return
    }
    setBusyId(notification.id_notification);
    await markRead(notification);
    setBusyId(null);
  }

  async function markAllRead() {
    setMarkingAll(true);
    setError("");
    try {
      await apiRequest(
        "/notifications/read-all/",
        { method: "POST" },
        { auth: true },
      );
      const now = new Date().toISOString();
      setItems(
        (current) =>
          current?.map((item) => ({ ...item, read_at: item.read_at || now })) ??
          null,
      );
      setMeta((current) => current ? { ...current, unread_count: 0 } : current);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể cập nhật thông báo.",
      );
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = meta?.unread_count ?? 0;

  return (
    <main className="admin-notifications-page">
      <header className="admin-notifications-heading">
        <div>
          <p className="admin-notifications-eyebrow">Hộp thư vận hành</p>
          <h1>Thông báo</h1>
          <p>Lịch sử thông báo của tài khoản quản lý.</p>
        </div>
        <button
          type="button"
          className="admin-notifications-mark-all"
          disabled={!unreadCount || markingAll}
          onClick={() => void markAllRead()}
        >
          {markingAll ? "Đang cập nhật…" : `Đánh dấu đã đọc (${unreadCount})`}
        </button>
      </header>

      {error && (
        <div className="admin-notifications-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            Thử lại
          </button>
        </div>
      )}
      {items === null && !error && (
        <p className="admin-notifications-state" role="status">
          Đang tải thông báo…
        </p>
      )}
      {items?.length === 0 && (
        <p className="admin-notifications-state">Chưa có thông báo.</p>
      )}
      {items && items.length > 0 && (
        <section className="admin-notifications-list" aria-label="Lịch sử thông báo">
          {items.map((item) => (
            <button
              type="button"
              className={`admin-notifications-row${item.read_at ? "" : " is-unread"}`}
              key={item.id_notification}
              disabled={busyId === item.id_notification}
              onClick={() => void openNotification(item)}
            >
              <span className="admin-notifications-row__content">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <time dateTime={item.created_at}>
                  {formatCreatedAt(item.created_at)}
                  {item.read_at ? " · Đã đọc" : " · Chưa đọc"}
                </time>
              </span>
              {item.resource_type === "Appointment" && (
                <span className="admin-notifications-row__action">
                  Mở lịch hẹn
                </span>
              )}
            </button>
          ))}
        </section>
      )}
      {meta && meta.total_pages > 1 && (
        <nav className="admin-notifications-pagination" aria-label="Phân trang thông báo">
          <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Trước</button>
          <span>Trang {meta.page} / {meta.total_pages} · {meta.count} thông báo</span>
          <button type="button" disabled={page >= meta.total_pages} onClick={() => setPage((current) => current + 1)}>Sau</button>
        </nav>
      )}
    </main>
  );
}
