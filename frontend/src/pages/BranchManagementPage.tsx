import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import {
  cancelManagedAppointment,
  checkInManagedAppointment,
  confirmManagedAppointment,
  listBranchAppointments,
  listManagedOrganizationBranches,
  listManagedRescheduleSlots,
  markManagedAppointmentNoShow,
  rescheduleManagedAppointment,
  type ManagedBranch,
  type ManagementAppointment,
  type ManagementAppointmentStatus,
} from "../api/management";
import { getBranchDetail } from "../api/booking";
import { useAuth } from "../auth/AuthContext";
import { canAccessArea } from "../auth/roles";
import {
  AppointmentList,
  ManagementErrorBanner,
} from "../components/branch-management/AppointmentList";
import { AppointmentCalendar } from "../components/branch-management/AppointmentCalendar";
import { CancelAppointmentModal } from "../components/branch-management/CancelAppointmentModal";
import { RescheduleAppointmentModal } from "../components/branch-management/RescheduleAppointmentModal";
import {
  appointmentStatusLabels,
  hcmDate,
} from "../components/branch-management/appointmentPresentation";
import { resolveScopedManagedBranchId } from "../components/branch-management/managedBranchSelection";
import styles from "./BranchManagementPage.module.css";
import type { BranchDetail, Slot } from "../types/api";

type AppointmentAction = "confirm" | "check-in" | "no-show";

const BRANCH_APPOINTMENT_REFRESH_MS = 30_000;

