import { useMemo, useState } from "react";

import type { ManagementAppointment } from "../../api/management";
import { DataTable, EmptyState, StatusBadge } from "../admin/ui";
import {
  appointmentStatusLabels,
  hcmDate,
  hcmTime,
} from "./appointmentPresentation";
import "./appointment-list.css";
import "./appointment-detail-drawer.css";

type AppointmentAction = "confirm" | "check-in" | "no-show";

interface AppointmentListProps {
  items: ManagementAppointment[] | null;
  busyCode: string;
  onAction: (item: ManagementAppointment, action: AppointmentAction) => void;
  onCancel: (item: ManagementAppointment) => void;
  onReschedule: (item: ManagementAppointment) => void;
}

function statusTone(status: ManagementAppointment["status"]) {
  if (status === "PENDING" || status === "HELD") return "warning" as const;
  if (
    status === "CHECKED_IN" ||
    status === "IN_PROGRESS" ||
    status === "COMPLETED"
  )
    return "success" as const;
  if (status === "CANCELLED" || status === "NO_SHOW" || status === "EXPIRED")
    return "danger" as const;
  return "info" as const;
}

export function ManagementErrorBanner({ message }: { message: string }) {
  return (
    <div className="dentist-error" role="alert">
      {message}
    </div>
  );
}

