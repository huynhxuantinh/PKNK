import type { Notification } from "../types/api";

export const ADMIN_BRANCH_NOTIFICATIONS_PATH = "/quan-ly-chi-nhanh/thong-bao";
export const ADMIN_ORGANIZATION_NOTIFICATIONS_PATH = "/quan-ly-to-chuc/thong-bao";

export function adminNotificationsPath(pathname: string) {
  return pathname.startsWith("/quan-ly-to-chuc")
    ? ADMIN_ORGANIZATION_NOTIFICATIONS_PATH
    : ADMIN_BRANCH_NOTIFICATIONS_PATH;
}

function localAppointmentDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function adminAppointmentPath(
  notification: Notification,
  pathname: string,
  search: string,
) {
  if (notification.resource_type !== "Appointment") return null;

  const params = new URLSearchParams(search);
  const code = notification.payload.public_code;
  const branchId = notification.payload.branch_id;
  const date = localAppointmentDate(notification.payload.starts_at);
  if (typeof code === "string" && code) params.set("appointment", code);
  if (typeof branchId === "number" || typeof branchId === "string") {
    params.set("chi-nhanh", String(branchId));
  }
  if (date) params.set("date", date);

  const route = pathname.startsWith("/quan-ly-to-chuc")
    ? "/quan-ly-to-chuc/lich-hen"
    : "/quan-ly-chi-nhanh/lich-hen";
  const query = params.toString();
  return query ? `${route}?${query}` : route;
}
