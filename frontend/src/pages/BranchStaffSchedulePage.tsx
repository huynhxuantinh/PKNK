import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Navigate, useSearchParams } from "react-router-dom";

import { ApiError } from "../api/client";
import {
  createManagedTimeOff,
  createManagedWorkShift,
  listManagedBranchDentists,
  listManagedTimeOffs,
  listManagedWorkShifts,
  patchManagedTimeOff,
  patchManagedWorkShift,
  type ManagedTimeOff,
  type ManagedWorkShift,
} from "../api/management";
import { useAuth } from "../auth/AuthContext";
import { canAccessArea } from "../auth/roles";
import { ManagedBranchSelector } from "../components/branch-management/ManagedBranchSelector";
import { resolveScopedManagedBranchId } from "../components/branch-management/managedBranchSelection";
import type { ScheduleDentist } from "../components/branch-management/StaffScheduleList";
import {
  buildWorkShiftPayload,
  toHcmLocalInput,
  type WorkShiftFormValues,
  workShiftStatus,
  weekdayLabels,
} from "../components/branch-management/staffSchedulePresentation";
import { useManagedBranches } from "../components/branch-management/useManagedBranches";
import {
  AdminButton,
  AdminForm,
  AdminModal,
  DataTable,
  DatePicker,
  EmptyState,
  FormField,
  FormRow,
  StatusBadge,
} from "../components/admin/ui";
import { hcmDate } from "../components/branch-management/appointmentPresentation";
import styles from "./BranchStaffSchedulePage.module.css";
import "./BranchStaffSchedulePage.legacy.css";

interface TimeOffForm {
  dentist_id: string;
  starts_at: string;
  ends_at: string;
  reason: string;
}
type PendingToggle =
  | { kind: "shift"; item: ManagedWorkShift }
  | { kind: "time-off"; item: ManagedTimeOff };
const emptyShift = (): WorkShiftFormValues => ({
  dentist_id: "",
  weekday: "1",
  start_time: "08:00",
  end_time: "17:00",
  valid_from: hcmDate(new Date()),
  valid_to: "",
});
const emptyOff = (): TimeOffForm => ({
  dentist_id: "",
  starts_at: "",
  ends_at: "",
  reason: "",
});
const message = (error: unknown, fallback: string) =>
  error instanceof ApiError || error instanceof Error
    ? error.message
    : fallback;
const dentistName = (dentists: ScheduleDentist[], id: number) =>
  dentists.find((dentist) => dentist.id_dentist === id)?.full_name ||
  `Nha sĩ #${id}`;
const hcmDateTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  dateStyle: "short",
  timeStyle: "short",
});

function conflictMessage(error: unknown, fallback: string) {
  const text = message(error, fallback);
  return /xung đột|conflict|overlap|lịch hẹn/i.test(text)
    ? `Không thể lưu vì thời gian này xung đột với lịch hẹn hoặc lịch làm việc đang áp dụng. ${text}`
    : text;
}

