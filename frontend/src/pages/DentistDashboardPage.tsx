import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { listDentistSchedule, startDentistAppointment } from "../api/dentist";
import { getBranchDetail } from "../api/booking";
import { AuthBar } from "../auth/AuthBar";
import { useAuth } from "../auth/AuthContext";
import { activeBranchIdsForRole, hasActiveRole } from "../auth/roles";
import {
  filterDentistSchedule,
  scheduleRange,
  type DentistScheduleView,
} from "../features/dentist/dentistSchedule";
import { Seo } from "../seo/Seo";
import "./DentistLegacy.css";
import type {
  BranchDetail,
  DentistAppointment,
  DentistAppointmentStatus,
} from "../types/api";
import {
  formatHcmDay,
  formatHcmTime,
  hcmDate,
  HCM_TIME_ZONE,
  isOnHcmDay,
} from "../utils/hcmDateTime";
import styles from "./DentistDashboardPage.module.css";

const statusLabel: Record<DentistAppointmentStatus, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  CHECKED_IN: "Đã đến khám",
  IN_PROGRESS: "Đang khám",
  COMPLETED: "Đã hoàn tất",
  CANCELLED: "Đã hủy",
  NO_SHOW: "Không đến",
};

const SCHEDULE_REFRESH_MS = 30_000;

function appointmentInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function bookingContactPhone(appointment: DentistAppointment) {
  return appointment.contact_phone_snapshot || appointment.patient_phone;
}