export function AppointmentList({
  items,
  busyCode,
  onAction,
  onCancel,
  onReschedule,
}: AppointmentListProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ManagementAppointment | null>(null);
  const rows = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    if (!keyword || !items) return items || [];
    return items.filter((item) =>
      [
        item.patient_name,
        item.service_name_snapshot,
        item.dentist_name,
        item.contact_phone_snapshot,
        item.patient_phone,
        item.public_code,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("vi-VN").includes(keyword),
        ),
    );
  }, [items, query]);

  if (!items) return <div className="dentist-empty">Đang tải lịch hẹn...</div>;

  return (
    <div className="appointment-list">
      <div className="appointment-list__toolbar">
        <label>
          <span>Tìm nhanh</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên bệnh nhân, dịch vụ, mã lịch..."
          />
        </label>
        <small>{rows.length} lịch phù hợp</small>
      </div>
      <DataTable
        rows={rows}
        rowKey={(item) => item.public_code}
        empty={
          <EmptyState
            title="Không có lịch hẹn"
            description="Thử thay đổi bộ lọc hoặc ngày xem."
          />
        }
        columns={[
          {
            key: "time",
            header: "Thời gian",
            cell: (item) => (
              <div className="appointment-list__time">
                <strong>{hcmTime(item.starts_at)}</strong>
                <span>{hcmDate(new Date(item.starts_at))}</span>
              </div>
            ),
          },
          {
            key: "patient",
            header: "Bệnh nhân",
            cell: (item) => (
              <div className="appointment-list__patient">
                <strong>{item.patient_name}</strong>
                <small>{item.patient_phone || "Chưa có số điện thoại"}</small>
                {item.contact_name_snapshot &&
                  item.contact_name_snapshot !== item.patient_name && (
                    <em>Liên hệ: {item.contact_name_snapshot}</em>
                  )}
              </div>
            ),
          },
          {
            key: "service",
            header: "Dịch vụ",
            cell: (item) => (
              <div className="appointment-list__service">
                <strong>{item.service_name_snapshot}</strong>
                <small>{item.dentist_name}</small>
              </div>
            ),
          },
          {
            key: "status",
            header: "Trạng thái",
            cell: (item) => (
              <StatusBadge tone={statusTone(item.status)}>
                {appointmentStatusLabels[item.status]}
              </StatusBadge>
            ),
          },
          {
            key: "actions",
            header: "Thao tác",
            className: "appointment-list__actions-cell",
            cell: (item) => {
              const busy = busyCode === item.public_code;
              return (
                <div className="appointment-list__actions">
                  <button
                    className="is-detail"
                    type="button"
                    onClick={() => setSelected(item)}
                  >
                    Xem chi tiết
                  </button>
                  {item.status === "PENDING" && (
                    <button
                      disabled={busy}
                      onClick={() => onAction(item, "confirm")}
                    >
                      Xác nhận
                    </button>
                  )}
                  {item.status === "CONFIRMED" && (
                    <button
                      disabled={busy}
                      onClick={() => onAction(item, "check-in")}
                    >
                      Check-in
                    </button>
                  )}
                  {["PENDING", "CONFIRMED"].includes(item.status) && (
                    <button
                      className="is-quiet"
                      onClick={() => onReschedule(item)}
                    >
                      Dời lịch
                    </button>
                  )}
                  {["PENDING", "CONFIRMED", "CHECKED_IN"].includes(
                    item.status,
                  ) && (
                    <button
                      className="is-danger"
                      onClick={() => onCancel(item)}
                    >
                      Hủy
                    </button>
                  )}
                  {item.status === "CONFIRMED" && (
                    <button
                      className="is-quiet"
                      disabled={busy}
                      onClick={() => onAction(item, "no-show")}
                    >
                      Không đến
                    </button>
                  )}
                </div>
              );
            },
          },
        ]}
      />
      {selected && (
        <div
          className="appointment-detail-drawer__backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <aside
            className="appointment-detail-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appointment-detail-title"
            onKeyDown={(event) => event.key === "Escape" && setSelected(null)}
            tabIndex={-1}
          >
            <header>
              <div>
                <p className="eyebrow">Chi tiết lịch hẹn</p>
                <h2 id="appointment-detail-title">{selected.public_code}</h2>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </header>
            <div className="appointment-detail-drawer__body">
              <div className="appointment-detail-drawer__status">
                <StatusBadge tone={statusTone(selected.status)}>
                  {appointmentStatusLabels[selected.status]}
                </StatusBadge>
                <span>
                  {hcmDate(new Date(selected.starts_at))} ·{" "}
                  {hcmTime(selected.starts_at)} – {hcmTime(selected.ends_at)}
                </span>
              </div>
              <section>
                <h3>Bệnh nhân khám</h3>
                <dl>
                  <div>
                    <dt>Họ và tên</dt>
                    <dd>{selected.patient_name}</dd>
                  </div>
                  <div>
                    <dt>Số điện thoại hồ sơ</dt>
                    <dd>{selected.patient_phone || "Chưa cập nhật"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Người liên hệ khi đặt lịch</h3>
                <p className="appointment-detail-drawer__hint">
                  Thông tin này có thể khác bệnh nhân khi đặt lịch hộ.
                </p>
                <dl>
                  <div>
                    <dt>Họ và tên liên hệ</dt>
                    <dd>
                      {selected.contact_name_snapshot || selected.patient_name}
                    </dd>
                  </div>
                  <div>
                    <dt>Số điện thoại liên hệ</dt>
                    <dd>
                      {selected.contact_phone_snapshot ||
                        selected.patient_phone ||
                        "Chưa cập nhật"}
                    </dd>
                  </div>
                  <div>
                    <dt>Email liên hệ</dt>
                    <dd>
                      {selected.contact_email_snapshot || "Chưa cập nhật"}
                    </dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Thông tin khám</h3>
                <dl>
                  <div>
                    <dt>Dịch vụ</dt>
                    <dd>{selected.service_name_snapshot}</dd>
                  </div>
                  <div>
                    <dt>Nha sĩ</dt>
                    <dd>{selected.dentist_name}</dd>
                  </div>
                  <div>
                    <dt>Ghế / phòng</dt>
                    <dd>{selected.chair_name || "Chưa phân ghế"}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Ghi chú của người đặt</h3>
                <p className="appointment-detail-drawer__note">
                  {selected.patient_note || "Không có ghi chú."}
                </p>
              </section>
              {selected.cancel_reason && (
                <section className="appointment-detail-drawer__cancel">
                  <h3>Lý do hủy lịch</h3>
                  <p>{selected.cancel_reason}</p>
                </section>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
