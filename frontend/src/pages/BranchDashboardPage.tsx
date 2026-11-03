import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  listBranchAppointments,
  type ManagementAppointment,
} from "../api/management";
import { useAuth } from "../auth/AuthContext";
import { useManagedBranchScope } from "../components/branch-management/useManagedBranches";
import {
  AdminCard,
  EmptyState,
  Skeleton,
  StatusBadge,
} from "../components/admin/ui";
import { hcmDate } from "../components/branch-management/appointmentPresentation";
import styles from "./BranchDashboardPage.module.css";

const today = () => hcmDate(new Date());
const BRANCH_DASHBOARD_REFRESH_MS = 30_000;
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});

function appointmentDate(appointment: ManagementAppointment) {
  return hcmDate(new Date(appointment.starts_at));
}

export function BranchDashboardPage() {
  const { user } = useAuth();
  const scope = useManagedBranchScope(user);
  const [appointments, setAppointments] = useState<
    ManagementAppointment[] | null
  >(null);
  const [error, setError] = useState("");
  const [upcomingPage, setUpcomingPage] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const loadedBranchId = useRef<number | null>(null);
  const currentDate = today();
  const branch = scope.branches.find(
    (item) => item.id_branch === scope.branchId,
  );

  useEffect(() => {
    if (!scope.branchId) return;
    const initialLoad = loadedBranchId.current !== scope.branchId;
    loadedBranchId.current = scope.branchId;
    const controller = new AbortController();
    if (initialLoad) {
      setAppointments(null);
      setError("");
      setUpcomingPage(0);
    }
    listBranchAppointments(
      scope.branchId,
      currentDate,
      undefined,
      undefined,
      7,
      controller.signal,
    )
      .then((response) => {
        if (!controller.signal.aborted) {
          setAppointments(response.data);
          setError("");
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted && initialLoad)
          setError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải tổng quan chi nhánh.",
          );
      });
    return () => controller.abort();
  }, [currentDate, refreshVersion, scope.branchId]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        setRefreshVersion((version) => version + 1);
      }
    };
    const intervalId = window.setInterval(refresh, BRANCH_DASHBOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const summary = useMemo(() => {
    const todayAppointments =
      appointments?.filter((item) => appointmentDate(item) === currentDate) ||
      [];
    const upcoming = (appointments || [])
      .filter(
        (item) =>
          ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(item.status) &&
          new Date(item.starts_at).getTime() >= Date.now(),
      )
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
    return {
      todayAppointments,
      upcoming,
      totalToday: todayAppointments.filter(
        (item) => !["CANCELLED", "NO_SHOW", "EXPIRED"].includes(item.status),
      ).length,
      pending: todayAppointments.filter((item) => item.status === "PENDING")
        .length,
      checkedIn: todayAppointments.filter(
        (item) => item.status === "CHECKED_IN",
      ).length,
    };
  }, [appointments, currentDate]);

  const upcomingPageSize = 4;
  const upcomingPageCount = Math.max(
    1,
    Math.ceil(summary.upcoming.length / upcomingPageSize),
  );
  const displayedUpcoming = summary.upcoming.slice(
    upcomingPage * upcomingPageSize,
    (upcomingPage + 1) * upcomingPageSize,
  );

  const branchQuery = scope.branchId ? `?chi-nhanh=${scope.branchId}` : "";

  return (
    <div className={styles.root}>
      <section className={styles.hero}>
        <div>
          <p className="eyebrow">Vận hành hôm nay</p>
          <h1>{branch?.name || "Tổng quan chi nhánh"}</h1>
          <p>
            {new Intl.DateTimeFormat("vi-VN", {
              dateStyle: "full",
              timeZone: "Asia/Ho_Chi_Minh",
            }).format(new Date())}
          </p>
        </div>
        <Link
          className="admin-button admin-button--secondary"
          to={`/quan-ly-chi-nhanh/lich-hen${branchQuery}`}
        >
          Điều phối lịch hẹn
        </Link>
      </section>

      <section className={styles.kpis} aria-label="Chỉ số lịch hẹn">
        {appointments === null ? (
          <Skeleton className={styles.kpiSkeleton} lines={4} />
        ) : (
          <>
            <AdminCard className={styles.kpi}>
              <span>Lịch hôm nay</span>
              <strong>{summary.totalToday}</strong>
              <small>Đã lên lịch trong ngày</small>
            </AdminCard>
            <AdminCard className={`${styles.kpi} ${styles.warning}`}>
              <span>Chờ xác nhận</span>
              <strong>{summary.pending}</strong>
              <small>Cần kiểm tra và phản hồi</small>
            </AdminCard>
            <AdminCard className={`${styles.kpi} ${styles.success}`}>
              <span>Đã đến khám</span>
              <strong>{summary.checkedIn}</strong>
              <small>Sẵn sàng cho bác sĩ</small>
            </AdminCard>
            <AdminCard className={`${styles.kpi} ${styles.info}`}>
              <span>Lịch sắp tới</span>
              <strong>{summary.upcoming.length}</strong>
              <small>Trong 7 ngày tới</small>
            </AdminCard>
          </>
        )}
      </section>

      <section className={styles.grid}>
        <AdminCard className={styles.upcoming}>
          <header>
            <div>
              <p className="eyebrow">Lịch gần nhất</p>
              <h2>Lịch sắp tới</h2>
            </div>
            <Link to={`/quan-ly-chi-nhanh/lich-hen${branchQuery}`}>
              Xem tất cả →
            </Link>
          </header>
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : appointments === null ? (
            <Skeleton lines={4} />
          ) : summary.upcoming.length ? (
            <>
            <div className={styles.appointments}>
              {displayedUpcoming.map((item) => (
                <article key={item.public_code}>
                  <time>{timeFormatter.format(new Date(item.starts_at))}</time>
                  <div>
                    <strong>{item.patient_name}</strong>
                    <span>
                      {item.service_name_snapshot} · {item.dentist_name}
                    </span>
                  </div>
                  <StatusBadge
                    tone={
                      item.status === "PENDING"
                        ? "warning"
                        : item.status === "CHECKED_IN"
                          ? "success"
                          : "info"
                    }
                  >
                    {item.status === "PENDING"
                      ? "Chờ xác nhận"
                      : item.status === "CHECKED_IN"
                        ? "Đã đến khám"
                        : "Đã xác nhận"}
                  </StatusBadge>
                </article>
              ))}
            </div>
            {upcomingPageCount > 1 && (
              <nav className={styles.pagination} aria-label="Phân trang lịch sắp tới">
                <button type="button" disabled={upcomingPage === 0} onClick={() => setUpcomingPage((page) => page - 1)}>Trước</button>
                <span>{upcomingPage + 1} / {upcomingPageCount}</span>
                <button type="button" disabled={upcomingPage === upcomingPageCount - 1} onClick={() => setUpcomingPage((page) => page + 1)}>Sau</button>
              </nav>
            )}
            </>
          ) : (
            <EmptyState
              title="Chưa có lịch sắp tới"
              description="Lịch hẹn mới sẽ xuất hiện tại đây."
            />
          )}
        </AdminCard>
        <AdminCard className={styles.quickActions}>
          <p className="eyebrow">Thao tác nhanh</p>
          <h2>Vận hành chi nhánh</h2>
          <div>
            <Link to={`/quan-ly-chi-nhanh/lich-hen${branchQuery}`}>
              <b>01</b>
              <span>
                <strong>Điều phối lịch hẹn</strong>
                <small>Xác nhận đến khám hoặc dời lịch</small>
              </span>
              <i>→</i>
            </Link>
            <Link to={`/quan-ly-chi-nhanh/ca-lam${branchQuery}`}>
              <b>02</b>
              <span>
                <strong>Ca làm & nghỉ phép</strong>
                <small>Cập nhật lịch làm việc nha sĩ</small>
              </span>
              <i>→</i>
            </Link>
            <Link to={`/quan-ly-chi-nhanh/hoa-don${branchQuery}`}>
              <b>03</b>
              <span>
                <strong>Hóa đơn</strong>
                <small>Phát hành và ghi nhận thanh toán</small>
              </span>
              <i>→</i>
            </Link>
            <Link to={`/quan-ly-chi-nhanh/bao-cao${branchQuery}`}>
              <b>04</b>
              <span>
                <strong>Báo cáo chi nhánh</strong>
                <small>Theo dõi doanh thu và hiệu suất</small>
              </span>
              <i>→</i>
            </Link>
          </div>
        </AdminCard>
      </section>
    </div>
  );
}