export function DentistDashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<DentistAppointment[] | null>(
    null,
  );
  const [workingBranches, setWorkingBranches] = useState<BranchDetail[] | null>(
    null,
  );
  const [error, setError] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [branchesError, setBranchesError] = useState("");
  const [startingCode, setStartingCode] = useState("");
  const [scheduleReload, setScheduleReload] = useState(0);
  const [branchReload, setBranchReload] = useState(0);
  const [scheduleView, setScheduleView] =
    useState<DentistScheduleView>("UPCOMING");
  const [activeNavSection, setActiveNavSection] = useState<"overview" | "schedule" | "branch">("overview");
  const [selectedDate, setSelectedDate] = useState(() => hcmDate(new Date()));
  const [dayFilter, setDayFilter] = useState<"ALL" | "TODAY" | "TOMORROW">(
    "ALL",
  );
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | DentistAppointmentStatus
  >("ALL");
  const selectedBranchId = Number(searchParams.get("chi-nhanh")) || null;

  useEffect(() => {
    const updateActiveSection = () => {
      const branchTop = document.getElementById("branch")?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      const scheduleTop = document.getElementById("schedule")?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      if (scheduleTop <= 100) setActiveNavSection("schedule");
      else if (branchTop <= 100) setActiveNavSection("branch");
      else setActiveNavSection("overview");
    };
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    updateActiveSection();
    return () => window.removeEventListener("scroll", updateActiveSection);
  }, []);

  const assignedBranchIds = useMemo(
    () => activeBranchIdsForRole(user, "DENTIST"),
    [user],
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    let loading = false;
    const { start, end } = scheduleRange(scheduleView, selectedDate);

    const loadSchedule = async (showLoading = false) => {
      if (loading) return;
      loading = true;
      if (showLoading) {
        setAppointments(null);
        setScheduleError("");
      }
      try {
        const response = await listDentistSchedule(start, end);
        if (!active) return;
        setAppointments(response.data);
        setScheduleError("");
      } catch (reason) {
        if (active && showLoading) {
          setScheduleError(
            reason instanceof Error
              ? reason.message
              : "Không thể tải lịch khám.",
          );
        }
      } finally {
        loading = false;
      }
    };

    void loadSchedule(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadSchedule();
    }, SCHEDULE_REFRESH_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadSchedule();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isAuthenticated, scheduleView, selectedDate, scheduleReload]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (assignedBranchIds.length === 0) {
      setWorkingBranches([]);
      return;
    }
    let active = true;
    setWorkingBranches(null);
    setBranchesError("");
    Promise.allSettled(
      assignedBranchIds.map((branchId) => getBranchDetail(branchId)),
    ).then((results) => {
      if (!active) return;
      const branches = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value.data] : [],
      );
      setWorkingBranches(branches);
      if (branches.length !== assignedBranchIds.length) {
        setBranchesError("Không thể tải đầy đủ thông tin chi nhánh.");
      }
    });
    return () => {
      active = false;
    };
  }, [assignedBranchIds, branchReload, isAuthenticated]);

  const visibleAppointments = useMemo(() => {
    const anchorDate = new Date(`${selectedDate}T00:00:00+07:00`);
    return filterDentistSchedule(appointments || [], selectedBranchId, scheduleView, "ALL")
      .filter((appointment) => scheduleView === "HISTORY"
        || dayFilter === "ALL"
        || (dayFilter === "TODAY" && isOnHcmDay(appointment.starts_at, 0, anchorDate))
        || (dayFilter === "TOMORROW" && isOnHcmDay(appointment.starts_at, 1, anchorDate)));
  }, [appointments, dayFilter, scheduleView, selectedBranchId, selectedDate]);

  const priorityAppointments = useMemo(
    () => visibleAppointments
      .filter((item) => item.status === "IN_PROGRESS" || item.status === "CHECKED_IN")
      .sort((left, right) => {
        if (left.status !== right.status) return left.status === "IN_PROGRESS" ? -1 : 1;
        return left.starts_at.localeCompare(right.starts_at);
      }),
    [visibleAppointments],
  );

  const selectedBranch = workingBranches?.find((branch) => branch.id_branch === selectedBranchId);
  const currentAppointment = priorityAppointments.find((item) => item.status === "IN_PROGRESS");

  const summary = useMemo(
    () => ({
      total: visibleAppointments.length,
      checkedIn: visibleAppointments.filter(
        (item) => item.status === "CHECKED_IN",
      ).length,
      inProgress: visibleAppointments.filter(
        (item) => item.status === "IN_PROGRESS",
      ).length,
      completed: visibleAppointments.filter(
        (item) => item.status === "COMPLETED",
      ).length,
      noShow: visibleAppointments.filter((item) => item.status === "NO_SHOW")
        .length,
    }),
    [visibleAppointments],
  );

  const filteredAppointments = useMemo(() => {
    if (statusFilter === "ALL") return visibleAppointments;
    return visibleAppointments.filter((appointment) => appointment.status === statusFilter);
  }, [statusFilter, visibleAppointments]);

  function changeScheduleView(view: DentistScheduleView) {
    setScheduleView(view);
    setSelectedDate(hcmDate(new Date()));
    setDayFilter("ALL");
    setStatusFilter("ALL");
  }

  async function startAppointment(appointment: DentistAppointment) {
    setStartingCode(appointment.public_code);
    setError("");
    try {
      const response = await startDentistAppointment(appointment.public_code);
      setAppointments(
        (current) =>
          current?.map((item) =>
            item.public_code === appointment.public_code ? response.data : item,
          ) || null,
      );
      navigate(
        `/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Không thể bắt đầu lượt khám.",
      );
    } finally {
      setStartingCode("");
    }
  }

  if (!isAuthenticated)
    return <Navigate to="/dang-nhap?returnTo=%2Fbac-si" replace />;
  if (!hasActiveRole(user, ["DENTIST"])) {
    return <Navigate to="/" replace />;
  }
  if (!selectedBranchId || !assignedBranchIds.includes(selectedBranchId)) {
    return <Navigate to="/bac-si/chon-chi-nhanh" replace />;
  }

  return (
    <div className={`dentist-page ${styles.page}`}>
      <Seo
        title="Khu vực nha sĩ | DentaVie"
        description="Lịch khám và thao tác chuyên môn dành cho nha sĩ DentaVie."
        path="/bac-si"
        noIndex
      />
      <header className="dentist-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie">
          <img
            src="/branding/dentavie-logo-horizontal-color.png"
            alt="DentaVie"
          />
        </Link>
        <nav className="dentist-dashboard-nav" aria-label="Điều hướng nha sĩ">
          <a className={activeNavSection === "overview" ? "is-active" : ""} aria-current={activeNavSection === "overview" ? "location" : undefined} href="#overview" onClick={() => setActiveNavSection("overview")}>Tổng quan</a>
          <a className={activeNavSection === "schedule" ? "is-active" : ""} aria-current={activeNavSection === "schedule" ? "location" : undefined} href="#schedule" onClick={() => setActiveNavSection("schedule")}>Lịch khám</a>
          <Link className={activeNavSection === "branch" ? "is-active" : ""} aria-current={activeNavSection === "branch" ? "location" : undefined} to="/bac-si/chon-chi-nhanh">Chi nhánh</Link>
        </nav>
        <div className="dentist-account">
          <span className="dentist-account-avatar" aria-hidden="true">
            {appointmentInitials(user?.full_name || "BS")}
          </span>
          <AuthBar />
          <small>Tài khoản nha sĩ</small>
        </div>
      </header>

      <main className="dentist-main" id="overview">
        <section className="dentist-welcome">
          <div>
            <p className="eyebrow">
              {new Intl.DateTimeFormat("vi-VN", {
                timeZone: HCM_TIME_ZONE,
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              }).format(new Date()).toLocaleUpperCase("vi-VN")}
            </p>
            <h1>Chào bác sĩ {user?.full_name?.split(" ").slice(-2).join(" ") || "bác sĩ"}!</h1>
            <p>Ưu tiên ca đang khám và đã đến, sau đó theo dõi lịch hẹn sắp tới.</p>
          </div>
          <aside className="dentist-current-branch" id="branch" aria-label="Chi nhánh đang làm việc">
            <span>Chi nhánh đang làm việc</span>
            {selectedBranch ? <strong>{selectedBranch.name}</strong> : <strong>{workingBranches ? "Chưa tải được chi nhánh" : "Đang tải chi nhánh..."}</strong>}
            {assignedBranchIds.length > 1 && <Link to="/bac-si/chon-chi-nhanh" aria-label="Đổi chi nhánh">Đổi chi nhánh <span aria-hidden="true">›</span></Link>}
          </aside>
        </section>

        {error && (
          <div className="app-error" role="alert">
            {error}
          </div>
        )}

        {branchesError && (
          <div className="dentist-branches-error" role="alert">
            <span>{branchesError}</span>
            <button type="button" onClick={() => setBranchReload((value) => value + 1)}>Tải lại</button>
          </div>
        )}

        <section className="dentist-focus-banner" aria-label="Tổng quan ca đang khám">
          <div>
            <p className="eyebrow">Tổng quan lịch khám</p>
            <h2>{summary.inProgress ? "Tập trung vào bệnh nhân tiếp theo" : "Sẵn sàng cho ca khám tiếp theo"}</h2>
            <p>Lịch được cập nhật tự động khi bạn quay lại trang.</p>
          </div>
          <div className="dentist-focus-count">
            <span>Ca đang khám</span>
            <strong>{String(summary.inProgress).padStart(2, "0")}</strong>
            {currentAppointment ? (
              <Link to={`/bac-si/kham/${currentAppointment.public_code}?chi-nhanh=${selectedBranchId}`}>
                Tiếp tục khám <span aria-hidden="true">›</span>
              </Link>
            ) : <small>Chưa có ca đang khám</small>}
          </div>
        </section>

        <section className="dentist-stat-grid" aria-label="Tổng quan lịch khám">
          <article>
            <span>Tổng lịch hẹn</span>
            <strong>{summary.total}</strong>
            <small>{scheduleView === "HISTORY"
              ? "trong ngày đã chọn"
              : dayFilter === "TODAY"
                ? "trong ngày đã chọn"
                : dayFilter === "TOMORROW"
                  ? "trong ngày kế tiếp"
                  : "trong 7 ngày đang xem"}</small>
          </article>
          <article>
            <span>{scheduleView === "UPCOMING" ? "Đã đến khám" : "Đã hoàn tất"}</span>
            <strong>{scheduleView === "UPCOMING" ? summary.checkedIn : summary.completed}</strong>
            <small>{scheduleView === "UPCOMING" ? "sẵn sàng bắt đầu" : "ca đã khám xong"}</small>
          </article>
          <article>
            <span>{scheduleView === "UPCOMING" ? "Đang khám" : "Không đến"}</span>
            <strong>{scheduleView === "UPCOMING" ? summary.inProgress : summary.noShow}</strong>
            <small>{scheduleView === "UPCOMING" ? "có ca cần xử lý" : "lịch vắng mặt"}</small>
          </article>
        </section>

        <section className="dentist-priority" aria-labelledby="dentist-priority-title">
          <header>
            <div>
              <h2 id="dentist-priority-title">Cần xử lý ngay</h2>
              <p>Những ca bác sĩ cần thao tác tại chi nhánh đã chọn.</p>
            </div>
            {priorityAppointments.length > 0 && <span>{priorityAppointments.length} ca</span>}
          </header>
          {priorityAppointments.length === 0 ? (
            <div className="dentist-priority-empty">Chưa có bệnh nhân cần xử lý ngay.</div>
          ) : (
            <div className="dentist-priority-list">
              {priorityAppointments.map((appointment) => (
                <article className="dentist-priority-card" key={appointment.public_code}>
                  <span className={`dentist-status is-${appointment.status.toLowerCase()}`}>{statusLabel[appointment.status]}</span>
                  <h3>{appointment.patient_name}</h3>
                  <p className="dentist-priority-time">{formatHcmTime(appointment.starts_at)} · {appointment.service_name_snapshot}</p>
                  <p className="dentist-priority-branch">{appointment.branch_name}</p>
                  {appointment.patient_note && <p className="dentist-priority-note">Ghi chú: {appointment.patient_note}</p>}
                  {appointment.status === "IN_PROGRESS" ? (
                    <Link className="button dentist-priority-action" to={`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`}>Tiếp tục khám</Link>
                  ) : (
                    <button type="button" className="button dentist-priority-action is-secondary" disabled={startingCode === appointment.public_code} onClick={() => startAppointment(appointment)}>
                      {startingCode === appointment.public_code ? "Đang mở..." : "Bắt đầu khám"}
                    </button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="dentist-schedule-panel" id="schedule">
          <header>
            <div>
              <h2>Lịch khám của tôi</h2>
              <p>Theo dõi lịch khám và mở đúng bệnh án từ danh sách.</p>
            </div>
            {appointments && (
              <span>{filteredAppointments.length} lịch hẹn</span>
            )}
          </header>

          <div
            className="dentist-schedule-tabs"
            role="tablist"
            aria-label="Loại lịch khám"
          >
            <button
              type="button"
              role="tab"
              aria-selected={scheduleView === "UPCOMING"}
              className={scheduleView === "UPCOMING" ? "is-active" : ""}
              onClick={() => changeScheduleView("UPCOMING")}
            >
              Sắp tới
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scheduleView === "HISTORY"}
              className={scheduleView === "HISTORY" ? "is-active" : ""}
              onClick={() => changeScheduleView("HISTORY")}
            >
              Đã khám
            </button>
          </div>

          <div
            className="dentist-schedule-filters"
            aria-label="Bộ lọc lịch khám"
          >
            <label>
              {scheduleView === "UPCOMING" ? "Bắt đầu từ ngày" : "Ngày đã khám"}
              <input
                type="date"
                value={selectedDate}
                required
                min={
                  scheduleView === "UPCOMING" ? hcmDate(new Date()) : undefined
                }
                max={
                  scheduleView === "HISTORY" ? hcmDate(new Date()) : undefined
                }
                onChange={(event) => {
                  if (event.target.value) setSelectedDate(event.target.value);
                }}
              />
            </label>
            {scheduleView === "UPCOMING" && (
              <label>
                Khoảng xem
                <select
                  value={dayFilter}
                  onChange={(event) =>
                    setDayFilter(event.target.value as typeof dayFilter)
                  }
                >
                  <option value="ALL">7 ngày từ ngày chọn</option>
                  <option value="TODAY">Ngày đã chọn</option>
                  <option value="TOMORROW">Ngày kế tiếp</option>
                </select>
              </label>
            )}
            <label>
              Trạng thái
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as typeof statusFilter)
                }
              >
                <option value="ALL">Tất cả trạng thái</option>
                {scheduleView === "UPCOMING" ? (
                  <>
                    <option value="PENDING">Chờ xác nhận</option>
                    <option value="CONFIRMED">Đã xác nhận</option>
                    <option value="CHECKED_IN">Đã đến khám</option>
                    <option value="IN_PROGRESS">Đang khám</option>
                  </>
                ) : (
                  <>
                    <option value="COMPLETED">Đã hoàn tất</option>
                    <option value="CANCELLED">Đã hủy</option>
                    <option value="NO_SHOW">Không đến</option>
                  </>
                )}
              </select>
            </label>
            <span className="dentist-result-count">Đã tìm {filteredAppointments.length} lịch</span>
          </div>

          {scheduleError ? (
            <div className="dentist-empty dentist-load-error" role="alert">
              <strong>Không thể tải lịch khám.</strong>
              <span>{scheduleError}</span>
              <button type="button" onClick={() => setScheduleReload((value) => value + 1)}>Thử lại</button>
            </div>
          ) : !appointments ? (
            <div className="dentist-empty" role="status">Đang tải lịch khám...</div>
          ) : appointments.length === 0 ? (
            <div className="dentist-empty">
              <strong>
                {scheduleView === "UPCOMING"
                  ? "Chưa có lịch khám trong khoảng đã chọn."
                  : "Chưa có lịch đã khám trong ngày này."}
              </strong>
              <span>Chọn ngày khác để tiếp tục tra cứu.</span>
            </div>
          ) : visibleAppointments.length === 0 ? (
            <div className="dentist-empty">
              <strong>
                {scheduleView === "UPCOMING"
                  ? "Chi nhánh này chưa có lịch khám sắp tới."
                  : "Chi nhánh này chưa có ca đã khám trong ngày."}
              </strong>
            </div>
          ) : filteredAppointments.length === 0 ? (
            <div className="dentist-empty">
              <strong>Không có lịch phù hợp với bộ lọc.</strong>
            </div>
          ) : (
            <div className="dentist-appointment-list">
              {filteredAppointments.map((appointment) => (
                <article
                  className="dentist-appointment"
                  key={appointment.public_code}
                >
                  <time dateTime={appointment.starts_at}>
                    <strong>{formatHcmTime(appointment.starts_at)}</strong>
                    <span>{formatHcmDay(appointment.starts_at)}</span>
                  </time>
                  <div className="dentist-patient-initials" aria-hidden="true">
                    {appointmentInitials(appointment.patient_name)}
                  </div>
                  <div className="dentist-appointment-main">
                    <div className="dentist-appointment-title">
                      <h3>{appointment.patient_name}</h3>
                      <span
                        className={`dentist-status is-${appointment.status.toLowerCase()}`}
                      >
                        {statusLabel[appointment.status]}
                      </span>
                    </div>
                    <p>{appointment.service_name_snapshot}</p>
                    <small>{appointment.branch_name} · {bookingContactPhone(appointment) || "Chưa có số điện thoại"}</small>
                    {appointment.patient_note && (
                      <p className="dentist-appointment-note">
                        <strong>Ghi chú:</strong> {appointment.patient_note}
                      </p>
                    )}
                  </div>
                  <div className="dentist-appointment-action">
                    {appointment.status === "CHECKED_IN" ? (
                      <button
                        type="button"
                        className="button dentist-start-button"
                        disabled={startingCode === appointment.public_code}
                        onClick={() => startAppointment(appointment)}
                      >
                        {startingCode === appointment.public_code
                          ? "Đang mở..."
                          : "Bắt đầu khám"}
                      </button>
                    ) : appointment.status === "IN_PROGRESS" ? (
                      <Link
                        to={`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`}
                      >
                        Tiếp tục khám
                      </Link>
                    ) : appointment.status === "COMPLETED" ? (
                      <Link
                        to={`/bac-si/kham/${appointment.public_code}?chi-nhanh=${selectedBranchId}`}
                      >
                        Xem bệnh án
                      </Link>
                    ) : appointment.status === "NO_SHOW" ? (
                      <span>Không đến</span>
                    ) : (
                      <span>Chờ đến lượt</span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
      <footer className="dentist-dashboard-footer">
        <span>DentaVie · Khu vực nha sĩ</span>
        <small>Lịch khám được cập nhật tự động</small>
      </footer>
    </div>
  );
}
