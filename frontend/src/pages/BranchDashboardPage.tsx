import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  listBranchAppointments,
  listInvoiceReadyAppointments,
  listManagedInvoices,
  listManagedPayosReviewTransactions,
  type InvoiceReadyAppointment,
  type ManagementAppointment,
  type ManagedPayosReviewTransaction,
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
const INVOICE_QUEUE_PREVIEW_SIZE = 4;
const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});
const fullDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "full",
});
const moneyFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface ScopedRequest<T> {
  branchId: number;
  data: T | null;
  loading: boolean;
  error: string;
}

function appointmentDate(appointment: ManagementAppointment) {
  return hcmDate(new Date(appointment.starts_at));
}

function requestError(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

function InvoiceJobLink({ branchQuery, children }: { branchQuery: string; children: React.ReactNode }) {
  return (
    <Link className={styles.invoiceJobLink} to={`/quan-ly-chi-nhanh/hoa-don${branchQuery}`}>
      {children}
    </Link>
  );
}

export function BranchDashboardPage() {
  const { user } = useAuth();
  const scope = useManagedBranchScope(user);
  const [appointments, setAppointments] = useState<ScopedRequest<ManagementAppointment[]> | null>(null);
  const [readyAppointments, setReadyAppointments] = useState<ScopedRequest<{ count: number; items: InvoiceReadyAppointment[] }> | null>(null);
  const [issuedInvoices, setIssuedInvoices] = useState<ScopedRequest<number> | null>(null);
  const [reviewTransactions, setReviewTransactions] = useState<ScopedRequest<ManagedPayosReviewTransaction[]> | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [scheduleRetry, setScheduleRetry] = useState(0);
  const [readyRetry, setReadyRetry] = useState(0);
  const [issuedRetry, setIssuedRetry] = useState(0);
  const [reviewRetry, setReviewRetry] = useState(0);
  const [upcomingPage, setUpcomingPage] = useState(0);
  const currentDate = today();
  const branchId = scope.branchId;
  const branch = scope.branches.find((item) => item.id_branch === branchId);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setAppointments((current) => current?.branchId === branchId
      ? { ...current, loading: current.data === null, error: "" }
      : { branchId, data: null, loading: true, error: "" });
    listBranchAppointments(branchId, currentDate, undefined, undefined, 7, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setAppointments({ branchId, data: response.data, loading: false, error: "" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setAppointments((current) => current?.branchId === branchId
          ? { ...current, loading: false, error: requestError(reason, "Không thể tải lịch hẹn.") }
          : { branchId, data: null, loading: false, error: requestError(reason, "Không thể tải lịch hẹn.") });
      });
    return () => controller.abort();
  }, [branchId, currentDate, refreshVersion, scheduleRetry]);

  useEffect(() => {
    setUpcomingPage(0);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setReadyAppointments((current) => current?.branchId === branchId
      ? { ...current, loading: true, error: "" }
      : { branchId, data: null, loading: true, error: "" });
    listInvoiceReadyAppointments(branchId, { limit: INVOICE_QUEUE_PREVIEW_SIZE, offset: 0 }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setReadyAppointments({
          branchId,
          data: { count: response.meta.count, items: response.data },
          loading: false,
          error: "",
        });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setReadyAppointments((current) => current?.branchId === branchId
          ? { ...current, loading: false, error: requestError(reason, "Không thể tải lượt khám chờ lập hóa đơn.") }
          : { branchId, data: null, loading: false, error: requestError(reason, "Không thể tải lượt khám chờ lập hóa đơn.") });
      });
    return () => controller.abort();
  }, [branchId, readyRetry, refreshVersion]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setIssuedInvoices((current) => current?.branchId === branchId
      ? { ...current, loading: true, error: "" }
      : { branchId, data: null, loading: true, error: "" });
    listManagedInvoices(branchId, { status: "ISSUED", limit: 1, offset: 0 }, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setIssuedInvoices({ branchId, data: response.meta.count, loading: false, error: "" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setIssuedInvoices((current) => current?.branchId === branchId
          ? { ...current, loading: false, error: requestError(reason, "Không thể tải số hóa đơn chưa thanh toán.") }
          : { branchId, data: null, loading: false, error: requestError(reason, "Không thể tải số hóa đơn chưa thanh toán.") });
      });
    return () => controller.abort();
  }, [branchId, issuedRetry, refreshVersion]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    setReviewTransactions((current) => current?.branchId === branchId
      ? { ...current, loading: true, error: "" }
      : { branchId, data: null, loading: true, error: "" });
    listManagedPayosReviewTransactions(branchId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setReviewTransactions({ branchId, data: response.data, loading: false, error: "" });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setReviewTransactions((current) => current?.branchId === branchId
          ? { ...current, loading: false, error: requestError(reason, "Không thể tải giao dịch PayOS cần đối soát.") }
          : { branchId, data: null, loading: false, error: requestError(reason, "Không thể tải giao dịch PayOS cần đối soát.") });
      });
    return () => controller.abort();
  }, [branchId, refreshVersion, reviewRetry]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setRefreshVersion((version) => version + 1);
    };
    const intervalId = window.setInterval(refresh, BRANCH_DASHBOARD_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const scopedAppointments = appointments?.branchId === branchId ? appointments : null;
  const scopedReady = readyAppointments?.branchId === branchId ? readyAppointments : null;
  const scopedIssued = issuedInvoices?.branchId === branchId ? issuedInvoices : null;
  const scopedReviews = reviewTransactions?.branchId === branchId ? reviewTransactions : null;

  const summary = useMemo(() => {
    const items = scopedAppointments?.data || [];
    const todayAppointments = items.filter((item) => appointmentDate(item) === currentDate);
    const upcoming = items
      .filter((item) => ["PENDING", "CONFIRMED", "CHECKED_IN"].includes(item.status)
        && new Date(item.starts_at).getTime() >= Date.now())
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
    return {
      upcoming,
      totalToday: todayAppointments.filter((item) => !["CANCELLED", "NO_SHOW", "EXPIRED"].includes(item.status)).length,
      pending: todayAppointments.filter((item) => item.status === "PENDING").length,
      checkedIn: todayAppointments.filter((item) => item.status === "CHECKED_IN").length,
    };
  }, [currentDate, scopedAppointments?.data]);

  const upcomingPageSize = 4;
  const upcomingPageCount = Math.max(1, Math.ceil(summary.upcoming.length / upcomingPageSize));
  const displayedUpcoming = summary.upcoming.slice(upcomingPage * upcomingPageSize, (upcomingPage + 1) * upcomingPageSize);
  const branchQuery = branchId ? `?chi-nhanh=${branchId}` : "";
  const readyItems = scopedReady?.data?.items || [];
  const reviewItems = scopedReviews?.data || [];
  const hasInvoiceWork = readyItems.length > 0 || reviewItems.length > 0;
  const invoiceAreaHasError = Boolean(scopedReady?.error || scopedIssued?.error || scopedReviews?.error);

  return (
    <div className={styles.root}>
      <section className={styles.hero} aria-labelledby="branch-dashboard-title">
        <div>
          <p className="eyebrow">Vận hành chi nhánh</p>
          <h1 id="branch-dashboard-title">{branch?.name || "Tổng quan chi nhánh"}</h1>
          <p>{fullDateFormatter.format(new Date())} · Ưu tiên công việc cần xử lý hôm nay</p>
        </div>
        <Link className="admin-button admin-button--secondary" to={`/quan-ly-chi-nhanh/hoa-don${branchQuery}`}>
          Đến quản lý hóa đơn
        </Link>
      </section>

      <section className={styles.invoiceSection} aria-labelledby="invoice-overview-title">
        <header className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">01 · Hóa đơn & thanh toán</p>
            <h2 id="invoice-overview-title">Ưu tiên xử lý hóa đơn</h2>
            <p>Các lượt khám và giao dịch cần xử lý trước lịch hẹn và vận hành khác.</p>
          </div>
          <Link className="admin-button" to={`/quan-ly-chi-nhanh/hoa-don${branchQuery}`}>Xem tất cả hóa đơn</Link>
        </header>

        <div className={styles.invoiceStats}>
          <AdminCard className={`${styles.invoiceStat} ${styles.invoiceReady}`}>
            <span>Lượt khám chờ lập hóa đơn</span>
            {scopedReady?.data ? <strong>{scopedReady.data.count}</strong> : scopedReady?.error ? <strong className={styles.statDash}>—</strong> : <Skeleton className={styles.statSkeleton} lines={1} />}
            <small>{scopedReady?.error ? "Chưa tải được số liệu" : "Từ lượt khám đã hoàn tất"}</small>
            {scopedReady?.error && <button type="button" className={styles.retryLink} onClick={() => setReadyRetry((value) => value + 1)}>Thử lại</button>}
            <InvoiceJobLink branchQuery={branchQuery}>Đi đến hàng đợi <span aria-hidden="true">›</span></InvoiceJobLink>
          </AdminCard>
          <AdminCard className={`${styles.invoiceStat} ${styles.invoiceIssued}`}>
            <span>Đã phát hành, chờ thanh toán</span>
            {scopedIssued?.data !== null && scopedIssued?.data !== undefined ? <strong>{scopedIssued.data}</strong> : scopedIssued?.error ? <strong className={styles.statDash}>—</strong> : <Skeleton className={styles.statSkeleton} lines={1} />}
            <small>{scopedIssued?.error ? "Chưa tải được số liệu" : "Theo dõi khoản chưa thu"}</small>
            {scopedIssued?.error && <button type="button" className={styles.retryLink} onClick={() => setIssuedRetry((value) => value + 1)}>Thử lại</button>}
            <InvoiceJobLink branchQuery={branchQuery}>Xem hóa đơn <span aria-hidden="true">›</span></InvoiceJobLink>
          </AdminCard>
          <AdminCard className={`${styles.invoiceStat} ${styles.invoiceReview}`}>
            <span>PayOS cần đối soát</span>
            {scopedReviews?.data ? <strong>{scopedReviews.data.length}</strong> : scopedReviews?.error ? <strong className={styles.statDash}>—</strong> : <Skeleton className={styles.statSkeleton} lines={1} />}
            <small>{scopedReviews?.error ? "Chưa tải được số liệu" : "Cần kiểm tra giao dịch"}</small>
            {scopedReviews?.error && <button type="button" className={styles.retryLink} onClick={() => setReviewRetry((value) => value + 1)}>Thử lại</button>}
            <InvoiceJobLink branchQuery={branchQuery}>Đến khu đối soát <span aria-hidden="true">›</span></InvoiceJobLink>
          </AdminCard>
        </div>

        <AdminCard className={styles.invoiceQueue}>
          <header>
            <div>
              <h3>Công việc hóa đơn ưu tiên</h3>
              <p>Lượt khám chờ lập hóa đơn và giao dịch cần đối soát.</p>
            </div>
            <Link to={`/quan-ly-chi-nhanh/hoa-don${branchQuery}`}>Mở trang hóa đơn <span aria-hidden="true">›</span></Link>
          </header>
          {scopedReady?.loading && !scopedReady.data || scopedReviews?.loading && !scopedReviews.data ? (
            <Skeleton lines={4} />
          ) : invoiceAreaHasError && !scopedReady?.data && !scopedReviews?.data ? (
            <div className={styles.invoiceQueueError} role="alert">
              <p>Không tải được hàng đợi hóa đơn. Các khu vực khác vẫn hoạt động bình thường.</p>
              {scopedReady?.error && <button type="button" onClick={() => setReadyRetry((value) => value + 1)}>Thử tải lượt khám lại</button>}
              {scopedReviews?.error && <button type="button" onClick={() => setReviewRetry((value) => value + 1)}>Thử tải đối soát lại</button>}
            </div>
          ) : hasInvoiceWork ? (
            <div className={styles.invoiceJobs}>
              {readyItems.map((item) => (
                <article className={styles.invoiceJob} key={`ready-${item.appointment_code}`}>
                  <div className={styles.jobPriority}>Lập hóa đơn</div>
                  <div className={styles.jobIdentity}>
                    <strong>{item.patient_name}</strong>
                    <span>{item.appointment_code} · {timeFormatter.format(new Date(item.completed_at))}</span>
                    <small>BS. {item.dentist_name} · {item.performed_services.map((service) => service.service_name).join(", ")}</small>
                  </div>
                  <div className={styles.jobAmount}>{moneyFormatter.format(Number(item.estimated_total))}</div>
                  <InvoiceJobLink branchQuery={branchQuery}>Lập hóa đơn</InvoiceJobLink>
                </article>
              ))}
              {reviewItems.slice(0, INVOICE_QUEUE_PREVIEW_SIZE).map((item) => (
                <article className={`${styles.invoiceJob} ${styles.reviewJob}`} key={`review-${item.invoice_id}`}>
                  <div className={styles.jobPriority}>Cần đối soát</div>
                  <div className={styles.jobIdentity}>
                    <strong>{item.patient_name}</strong>
                    <span>Hóa đơn {item.invoice_number}</span>
                    <small>Giao dịch cần kiểm tra trước khi xử lý.</small>
                  </div>
                  <div className={styles.jobAmount}>{moneyFormatter.format(item.amount)}</div>
                  <InvoiceJobLink branchQuery={branchQuery}>Mở đối soát</InvoiceJobLink>
                </article>
              ))}
              {scopedReady?.error && <p className={styles.inlineError} role="alert">{scopedReady.error} <button type="button" onClick={() => setReadyRetry((value) => value + 1)}>Thử lại</button></p>}
              {scopedReviews?.error && <p className={styles.inlineError} role="alert">{scopedReviews.error} <button type="button" onClick={() => setReviewRetry((value) => value + 1)}>Thử lại</button></p>}
              {reviewItems.length > INVOICE_QUEUE_PREVIEW_SIZE && <p className={styles.moreJobs}>Còn {reviewItems.length - INVOICE_QUEUE_PREVIEW_SIZE} giao dịch cần đối soát trong trang hóa đơn.</p>}
            </div>
          ) : scopedReady?.error || scopedReviews?.error ? (
            <div className={styles.invoiceQueueError} role="alert">
              {scopedReady?.error && <p>{scopedReady.error} <button type="button" onClick={() => setReadyRetry((value) => value + 1)}>Thử lại</button></p>}
              {scopedReviews?.error && <p>{scopedReviews.error} <button type="button" onClick={() => setReviewRetry((value) => value + 1)}>Thử lại</button></p>}
            </div>
          ) : (
            <EmptyState title="Không có công việc hóa đơn cần ưu tiên" description="Các lượt khám và giao dịch mới sẽ xuất hiện ở đây." />
          )}
        </AdminCard>
      </section>

      <section className={styles.scheduleSection} aria-labelledby="branch-schedule-title">
        <header className={styles.sectionHeading}>
          <div>
            <p className="eyebrow">02 · Lịch hẹn hôm nay</p>
            <h2 id="branch-schedule-title">Lịch hẹn & điều phối</h2>
            <p>Các lịch hẹn sắp tới tại chi nhánh đang quản lý.</p>
          </div>
          <Link className="admin-button admin-button--secondary" to={`/quan-ly-chi-nhanh/lich-hen${branchQuery}`}>Xem lịch hẹn</Link>
        </header>

        <section className={styles.kpis} aria-label="Chỉ số lịch hẹn hôm nay">
          {!scopedAppointments?.data ? (
            <Skeleton className={styles.kpiSkeleton} lines={4} />
          ) : (
            <>
              <AdminCard className={styles.kpi}><span>Lịch hôm nay</span><strong>{summary.totalToday}</strong><small>Đã lên lịch trong ngày</small></AdminCard>
              <AdminCard className={`${styles.kpi} ${styles.warning}`}><span>Chờ xác nhận</span><strong>{summary.pending}</strong><small>Cần kiểm tra và phản hồi</small></AdminCard>
              <AdminCard className={`${styles.kpi} ${styles.success}`}><span>Đã đến khám</span><strong>{summary.checkedIn}</strong><small>Sẵn sàng cho bác sĩ</small></AdminCard>
              <AdminCard className={`${styles.kpi} ${styles.info}`}><span>Lịch sắp tới</span><strong>{summary.upcoming.length}</strong><small>Trong 7 ngày tới</small></AdminCard>
            </>
          )}
        </section>

        <div className={styles.scheduleGrid}>
          <AdminCard className={styles.upcoming}>
            <header>
              <div><h3>Lịch khám sắp tới</h3><p>Theo dõi các lượt khám tiếp theo.</p></div>
              <Link to={`/quan-ly-chi-nhanh/lich-hen${branchQuery}`}>Xem tất cả <span aria-hidden="true">›</span></Link>
            </header>
            {scopedAppointments?.error && scopedAppointments.data && <p className={styles.inlineError} role="status">Không thể cập nhật lịch mới. <button type="button" onClick={() => setScheduleRetry((value) => value + 1)}>Thử lại</button></p>}
            {scopedAppointments?.error && !scopedAppointments.data ? (
              <div className={styles.scheduleError} role="alert">
                <p>{scopedAppointments.error}</p>
                <button type="button" onClick={() => setScheduleRetry((value) => value + 1)}>Thử tải lại</button>
              </div>
            ) : !scopedAppointments?.data ? (
              <Skeleton lines={4} />
            ) : summary.upcoming.length ? (
              <>
                <div className={styles.appointments}>
                  {displayedUpcoming.map((item) => (
                    <article key={item.public_code}>
                      <time dateTime={item.starts_at}>{timeFormatter.format(new Date(item.starts_at))}</time>
                      <div className={styles.appointmentIdentity}>
                        <strong>{item.patient_name}</strong>
                        <span>{item.service_name_snapshot} · {item.dentist_name}</span>
                      </div>
                      <StatusBadge tone={item.status === "PENDING" ? "warning" : item.status === "CHECKED_IN" ? "success" : "info"}>
                        {item.status === "PENDING" ? "Chờ xác nhận" : item.status === "CHECKED_IN" ? "Đã đến khám" : "Đã xác nhận"}
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
              <EmptyState title="Chưa có lịch sắp tới" description="Lịch hẹn mới sẽ xuất hiện tại đây." />
            )}
          </AdminCard>

          <AdminCard className={styles.quickActions}>
            <p className="eyebrow">03 · Vận hành khác</p>
            <h3>Vận hành chi nhánh</h3>
            <div>
              <Link to={`/quan-ly-chi-nhanh/ca-lam${branchQuery}`}><b aria-hidden="true">01</b><span><strong>Ca làm & nghỉ phép</strong><small>Phân công nha sĩ</small></span><i aria-hidden="true">›</i></Link>
              <Link to={`/quan-ly-chi-nhanh/bao-cao${branchQuery}`}><b aria-hidden="true">02</b><span><strong>Báo cáo</strong><small>Theo dõi doanh thu & hiệu suất</small></span><i aria-hidden="true">›</i></Link>
              <Link to={`/quan-ly-chi-nhanh/cau-hinh${branchQuery}`}><b aria-hidden="true">03</b><span><strong>Cấu hình chi nhánh</strong><small>Giờ làm, ghế khám, dịch vụ</small></span><i aria-hidden="true">›</i></Link>
            </div>
          </AdminCard>
        </div>
      </section>

      <footer className={styles.footer}>
        <strong>DentaVie · Vận hành chi nhánh</strong>
        <span>Ưu tiên hóa đơn trước, lịch hẹn và vận hành sau.</span>
      </footer>
    </div>
  );
}
