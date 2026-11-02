import { useEffect, useMemo, useState } from "react";

import {
  createOrganizationDentist,
  getDentistBranches,
  getDentistServices,
  listOrganizationDentists,
  replaceDentistBranches,
  replaceDentistServices,
  updateOrganizationDentist,
  type OrganizationBranch,
  type OrganizationDentist,
  type OrganizationService,
} from "../../api/organization";
import { ConfirmationModal } from "../ConfirmationModal";
import { DataTable, EmptyState, StatusBadge } from "../admin/ui";
import { OrganizationAssignmentModal } from "./OrganizationAssignmentModal";
import { OrganizationDentistFormModal } from "./OrganizationDentistFormModal";
import {
  buildDentistInput,
  emptyDentistForm,
  type DentistFormState,
} from "../../features/organization/organizationValidation";
import styles from "./OrganizationDentistPanel.module.css";

type AssignmentMode = "branches" | "services";

export function OrganizationDentistPanel({
  organizationId,
  branches,
  services,
}: {
  organizationId: number;
  branches: OrganizationBranch[];
  services: OrganizationService[];
}) {
  const [dentists, setDentists] = useState<OrganizationDentist[]>([]);
  const [branchAssignments, setBranchAssignments] = useState<
    Record<number, number[]>
  >({});
  const [serviceAssignments, setServiceAssignments] = useState<
    Record<number, number[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingDentist, setEditingDentist] =
    useState<OrganizationDentist | null>(null);
  const [form, setForm] = useState<DentistFormState>(emptyDentistForm);
  const [formError, setFormError] = useState("");
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode | null>(
    null,
  );
  const [assignmentTarget, setAssignmentTarget] =
    useState<OrganizationDentist | null>(null);
  const [assignmentIds, setAssignmentIds] = useState<number[]>([]);
  const [assignmentError, setAssignmentError] = useState("");
  const [confirming, setConfirming] = useState<OrganizationDentist | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    async function load() {
      try {
        const response = await listOrganizationDentists(
          organizationId,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setDentists(response.data);
        setBranchAssignments({});
        setServiceAssignments({});
        setSelectedId(null);
      } catch (caught) {
        if (controller.signal.aborted) return;
        setDentists([]);
        setError(
          caught instanceof Error ? caught.message : "Không thể tải nha sĩ.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [organizationId, reloadKey]);

  useEffect(() => {
    if (
      !selectedId ||
      (branchAssignments[selectedId] && serviceAssignments[selectedId])
    )
      return;
    const controller = new AbortController();
    Promise.all([
      getDentistBranches(selectedId, controller.signal),
      getDentistServices(selectedId, controller.signal),
    ])
      .then(([branchResponse, serviceResponse]) => {
        if (controller.signal.aborted) return;
        setBranchAssignments((current) => ({
          ...current,
          [selectedId]: branchResponse.data.map((branch) => branch.id_branch),
        }));
        setServiceAssignments((current) => ({
          ...current,
          [selectedId]: serviceResponse.data.map(
            (service) => service.id_service,
          ),
        }));
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải phân công của nha sĩ.",
          );
        }
      });
    return () => controller.abort();
  }, [selectedId, branchAssignments, serviceAssignments]);

  const selectedDentist = useMemo(
    () => dentists.find((dentist) => dentist.id_dentist === selectedId) || null,
    [dentists, selectedId],
  );
  const filteredDentists = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    return dentists.filter((dentist) => {
      const matchesQuery =
        !keyword ||
        [dentist.full_name, dentist.user_email, dentist.license_number]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("vi-VN").includes(keyword),
          );
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? dentist.is_active : !dentist.is_active);
      return matchesQuery && matchesStatus;
    });
  }, [dentists, query, statusFilter]);

  function branchNames(dentistId: number) {
    if (!(dentistId in branchAssignments)) return "Đang tải phân công…";
    const ids = branchAssignments[dentistId] || [];
    if (ids.length === 0) return "Chưa gán";
    return ids
      .map(
        (id) =>
          branches.find((branch) => branch.id_branch === id)?.name || `#${id}`,
      )
      .join(", ");
  }

  function serviceNames(dentistId: number) {
    if (!(dentistId in serviceAssignments)) return "Đang tải phân công…";
    const ids = serviceAssignments[dentistId] || [];
    if (ids.length === 0) return "Chưa gán";
    return ids
      .map(
        (id) =>
          services.find((service) => service.id_service === id)?.name ||
          `#${id}`,
      )
      .join(", ");
  }

  function openCreate() {
    setEditingDentist(null);
    setForm(emptyDentistForm());
    setFormError("");
    setFormOpen(true);
  }

  function openEdit(dentist: OrganizationDentist) {
    setEditingDentist(dentist);
    setForm({
      email: dentist.user_email,
      licenseNumber: dentist.license_number || "",
      biography: dentist.biography || "",
    });
    setFormError("");
    setFormOpen(true);
  }

  async function saveDentist() {
    let input;
    try {
      input = buildDentistInput(form);
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Dữ liệu nha sĩ chưa hợp lệ.",
      );
      return;
    }
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      if (editingDentist) {
        await updateOrganizationDentist(editingDentist.id_dentist, {
          license_number: input.license_number,
          biography: input.biography,
        });
        setNotice("Đã cập nhật hồ sơ nha sĩ.");
      } else {
        await createOrganizationDentist(organizationId, input);
        setNotice(
          "Đã tạo hồ sơ nha sĩ. Hãy gán chi nhánh để nha sĩ có thể làm việc.",
        );
      }
      setFormOpen(false);
      setEditingDentist(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Không thể lưu hồ sơ nha sĩ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function openAssignment(
    mode: AssignmentMode,
    dentist: OrganizationDentist,
  ) {
    const hasAssignments =
      mode === "branches"
        ? dentist.id_dentist in branchAssignments
        : dentist.id_dentist in serviceAssignments;
    let selected =
      mode === "branches"
        ? branchAssignments[dentist.id_dentist] || []
        : serviceAssignments[dentist.id_dentist] || [];
    if (!hasAssignments) {
      setBusy(true);
      setAssignmentError("");
      try {
        if (mode === "branches") {
          const response = await getDentistBranches(dentist.id_dentist);
          selected = response.data.map((branch) => branch.id_branch);
          setBranchAssignments((current) => ({
            ...current,
            [dentist.id_dentist]: selected,
          }));
        } else {
          const response = await getDentistServices(dentist.id_dentist);
          selected = response.data.map((service) => service.id_service);
          setServiceAssignments((current) => ({
            ...current,
            [dentist.id_dentist]: selected,
          }));
        }
      } catch (caught) {
        setAssignmentError(
          caught instanceof Error ? caught.message : "Không thể tải phân công.",
        );
        return;
      } finally {
        setBusy(false);
      }
    }
    setAssignmentMode(mode);
    setAssignmentTarget(dentist);
    setAssignmentError("");
    setAssignmentIds(selected);
  }

  async function saveAssignment() {
    if (!assignmentMode || !assignmentTarget) return;
    setBusy(true);
    setAssignmentError("");
    setNotice("");
    try {
      if (assignmentMode === "branches") {
        await replaceDentistBranches(
          assignmentTarget.id_dentist,
          assignmentIds,
        );
        setNotice("Đã cập nhật chi nhánh làm việc của nha sĩ.");
      } else {
        await replaceDentistServices(
          assignmentTarget.id_dentist,
          assignmentIds,
        );
        setNotice("Đã cập nhật dịch vụ của nha sĩ.");
      }
      setAssignmentMode(null);
      setAssignmentTarget(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setAssignmentError(
        caught instanceof Error ? caught.message : "Không thể lưu phân công.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(dentist: OrganizationDentist) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateOrganizationDentist(dentist.id_dentist, {
        is_active: !dentist.is_active,
      });
      setConfirming(null);
      setNotice(
        dentist.is_active ? "Đã ngưng nha sĩ." : "Đã kích hoạt nha sĩ.",
      );
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setConfirming(null);
      setError(
        caught instanceof Error ? caught.message : "Không thể cập nhật nha sĩ.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="branch-management-schedule organization-report-section"
      aria-labelledby="organization-dentists-title"
    >
      <header>
        <div>
          <span className="branch-report-eyebrow">NHA SĨ</span>
          <h2 id="organization-dentists-title">Đội ngũ nha sĩ</h2>
        </div>
        <button
          type="button"
          className="organization-primary-button"
          onClick={openCreate}
        >
          Thêm hồ sơ nha sĩ
        </button>
      </header>

      <p className="organization-hint">
        Nha sĩ phải đăng ký và xác minh email trước. Sau khi tạo hồ sơ, gán ít
        nhất một chi nhánh để nha sĩ đăng nhập được vào khu vực làm việc.
      </p>

      {error && (
        <div className="app-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="staff-schedule-notice" role="status">
          {notice}
        </div>
      )}

      {!loading && dentists.length > 0 && (
        <div className={styles.toolbar}>
          <label>
            Tìm nha sĩ
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, email hoặc số giấy phép"
            />
          </label>
          <label>
            Trạng thái
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as typeof statusFilter)
              }
            >
              <option value="ALL">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Đã ngưng</option>
            </select>
          </label>
          <small>
            {filteredDentists.length}/{dentists.length} nha sĩ
          </small>
        </div>
      )}

      {loading ? (
        <p role="status">Đang tải nha sĩ...</p>
      ) : dentists.length > 0 ? (
        <>
          <DataTable
            rows={filteredDentists}
            rowKey={(dentist) => dentist.id_dentist}
            empty={
              <EmptyState
                title={
                  dentists.length ? "Không có nha sĩ phù hợp" : "Chưa có nha sĩ"
                }
                description={
                  dentists.length
                    ? "Hãy đổi từ khóa hoặc bộ lọc trạng thái."
                    : "Thêm hồ sơ nha sĩ đầu tiên cho tổ chức."
                }
              />
            }
            columns={[
              {
                key: "dentist",
                header: "Nha sĩ",
                cell: (dentist) => (
                  <div className="organization-branch-cell">
                    <strong>{dentist.full_name || "Chưa đặt tên"}</strong>
                    <small>{dentist.user_email}</small>
                  </div>
                ),
              },
              {
                key: "license",
                header: "Giấy phép",
                cell: (dentist) => dentist.license_number || "—",
              },
              {
                key: "status",
                header: "Trạng thái",
                cell: (dentist) => (
                  <StatusBadge tone={dentist.is_active ? "success" : "neutral"}>
                    {dentist.is_active ? "Đang hoạt động" : "Đã ngưng"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Thao tác",
                className: "organization-branch-actions-cell",
                cell: (dentist) => (
                  <div className="organization-row-actions">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedId(
                          selectedId === dentist.id_dentist
                            ? null
                            : dentist.id_dentist,
                        )
                      }
                    >
                      {selectedId === dentist.id_dentist
                        ? "Ẩn chi tiết"
                        : "Chi tiết"}
                    </button>
                    <button
                      type="button"
                      className={dentist.is_active ? "is-danger" : undefined}
                      disabled={busy}
                      onClick={() => {
                        if (dentist.is_active) setConfirming(dentist);
                        else void toggleActive(dentist);
                      }}
                    >
                      {dentist.is_active ? "Ngưng" : "Kích hoạt"}
                    </button>
                  </div>
                ),
              },
            ]}
          />

          {selectedDentist && (
            <aside
              className={styles.detailPanel}
              aria-label="Chi tiết nha sĩ"
            >
              <header>
                <div>
                  <span className="branch-report-eyebrow">CHI TIẾT NHA SĨ</span>
                  <h3>{selectedDentist.full_name}</h3>
                  <p>{selectedDentist.user_email}</p>
                </div>
                <button type="button" onClick={() => setSelectedId(null)}>
                  Đóng
                </button>
              </header>
              <dl>
                <div>
                  <dt>Số giấy phép</dt>
                  <dd>{selectedDentist.license_number || "—"}</dd>
                </div>
                <div>
                  <dt>Chi nhánh</dt>
                  <dd>{branchNames(selectedDentist.id_dentist)}</dd>
                </div>
                <div>
                  <dt>Dịch vụ</dt>
                  <dd>{serviceNames(selectedDentist.id_dentist)}</dd>
                </div>
                <div>
                  <dt>Giới thiệu</dt>
                  <dd>{selectedDentist.biography || "—"}</dd>
                </div>
              </dl>
              <div className={styles.detailActions}>
                <button
                  type="button"
                  onClick={() =>
                    void openAssignment("branches", selectedDentist)
                  }
                >
                  Gán chi nhánh
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void openAssignment("services", selectedDentist)
                  }
                >
                  Gán dịch vụ
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => openEdit(selectedDentist)}
                >
                  Sửa
                </button>
                <button
                  type="button"
                  className={
                    selectedDentist.is_active ? "is-danger" : undefined
                  }
                  disabled={busy}
                  onClick={() => {
                    if (selectedDentist.is_active)
                      setConfirming(selectedDentist);
                    else void toggleActive(selectedDentist);
                  }}
                >
                  {selectedDentist.is_active ? "Ngưng" : "Kích hoạt"}
                </button>
              </div>
            </aside>
          )}
        </>
      ) : (
        <p className="branch-report-empty">Tổ chức chưa có nha sĩ.</p>
      )}

      {formOpen && (
        <OrganizationDentistFormModal
          dentist={editingDentist}
          form={form}
          busy={busy}
          error={formError}
          onChange={(changes) =>
            setForm((current) => ({ ...current, ...changes }))
          }
          onClose={() => {
            if (!busy) {
              setFormOpen(false);
              setEditingDentist(null);
            }
          }}
          onSubmit={() => void saveDentist()}
        />
      )}

      {assignmentMode && assignmentTarget && (
        <OrganizationAssignmentModal
          title={
            assignmentMode === "branches" ? "Gán chi nhánh" : "Gán dịch vụ"
          }
          description={
            assignmentMode === "branches"
              ? `Chọn các chi nhánh nha sĩ ${assignmentTarget.full_name} sẽ làm việc. Danh sách được thay thế toàn bộ.`
              : `Chọn các dịch vụ nha sĩ ${assignmentTarget.full_name} có thể thực hiện. Danh sách được thay thế toàn bộ.`
          }
          warning={
            assignmentMode === "branches"
              ? "Khi gán chi nhánh, vai trò bệnh nhân của tài khoản sẽ tự tắt. Nếu còn lịch hẹn bệnh nhân đang hoạt động hoặc gỡ chi nhánh còn lịch tương lai, hệ thống sẽ từ chối."
              : "Bỏ một dịch vụ đang có lịch tương lai sẽ bị từ chối."
          }
          options={
            assignmentMode === "branches"
              ? branches
                  .filter((branch) => branch.is_active)
                  .map((branch) => ({
                    id: branch.id_branch,
                    label: branch.name,
                    hint: branch.code,
                  }))
              : services.map((service) => ({
                  id: service.id_service,
                  label: service.name,
                  hint: service.code,
                }))
          }
          selectedIds={assignmentIds}
          emptyText={
            assignmentMode === "branches"
              ? "Chưa có chi nhánh hoạt động."
              : "Chưa có dịch vụ."
          }
          busy={busy}
          error={assignmentError}
          onToggle={(id) =>
            setAssignmentIds((current) =>
              current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id],
            )
          }
          onClose={() => {
            if (!busy) {
              setAssignmentMode(null);
              setAssignmentTarget(null);
            }
          }}
          onSave={() => void saveAssignment()}
        />
      )}

      {confirming && (
        <ConfirmationModal
          title="Ngưng nha sĩ"
          description={`Ngưng hoạt động của ${confirming.full_name}? Nếu nha sĩ còn lịch tương lai, hệ thống sẽ từ chối thao tác.`}
          confirmLabel="Ngưng nha sĩ"
          danger
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void toggleActive(confirming)}
        />
      )}
    </section>
  );
}