export function BranchManagementPage() {
  const { isAuthenticated, user } = useAuth();
  const [params, setParams] = useSearchParams();

  const directBranches = useMemo<ManagedBranch[]>(
    () =>
      (user?.memberships || [])
        .filter(
          (membership) =>
            membership.is_active &&
            membership.role === "BRANCH_ADMIN" &&
            membership.branch_id,
        )
        .map((membership) => ({
          id_branch: membership.branch_id as number,
          name: membership.branch_name || `Chi nhánh #${membership.branch_id}`,
          is_active: true,
        }))
        .slice(0, 1),
    [user],
  );
  const organizationIds = useMemo(
    () => [
      ...new Set(
        (user?.memberships || [])
          .filter(
            (membership) =>
              membership.is_active && membership.role === "ORGANIZATION_ADMIN",
          )
          .map((membership) => membership.organization_id),
      ),
    ],
    [user],
  );

  const [branches, setBranches] = useState<ManagedBranch[]>(directBranches);
  const [loaded, setLoaded] = useState(organizationIds.length === 0);
  const [branch, setBranch] = useState<BranchDetail | null>(null);
  const [date, setDate] = useState(() => hcmDate(new Date()));
  const [days, setDays] = useState<1 | 7>(7);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [dentistId, setDentistId] = useState<number>();
  const [status, setStatus] = useState<ManagementAppointmentStatus | "">("");
  const [items, setItems] = useState<ManagementAppointment[] | null>(null);
  const [error, setError] = useState("");
  const [pendingNotice, setPendingNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [cancelling, setCancelling] = useState<ManagementAppointment | null>(
    null,
  );
  const [moving, setMoving] = useState<ManagementAppointment | null>(null);
  const [appointmentReloadVersion, setAppointmentReloadVersion] = useState(0);

  const activeBranches = branches.filter((item) => item.is_active);
  const branchIds = activeBranches.map((item) => item.id_branch);
  const requestedBranchId = Number(params.get("chi-nhanh")) || null;
  const isBranchAdmin = directBranches.length > 0;
  const primaryBranchId = directBranches[0]?.id_branch ?? null;
  const branchId = resolveScopedManagedBranchId({
    isBranchAdmin,
    primaryBranchId,
    requestedBranchId,
    branches,
    loaded,
  });
  const isManager = canAccessArea(user, "MANAGEMENT");
  const knownPendingCodes = useRef(new Set<string>());
  const activeBranchIdRef = useRef<number | null>(branchId);
  activeBranchIdRef.current = branchId;

  const isInActiveBranch = (appointment: ManagementAppointment) =>
    appointment.branch_id === activeBranchIdRef.current;

  useEffect(() => {
    let active = true;
    setLoaded(organizationIds.length === 0);

    Promise.all(organizationIds.map(listManagedOrganizationBranches))
      .then((results) => {
        if (!active) return;
        const allBranches = [
          ...directBranches,
          ...results.flatMap((result) => result.data),
        ];
        setBranches([
          ...new Map(
            allBranches.map((item) => [item.id_branch, item]),
          ).values(),
        ]);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Không thể tải chi nhánh.",
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [directBranches, organizationIds]);

  useEffect(() => {
    if (branchId && requestedBranchId !== branchId) {
      setParams({ "chi-nhanh": String(branchId) }, { replace: true });
    }
  }, [branchId, requestedBranchId, setParams]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    getBranchDetail(branchId, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setBranch(response.data);
      })
      .catch(
        (caughtError) =>
          !controller.signal.aborted &&
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Không thể tải chi nhánh.",
          ),
      );
    return () => controller.abort();
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    const controller = new AbortController();
    let loading = false;
    let initialLoad = true;

    const loadAppointments = async (showLoading: boolean) => {
      if (loading || controller.signal.aborted) return;
      loading = true;
      if (showLoading) {
        setItems(null);
        setError("");
        setPendingNotice("");
        knownPendingCodes.current.clear();
      }
      try {
        const response = await listBranchAppointments(
          branchId,
          date,
          status || undefined,
          dentistId,
          days,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        const pendingCodes = response.data
          .filter((item) => item.status === "PENDING")
          .map((item) => item.public_code);
        if (!initialLoad && pendingCodes.length) {
          const newPendingCount = pendingCodes.filter(
            (code) => !knownPendingCodes.current.has(code),
          ).length;
          if (newPendingCount) {
            setPendingNotice(
              `${newPendingCount} lịch hẹn mới đang chờ xác nhận.`,
            );
          }
        }
        knownPendingCodes.current = new Set(pendingCodes);
        initialLoad = false;
        setItems(response.data);
      } catch (caughtError) {
        if (!controller.signal.aborted && showLoading) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Không thể tải lịch hẹn.",
          );
        }
      } finally {
        loading = false;
      }
    };

    void loadAppointments(true);
    const refresh = () => {
      if (document.visibilityState === "visible") void loadAppointments(false);
    };
    const intervalId = window.setInterval(
      refresh,
      BRANCH_APPOINTMENT_REFRESH_MS,
    );
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refresh);
      controller.abort();
    };
  }, [appointmentReloadVersion, branchId, date, days, dentistId, status]);

  useEffect(() => {
    setCancelling(null);
    setMoving(null);
    setBusy("");
  }, [branchId]);

  function replaceAppointment(next: ManagementAppointment) {
    if (!isInActiveBranch(next)) return;
    setItems(
      (current) =>
        current?.map((item) =>
          item.public_code === next.public_code ? next : item,
        ) || null,
    );
  }

  async function updateAppointment(
    item: ManagementAppointment,
    action: AppointmentAction,
  ) {
    if (!isInActiveBranch(item)) {
      setError("Chi nhánh đã thay đổi. Hãy mở lại lịch hẹn cần thao tác.");
      return;
    }
    setBusy(item.public_code);
    setError("");
    try {
      const response =
        action === "confirm"
          ? await confirmManagedAppointment(item.public_code)
          : action === "check-in"
            ? await checkInManagedAppointment(item.public_code)
            : await markManagedAppointmentNoShow(item.public_code);
      if (isInActiveBranch(response.data)) replaceAppointment(response.data);
    } catch (caughtError) {
      if (isInActiveBranch(item)) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Không thể cập nhật lịch.",
        );
      }
    } finally {
      if (isInActiveBranch(item)) setBusy("");
    }
  }

  async function cancelAppointment(reason: string) {
    if (!cancelling) return;
    if (!isInActiveBranch(cancelling)) {
      setCancelling(null);
      setError("Chi nhánh đã thay đổi. Hãy mở lại lịch hẹn cần thao tác.");
      return;
    }
    setBusy(cancelling.public_code);
    try {
      const response = await cancelManagedAppointment(
        cancelling.public_code,
        reason,
      );
      if (isInActiveBranch(response.data)) {
        replaceAppointment(response.data);
        setCancelling(null);
      }
    } catch (caughtError) {
      if (isInActiveBranch(cancelling)) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Không thể hủy lịch.",
        );
      }
    } finally {
      if (isInActiveBranch(cancelling)) setBusy("");
    }
  }

  async function findRescheduleSlots(moveDate: string, moveDentistId?: number) {
    if (!moving) throw new Error("Không tìm thấy lịch hẹn cần dời.");
    if (!isInActiveBranch(moving)) {
      setMoving(null);
      throw new Error("Chi nhánh đã thay đổi. Hãy mở lại lịch hẹn cần thao tác.");
    }
    try {
      const response = await listManagedRescheduleSlots(
        moving.public_code,
        moveDate,
        moveDentistId,
      );
      return response.data;
    } catch (caughtError) {
      // Let the modal distinguish a failed lookup from a valid empty result.
      throw caughtError instanceof Error
        ? caughtError
        : new Error("Không thể tải giờ trống.");
    }
  }

  async function moveAppointment(
    slot: Slot,
    reason: string,
    moveDentistId: number | undefined,
    idempotencyKey: string,
  ) {
    if (!moving) return;
    if (!isInActiveBranch(moving)) {
      setMoving(null);
      setError("Chi nhánh đã thay đổi. Hãy mở lại lịch hẹn cần thao tác.");
      return;
    }
    setBusy(moving.public_code);
    try {
      await rescheduleManagedAppointment(moving.public_code, {
        starts_at: slot.starts_at,
        reason,
        dentist_id: moveDentistId,
        idempotency_key: idempotencyKey,
      });
      if (isInActiveBranch(moving)) {
        setMoving(null);
        setAppointmentReloadVersion((version) => version + 1);
      }
    } catch (caughtError) {
      if (isInActiveBranch(moving)) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Không thể đổi lịch.",
        );
      }
    } finally {
      if (isInActiveBranch(moving)) setBusy("");
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?returnTo=%2Fquan-ly-chi-nhanh" replace />;
  }
  if (!isManager || (loaded && !branchId)) return <Navigate to="/" replace />;
  const activeCancellation =
    cancelling && isInActiveBranch(cancelling) ? cancelling : null;
  const activeReschedule = moving && isInActiveBranch(moving) ? moving : null;

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <p className="eyebrow">Vận hành hằng ngày</p>
            <h1>{branch?.name || "Quản lý chi nhánh"}</h1>
            <p>{branch?.full_address || "Đang tải..."}</p>
          </div>
          {!isBranchAdmin && branchIds.length > 1 && (
            <label>
              Chi nhánh
              <select
                value={branchId || ""}
                onChange={(event) =>
                  setParams({ "chi-nhanh": event.target.value })
                }
              >
                {activeBranches.map((item) => (
                  <option key={item.id_branch} value={item.id_branch}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>

        {error && <ManagementErrorBanner message={error} />}
        {pendingNotice && (
          <p className={styles.pendingNotice} role="status">
            {pendingNotice}
          </p>
        )}

        <section className={styles.schedule}>
          <header>
            <div>
              <p className="eyebrow">Lịch hẹn chi nhánh</p>
              <h2>Điều phối lịch khám</h2>
            </div>
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label="Chế độ hiển thị"
            >
              <button
                type="button"
                className={viewMode === "table" ? styles.active : undefined}
                onClick={() => setViewMode("table")}
              >
                Danh sách
              </button>
              <button
                type="button"
                className={viewMode === "calendar" ? styles.active : undefined}
                onClick={() => setViewMode("calendar")}
              >
                Lịch
              </button>
            </div>
          </header>

          <div className={styles.filters}>
            <label>
              Ngày
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label>
              Xem
              <select
                value={days}
                onChange={(event) =>
                  setDays(Number(event.target.value) as 1 | 7)
                }
              >
                <option value={1}>Theo ngày</option>
                <option value={7}>7 ngày tới</option>
              </select>
            </label>
            <label>
              Nha sĩ
              <select
                value={dentistId || ""}
                onChange={(event) =>
                  setDentistId(
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
              >
                <option value="">Tất cả nha sĩ</option>
                {branch?.dentists.map((dentist) => (
                  <option key={dentist.id_dentist} value={dentist.id_dentist}>
                    {dentist.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trạng thái
              <select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.target.value as ManagementAppointmentStatus | "",
                  )
                }
              >
                <option value="">Tất cả</option>
                {Object.entries(appointmentStatusLabels).map(
                  ([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>

          {viewMode === "calendar" ? (
            <AppointmentCalendar
              items={items}
              dentists={branch?.dentists || []}
              openingHours={branch?.opening_hours || []}
              selectedDate={date}
              days={days}
              busyCode={busy}
              onAction={updateAppointment}
              onCancel={setCancelling}
              onReschedule={setMoving}
            />
          ) : (
            <AppointmentList
              items={items}
              busyCode={busy}
              onAction={updateAppointment}
              onCancel={setCancelling}
              onReschedule={setMoving}
            />
          )}
        </section>
      </main>

      {activeCancellation && (
        <CancelAppointmentModal
          appointment={activeCancellation}
          busy={busy === activeCancellation.public_code}
          onClose={() => setCancelling(null)}
          onConfirm={cancelAppointment}
        />
      )}
      {activeReschedule && (
        <RescheduleAppointmentModal
          appointment={activeReschedule}
          dentists={branch?.dentists || []}
          busy={busy === activeReschedule.public_code}
          onClose={() => setMoving(null)}
          onFindSlots={findRescheduleSlots}
          onConfirm={moveAppointment}
        />
      )}
    </div>
  );
}