export function BranchStaffSchedulePage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const managedBranches = useManagedBranches(user);
  const requestedBranchId = Number(params.get("chi-nhanh")) || null;
  const branchId =
    resolveScopedManagedBranchId({
      isBranchAdmin: managedBranches.isBranchAdmin,
      primaryBranchId: managedBranches.primaryBranchId,
      requestedBranchId,
      branches: managedBranches.branches,
      loaded: !managedBranches.loading,
    }) || 0;
  const currentBranch = managedBranches.branches.find(
    (branch) => branch.id_branch === branchId,
  );
  const canManageOrganizationTimeOffs = Boolean(
    currentBranch?.organization_id &&
      user?.memberships?.some(
        (membership) =>
          membership.is_active &&
          membership.role === "ORGANIZATION_ADMIN" &&
          membership.organization_id === currentBranch.organization_id,
      ),
  );
  const [dentists, setDentists] = useState<ScheduleDentist[]>([]);
  const [shifts, setShifts] = useState<ManagedWorkShift[]>([]);
  const [offs, setOffs] = useState<ManagedTimeOff[]>([]);
  const [shift, setShift] = useState<WorkShiftFormValues>(emptyShift);
  const [off, setOff] = useState<TimeOffForm>(emptyOff);
  const [offAppliesToAllBranches, setOffAppliesToAllBranches] =
    useState(false);
  const [editingShiftId, setEditingShiftId] = useState<number | null>(null);
  const [editingOffId, setEditingOffId] = useState<number | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [pendingToggle, setPendingToggle] = useState<PendingToggle | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const [savingKind, setSavingKind] = useState<"shift" | "off" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filterDentistId, setFilterDentistId] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [shiftPage, setShiftPage] = useState(0);
  const branchIdRef = useRef(branchId);
  const savingRef = useRef(false);
  const [shiftModalBranchId, setShiftModalBranchId] = useState<number | null>(
    null,
  );
  const [offModalBranchId, setOffModalBranchId] = useState<number | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!branchId) return;
      try {
        const [dentistData, shiftData, offData] = await Promise.all([
          listManagedBranchDentists(branchId, signal),
          listManagedWorkShifts(branchId, signal),
          listManagedTimeOffs(branchId, signal),
        ]);
        if (signal?.aborted || branchIdRef.current !== branchId) return;
        setDentists(dentistData.data);
        setShifts(shiftData.data);
        setOffs(offData.data);
        setError("");
      } catch (caught) {
        if (signal?.aborted || branchIdRef.current !== branchId) return;
        setError(message(caught, "Không thể tải ca làm và lịch nghỉ."));
      }
    },
    [branchId],
  );
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    branchIdRef.current = branchId;
    setDentists([]);
    setShifts([]);
    setOffs([]);
    setShift(emptyShift());
    setOff(emptyOff());
    setOffAppliesToAllBranches(false);
    setEditingShiftId(null);
    setEditingOffId(null);
    setShiftOpen(false);
    setOffOpen(false);
    setShiftModalBranchId(null);
    setOffModalBranchId(null);
    setPendingToggle(null);
    setBusyId(null);
    savingRef.current = false;
    setSavingKind(null);
    setError("");
    setNotice("");
  }, [branchId]);

  const activeShiftCount = useMemo(
    () => shifts.filter((item) => workShiftStatus(item) === "ACTIVE").length,
    [shifts],
  );
  const activeOffCount = useMemo(
    () => offs.filter((item) => item.is_active).length,
    [offs],
  );
  const matchesFilters = useCallback(
    (item: { dentist_id: number; is_active: boolean }) =>
      (!filterDentistId || item.dentist_id === Number(filterDentistId)) &&
      (filterStatus === "ALL" ||
        item.is_active === (filterStatus === "ACTIVE")),
    [filterDentistId, filterStatus],
  );
  const filteredShifts = useMemo(
    () => shifts.filter(matchesFilters),
    [matchesFilters, shifts],
  );
  const filteredOffs = useMemo(
    () => offs.filter(matchesFilters),
    [matchesFilters, offs],
  );
  const shiftPageSize = 7;
  const shiftPageCount = Math.max(
    1,
    Math.ceil(filteredShifts.length / shiftPageSize),
  );
  const displayedShifts = filteredShifts.slice(
    shiftPage * shiftPageSize,
    (shiftPage + 1) * shiftPageSize,
  );

  useEffect(() => {
    setShiftPage(0);
  }, [branchId, filterDentistId, filterStatus]);

  useEffect(() => {
    if (shiftPage >= shiftPageCount) setShiftPage(shiftPageCount - 1);
  }, [shiftPage, shiftPageCount]);
  const scheduleFilters = (
    <section
      className="branch-staff-page__filters"
      aria-label="Bộ lọc ca làm và nghỉ phép"
    >
      <label>
        Nha sĩ
        <select
          value={filterDentistId}
          onChange={(event) => setFilterDentistId(event.target.value)}
        >
          <option value="">Tất cả nha sĩ</option>
          {dentists.map((dentist) => (
            <option key={dentist.id_dentist} value={dentist.id_dentist}>
              {dentist.full_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Trạng thái
        <select
          value={filterStatus}
          onChange={(event) =>
            setFilterStatus(event.target.value as typeof filterStatus)
          }
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="ACTIVE">Đang áp dụng</option>
          <option value="INACTIVE">Đã ngừng</option>
        </select>
      </label>
      {(filterDentistId || filterStatus !== "ALL") && (
        <button
          type="button"
          onClick={() => {
            setFilterDentistId("");
            setFilterStatus("ALL");
          }}
        >
          Xóa lọc
        </button>
      )}
      <small>
        {filteredShifts.length} ca làm · {filteredOffs.length} lịch nghỉ
      </small>
    </section>
  );
  const resetShift = () => {
    setShift(emptyShift());
    setEditingShiftId(null);
    setShiftModalBranchId(null);
    setShiftOpen(false);
  };
  const resetOff = () => {
    setOff(emptyOff());
    setOffAppliesToAllBranches(false);
    setEditingOffId(null);
    setOffModalBranchId(null);
    setOffOpen(false);
  };
  const openShift = (item?: ManagedWorkShift) => {
    if (!branchId || (item && item.branch_id !== branchId)) return;
    if (item) {
      setShift({
        dentist_id: String(item.dentist_id),
        weekday: String(item.weekday),
        start_time: item.start_time.slice(0, 5),
        end_time: item.end_time.slice(0, 5),
        valid_from: item.valid_from,
        valid_to: item.valid_to || "",
      });
      setEditingShiftId(item.id_work_shift);
    } else {
      setShift(emptyShift());
      setEditingShiftId(null);
    }
    setShiftModalBranchId(branchId);
    setShiftOpen(true);
  };
  const openOff = (item?: ManagedTimeOff) => {
    if (
      !branchId ||
      (item && item.branch_id !== null && item.branch_id !== branchId)
    )
      return;
    if (item?.branch_id === null && !canManageOrganizationTimeOffs) return;
    setOffAppliesToAllBranches(item?.branch_id === null);
    if (item) {
      setOff({
        dentist_id: String(item.dentist_id),
        starts_at: toHcmLocalInput(item.starts_at),
        ends_at: toHcmLocalInput(item.ends_at),
        reason: item.reason,
      });
      setEditingOffId(item.id_time_off);
    } else {
      setOff(emptyOff());
      setEditingOffId(null);
    }
    setOffModalBranchId(branchId);
    setOffOpen(true);
  };

  async function saveShift(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    setNotice("");
    const submittingBranchId = branchId;
    if (
      !submittingBranchId ||
      shiftModalBranchId !== submittingBranchId ||
      (editingShiftId &&
        !shifts.some(
          (item) =>
            item.id_work_shift === editingShiftId &&
            item.branch_id === submittingBranchId,
        ))
    ) {
      resetShift();
      setError("Chi nhánh đã thay đổi. Hãy mở lại ca làm cần chỉnh sửa.");
      return;
    }
    if (shift.valid_to && shift.valid_to < shift.valid_from) {
      setError("Ngày kết thúc không được trước ngày bắt đầu.");
      return;
    }
    savingRef.current = true;
    setSavingKind("shift");
    try {
      const payload = buildWorkShiftPayload(shift);
      if (editingShiftId) await patchManagedWorkShift(editingShiftId, payload);
      else
        await createManagedWorkShift(submittingBranchId, {
          ...payload,
          is_active: true,
        });
      if (branchIdRef.current !== submittingBranchId) return;
      setNotice(editingShiftId ? "Đã cập nhật ca làm." : "Đã thêm ca làm.");
      resetShift();
      await load();
    } catch (caught) {
      if (branchIdRef.current !== submittingBranchId) return;
      setError(conflictMessage(caught, "Không thể lưu ca làm."));
    } finally {
      savingRef.current = false;
      setSavingKind(null);
    }
  }
  async function saveOff(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setError("");
    setNotice("");
    const submittingBranchId = branchId;
    if (
      !submittingBranchId ||
      offModalBranchId !== submittingBranchId ||
      (editingOffId &&
        !offs.some(
          (item) =>
            item.id_time_off === editingOffId &&
            (item.branch_id === null || item.branch_id === submittingBranchId),
        ))
    ) {
      resetOff();
      setError("Chi nhánh đã thay đổi. Hãy mở lại lịch nghỉ cần chỉnh sửa.");
      return;
    }
    if (
      !off.starts_at ||
      !off.ends_at ||
      new Date(off.ends_at) <= new Date(off.starts_at)
    ) {
      setError("Thời điểm kết thúc phải sau thời điểm bắt đầu.");
      return;
    }
    const payload = {
      dentist_id: Number(off.dentist_id),
      starts_at: `${off.starts_at}:00+07:00`,
      ends_at: `${off.ends_at}:00+07:00`,
      reason: off.reason.trim(),
      ...(canManageOrganizationTimeOffs
        ? { applies_to_all_branches: offAppliesToAllBranches }
        : {}),
    };
    savingRef.current = true;
    setSavingKind("off");
    try {
      if (editingOffId) await patchManagedTimeOff(editingOffId, payload);
      else
        await createManagedTimeOff(submittingBranchId, {
          ...payload,
          is_active: true,
        });
      if (branchIdRef.current !== submittingBranchId) return;
      setNotice(editingOffId ? "Đã cập nhật lịch nghỉ." : "Đã thêm lịch nghỉ.");
      resetOff();
      await load();
    } catch (caught) {
      if (branchIdRef.current !== submittingBranchId) return;
      setError(conflictMessage(caught, "Không thể lưu lịch nghỉ."));
    } finally {
      savingRef.current = false;
      setSavingKind(null);
    }
  }
  async function toggle() {
    if (!pendingToggle) return;
    const { item, kind } = pendingToggle;
    const submittingBranchId = branchId;
    const isInCurrentScope =
      kind === "shift"
        ? item.branch_id === submittingBranchId
        : item.branch_id === null || item.branch_id === submittingBranchId;
    if (
      !submittingBranchId ||
      !isInCurrentScope ||
      (kind === "time-off" &&
        item.branch_id === null &&
        !canManageOrganizationTimeOffs)
    ) {
      setPendingToggle(null);
      setError("Chi nhánh đã thay đổi. Hãy mở lại mục cần cập nhật.");
      return;
    }
    const id = kind === "shift" ? item.id_work_shift : item.id_time_off;
    setBusyId(id);
    setError("");
    try {
      if (kind === "shift")
        await patchManagedWorkShift(id, { is_active: !item.is_active });
      else await patchManagedTimeOff(id, { is_active: !item.is_active });
      if (branchIdRef.current !== submittingBranchId) return;
      setNotice(item.is_active ? "Đã ngừng áp dụng." : "Đã kích hoạt lại.");
      setPendingToggle(null);
      await load();
    } catch (caught) {
      if (branchIdRef.current !== submittingBranchId) return;
      setError(conflictMessage(caught, "Không thể cập nhật trạng thái."));
    } finally {
      setBusyId(null);
    }
  }

  if (!canAccessArea(user, "MANAGEMENT"))
    return <Navigate to="/quan-ly-chi-nhanh" replace />;
  if (!branchId)
    return (
      <div className="branch-management-page">
        <main className="branch-management-main">
          <ManagedBranchSelector
            branches={managedBranches.branches}
            loading={managedBranches.loading}
            error={managedBranches.error}
            onSelect={(id) => setParams({ "chi-nhanh": String(id) })}
          />
        </main>
      </div>
    );

  return (
    <div className="branch-management-page staff-schedule-page">
      <main className={`branch-management-main ${styles.page}`}>
        <header className="branch-staff-page__heading">
          <div>
            <p className="eyebrow">Nhân sự chi nhánh</p>
            <h1>Ca làm & nghỉ phép</h1>
            <p>
              Quản lý lịch làm việc của nha sĩ và kiểm tra xung đột trước khi áp
              dụng.
            </p>
          </div>
          <div>
            <StatusBadge tone="info">
              {activeShiftCount} ca đang áp dụng
            </StatusBadge>
            <StatusBadge tone="warning">{activeOffCount} lịch nghỉ</StatusBadge>
          </div>
        </header>
        {error && (
          <div className="app-error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="branch-staff-page__notice" role="status">
            {notice}
          </div>
        )}
        {scheduleFilters}
        <section className="branch-staff-page__section">
          <header>
            <div>
              <p className="eyebrow">Ca làm việc</p>
              <h2>Khung giờ nha sĩ làm việc</h2>
            </div>
            <AdminButton type="button" onClick={() => openShift()}>
              + Thêm ca làm
            </AdminButton>
          </header>
          <DataTable
            rows={displayedShifts}
            rowKey={(item) => item.id_work_shift}
            empty={
              <EmptyState
                title="Chưa có ca làm"
                description="Thêm ca để hệ thống có thể xếp lịch cho nha sĩ."
              />
            }
            columns={[
              {
                key: "dentist",
                header: "Nha sĩ",
                cell: (item) => (
                  <strong>{dentistName(dentists, item.dentist_id)}</strong>
                ),
              },
              {
                key: "weekday",
                header: "Ngày làm",
                cell: (item) => weekdayLabels[item.weekday - 1],
              },
              {
                key: "time",
                header: "Khung giờ",
                cell: (item) =>
                  `${item.start_time.slice(0, 5)} – ${item.end_time.slice(0, 5)}`,
              },
              {
                key: "validity",
                header: "Áp dụng",
                cell: (item) =>
                  `${item.valid_from}${item.valid_to ? ` – ${item.valid_to}` : " – Không thời hạn"}`,
              },
              {
                key: "state",
                header: "Trạng thái",
                cell: (item) => {
                  const state = workShiftStatus(item);
                  const labels = {
                    UPCOMING: ["info", "Sắp có hiệu lực"],
                    ACTIVE: ["success", "Đang áp dụng"],
                    EXPIRED: ["warning", "Đã hết hạn"],
                    INACTIVE: ["neutral", "Đã ngưng"],
                  } as const;
                  const [tone, label] = labels[state];
                  return <StatusBadge tone={tone}>{label}</StatusBadge>;
                },
              },
              {
                key: "action",
                header: "",
                cell: (item) => (
                  <div className="branch-staff-page__actions">
                    <button onClick={() => openShift(item)}>Sửa</button>
                    <button
                      onClick={() => setPendingToggle({ kind: "shift", item })}
                    >
                      {item.is_active ? "Ngừng" : "Kích hoạt"}
                    </button>
                  </div>
                ),
              },
            ]}
          />
          {shiftPageCount > 1 && (
            <nav
              className="branch-staff-page__pagination"
              aria-label="Phân trang ca làm"
            >
              <small>
                Hiển thị {shiftPage * shiftPageSize + 1}–
                {Math.min(
                  (shiftPage + 1) * shiftPageSize,
                  filteredShifts.length,
                )}{" "}
                / {filteredShifts.length} ca
              </small>
              <div>
                <button
                  type="button"
                  disabled={shiftPage === 0}
                  onClick={() => setShiftPage((page) => page - 1)}
                >
                  Trước
                </button>
                <span>
                  {shiftPage + 1} / {shiftPageCount}
                </span>
                <button
                  type="button"
                  disabled={shiftPage === shiftPageCount - 1}
                  onClick={() => setShiftPage((page) => page + 1)}
                >
                  Sau
                </button>
              </div>
            </nav>
          )}
        </section>
        <section className="branch-staff-page__section">
          <header>
            <div>
              <p className="eyebrow">Nghỉ phép / vắng mặt</p>
              <h2>Lịch nghỉ đã khai báo</h2>
            </div>
            <AdminButton type="button" onClick={() => openOff()}>
              + Thêm lịch nghỉ
            </AdminButton>
          </header>
          <p className="branch-staff-page__hint">
            Hệ thống sẽ từ chối lịch nghỉ trùng lịch khám đang hoạt động.
          </p>
          <DataTable
            rows={filteredOffs}
            rowKey={(item) => item.id_time_off}
            empty={
              <EmptyState
                title="Chưa có lịch nghỉ"
                description="Lịch nghỉ sẽ giúp hệ thống không mở giờ khám không khả dụng."
              />
            }
            columns={[
              {
                key: "dentist",
                header: "Nha sĩ",
                cell: (item) => (
                  <strong>{dentistName(dentists, item.dentist_id)}</strong>
                ),
              },
              {
                key: "period",
                header: "Thời gian",
                cell: (item) => (
                  <span>
                    {hcmDateTime.format(new Date(item.starts_at))}
                    <br />
                    đến {hcmDateTime.format(new Date(item.ends_at))}
                  </span>
                ),
              },
              { key: "reason", header: "Lý do", cell: (item) => item.reason },
              {
                key: "state",
                header: "Trạng thái",
                cell: (item) => (
                  <StatusBadge tone={item.is_active ? "warning" : "neutral"}>
                    {item.is_active ? "Đang áp dụng" : "Đã ngừng"}
                  </StatusBadge>
                ),
              },
              {
                key: "action",
                header: "",
                cell: (item) =>
                  item.branch_id === null && !canManageOrganizationTimeOffs ? (
                    <span className="branch-staff-page__organization-scope">
                      Toàn tổ chức
                    </span>
                  ) : (
                    <div className="branch-staff-page__actions">
                      <button onClick={() => openOff(item)}>Sửa</button>
                      <button
                        onClick={() =>
                          setPendingToggle({ kind: "time-off", item })
                        }
                      >
                        {item.is_active ? "Ngừng" : "Kích hoạt"}
                      </button>
                    </div>
                  ),
              },
            ]}
          />
        </section>
      </main>
      <AdminModal
        open={shiftOpen}
        title={editingShiftId ? "Chỉnh sửa ca làm" : "Thêm ca làm"}
        description="Thời gian theo giờ TP. Hồ Chí Minh."
        onClose={resetShift}
      >
        <AdminForm onSubmit={saveShift}>
          <FormRow>
            <FormField label="Nha sĩ">
              <select
                required
                value={shift.dentist_id}
                onChange={(event) =>
                  setShift({ ...shift, dentist_id: event.target.value })
                }
              >
                <option value="">Chọn nha sĩ</option>
                {dentists.map((dentist) => (
                  <option key={dentist.id_dentist} value={dentist.id_dentist}>
                    {dentist.full_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Thứ">
              <select
                value={shift.weekday}
                onChange={(event) =>
                  setShift({ ...shift, weekday: event.target.value })
                }
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Bắt đầu">
              <input
                required
                type="time"
                value={shift.start_time}
                onChange={(event) =>
                  setShift({ ...shift, start_time: event.target.value })
                }
              />
            </FormField>
            <FormField label="Kết thúc">
              <input
                required
                type="time"
                value={shift.end_time}
                onChange={(event) =>
                  setShift({ ...shift, end_time: event.target.value })
                }
              />
            </FormField>
          </FormRow>
          <FormRow>
            <FormField label="Áp dụng từ">
              <DatePicker
                required
                value={shift.valid_from}
                onChange={(event) =>
                  setShift({ ...shift, valid_from: event.target.value })
                }
              />
            </FormField>
            <FormField
              label="Áp dụng đến"
              hint="Để trống nếu không có ngày kết thúc."
            >
              <DatePicker
                min={shift.valid_from}
                value={shift.valid_to}
                onChange={(event) =>
                  setShift({ ...shift, valid_to: event.target.value })
                }
              />
            </FormField>
          </FormRow>
          <div className="branch-staff-page__modal-actions">
            <AdminButton disabled={savingKind !== null}>
              {savingKind === "shift" ? "Đang lưu..." : "Lưu ca làm"}
            </AdminButton>
            <AdminButton
              tone="secondary"
              type="button"
              disabled={savingKind !== null}
              onClick={resetShift}
            >
              Hủy
            </AdminButton>
          </div>
        </AdminForm>
      </AdminModal>
      <AdminModal
        open={offOpen}
        title={editingOffId ? "Chỉnh sửa lịch nghỉ" : "Thêm lịch nghỉ"}
        description="Hệ thống kiểm tra xung đột với lịch hẹn trước khi lưu."
        onClose={resetOff}
      >
        <AdminForm onSubmit={saveOff}>
          <FormField label="Nha sĩ">
            <select
              required
              value={off.dentist_id}
              onChange={(event) =>
                setOff({ ...off, dentist_id: event.target.value })
              }
            >
              <option value="">Chọn nha sĩ</option>
              {dentists.map((dentist) => (
                <option key={dentist.id_dentist} value={dentist.id_dentist}>
                  {dentist.full_name}
                </option>
              ))}
            </select>
          </FormField>
          {canManageOrganizationTimeOffs ? (
            <FormField label="Phạm vi áp dụng">
              <select
                value={offAppliesToAllBranches ? "ORGANIZATION" : "BRANCH"}
                disabled={Boolean(editingOffId && offAppliesToAllBranches)}
                onChange={(event) =>
                  setOffAppliesToAllBranches(
                    event.target.value === "ORGANIZATION",
                  )
                }
              >
                <option value="BRANCH">Chi nhánh hiện tại</option>
                <option value="ORGANIZATION">Toàn bộ chi nhánh</option>
              </select>
              {editingOffId && offAppliesToAllBranches && (
                <small>
                  Lịch nghỉ toàn chuỗi không thể chuyển về phạm vi một chi nhánh.
                </small>
              )}
            </FormField>
          ) : (
            <p className="branch-staff-page__hint">
              Phạm vi áp dụng: chi nhánh hiện tại.
            </p>
          )}
          <FormRow>
            <FormField label="Bắt đầu">
              <input
                required
                type="datetime-local"
                value={off.starts_at}
                onChange={(event) =>
                  setOff({ ...off, starts_at: event.target.value })
                }
              />
            </FormField>
            <FormField label="Kết thúc">
              <input
                required
                type="datetime-local"
                value={off.ends_at}
                onChange={(event) =>
                  setOff({ ...off, ends_at: event.target.value })
                }
              />
            </FormField>
          </FormRow>
          <FormField label="Lý do">
            <textarea
              required
              maxLength={500}
              value={off.reason}
              onChange={(event) =>
                setOff({ ...off, reason: event.target.value })
              }
            />
          </FormField>
          <div className="branch-staff-page__modal-actions">
            <AdminButton disabled={savingKind !== null}>
              {savingKind === "off" ? "Đang lưu..." : "Lưu lịch nghỉ"}
            </AdminButton>
            <AdminButton
              tone="secondary"
              type="button"
              disabled={savingKind !== null}
              onClick={resetOff}
            >
              Hủy
            </AdminButton>
          </div>
        </AdminForm>
      </AdminModal>
      {pendingToggle && (
        <AdminModal
          open
          title={
            pendingToggle.item.is_active ? "Ngừng áp dụng?" : "Kích hoạt lại?"
          }
          description={
            pendingToggle.item.is_active
              ? "Dữ liệu vẫn được lưu để đối soát, nhưng sẽ không còn được dùng để xếp lịch."
              : "Mục này sẽ có hiệu lực trở lại."
          }
          onClose={() => setPendingToggle(null)}
        >
          <div className="branch-staff-page__modal-actions">
            <AdminButton
              tone="danger"
              disabled={busyId !== null}
              onClick={() => void toggle()}
            >
              Xác nhận
            </AdminButton>
            <AdminButton
              tone="secondary"
              disabled={busyId !== null}
              onClick={() => setPendingToggle(null)}
            >
              Quay lại
            </AdminButton>
          </div>
        </AdminModal>
      )}
    </div>
  );
}
