import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import {
  createOrganizationBranch,
  listOrganizationBranches,
  listProvinces,
  listWards,
  updateOrganizationBranch,
  type OrganizationBranch,
} from "../api/organization";
import {
  listManagedBranchDentists,
  listManagedBranchServices,
  listManagedChairs,
} from "../api/management";
import { ConfirmationModal } from "../components/ConfirmationModal";
import {
  AdminModal,
  DataTable,
  EmptyState,
  StatusBadge,
} from "../components/admin/ui";
import { OrganizationBranchModal } from "../components/organization-management/OrganizationBranchModal";
import { OrganizationPageLayout } from "../components/organization-management/OrganizationPageLayout";
import { useOrganizationScope } from "../components/organization-management/useOrganizationScope";
import {
  branchToForm,
  buildBranchInput,
  emptyBranchForm,
  type BranchFormState,
} from "../features/organization/organizationValidation";
import type { AdministrativeOption } from "../types/api";
import styles from "./OrganizationBranchesPage.module.css";

export function OrganizationBranchesPage() {
  const scope = useOrganizationScope();
  const [branches, setBranches] = useState<OrganizationBranch[]>([]);
  const [provinces, setProvinces] = useState<AdministrativeOption[]>([]);
  const [wards, setWards] = useState<AdministrativeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [loadingWards, setLoadingWards] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<OrganizationBranch | null>(
    null,
  );
  const [modalOrganizationId, setModalOrganizationId] = useState<number | null>(
    null,
  );
  const [form, setForm] = useState<BranchFormState>(emptyBranchForm);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmingBranch, setConfirmingBranch] =
    useState<OrganizationBranch | null>(null);
  const [selectedBranch, setSelectedBranch] =
    useState<OrganizationBranch | null>(null);
  const [branchDetails, setBranchDetails] = useState({
    dentists: 0,
    activeServices: 0,
    activeChairs: 0,
  });
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const wardControllerRef = useRef<AbortController | null>(null);
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name ||
    "Quản trị tổ chức";
  const filteredBranches = branches.filter((branch) => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    const matchesKeyword =
      !keyword ||
      [
        branch.name,
        branch.code,
        branch.address_line,
        branch.phone,
        branch.email,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("vi-VN").includes(keyword),
        );
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" ? branch.is_active : !branch.is_active);
    return matchesKeyword && matchesStatus;
  });

  useEffect(() => {
    const controller = new AbortController();
    listProvinces(controller.signal)
      .then((response) => setProvinces(response.data))
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải tỉnh/thành.",
          );
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!scope.organizationId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listOrganizationBranches(scope.organizationId, controller.signal)
      .then((response) => setBranches(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setBranches([]);
        setError(
          caught instanceof Error ? caught.message : "Không thể tải chi nhánh.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope.organizationId, reloadKey]);

  useEffect(() => {
    wardControllerRef.current?.abort();
    setModalOpen(false);
    setModalOrganizationId(null);
    setEditingBranch(null);
    setConfirmingBranch(null);
    setSelectedBranch(null);
    setForm(emptyBranchForm());
    setFormError("");
    setWards([]);
    setNotice("");
  }, [scope.organizationId]);

  useEffect(() => {
    if (!selectedBranch) return;
    setBranchDetails({ dentists: 0, activeServices: 0, activeChairs: 0 });
    setDetailsError("");
    if (!selectedBranch.is_active) {
      setDetailsLoading(false);
      return;
    }
    const controller = new AbortController();
    setDetailsLoading(true);
    Promise.all([
      listManagedBranchDentists(selectedBranch.id_branch, controller.signal),
      listManagedBranchServices(selectedBranch.id_branch, controller.signal),
      listManagedChairs(selectedBranch.id_branch, controller.signal),
    ])
      .then(([dentists, services, chairs]) => {
        if (controller.signal.aborted) return;
        setBranchDetails({
          dentists: dentists.data.filter((dentist) => dentist.is_active).length,
          activeServices: services.data.filter((service) => service.is_active)
            .length,
          activeChairs: chairs.data.filter((chair) => chair.is_active).length,
        });
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setBranchDetails({ dentists: 0, activeServices: 0, activeChairs: 0 });
          setDetailsError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải thông tin vận hành chi nhánh.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setDetailsLoading(false);
      });
    return () => controller.abort();
  }, [selectedBranch]);

  function loadWards(provinceCode: string) {
    wardControllerRef.current?.abort();
    if (!provinceCode) {
      setWards([]);
      setLoadingWards(false);
      return;
    }
    const controller = new AbortController();
    wardControllerRef.current = controller;
    setLoadingWards(true);
    listWards(provinceCode, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setWards(response.data);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setWards([]);
          setFormError(
            caught instanceof Error
              ? caught.message
              : "Không thể tải phường/xã.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingWards(false);
      });
  }

  function openCreate() {
    setEditingBranch(null);
    setModalOrganizationId(scope.organizationId);
    setForm(emptyBranchForm());
    setWards([]);
    setFormError("");
    setModalOpen(true);
  }

  function openBranchDetails(branch: OrganizationBranch) {
    setBranchDetails({ dentists: 0, activeServices: 0, activeChairs: 0 });
    setDetailsLoading(branch.is_active);
    setDetailsError("");
    setSelectedBranch(branch);
  }

  function openEdit(branch: OrganizationBranch) {
    setEditingBranch(branch);
    setModalOrganizationId(scope.organizationId);
    setForm(branchToForm(branch));
    setFormError("");
    setModalOpen(true);
    setWards([]);
    loadWards(branch.province_code);
  }

  function changeProvince(provinceCode: string) {
    setForm((current) => ({ ...current, provinceCode, wardCode: "" }));
    loadWards(provinceCode);
  }

  async function submitBranch() {
    if (!scope.organizationId || modalOrganizationId !== scope.organizationId) {
      setFormError("Phạm vi tổ chức đã thay đổi. Hãy mở lại biểu mẫu.");
      return;
    }
    let input;
    try {
      input = buildBranchInput(form);
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Dữ liệu chi nhánh chưa hợp lệ.",
      );
      return;
    }

    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      if (editingBranch) {
        await updateOrganizationBranch(editingBranch.id_branch, input);
        setNotice("Đã cập nhật chi nhánh.");
      } else {
        await createOrganizationBranch(scope.organizationId, input);
        setNotice("Đã tạo chi nhánh.");
      }
      setModalOpen(false);
      setEditingBranch(null);
      setModalOrganizationId(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Không thể lưu chi nhánh.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(branch: OrganizationBranch) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateOrganizationBranch(branch.id_branch, {
        is_active: !branch.is_active,
      });
      setConfirmingBranch(null);
      setNotice(
        branch.is_active
          ? "Đã ngưng hoạt động chi nhánh."
          : "Đã kích hoạt chi nhánh.",
      );
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setConfirmingBranch(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể cập nhật chi nhánh.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizationPageLayout
      organizationId={scope.organizationId}
      heroKicker="Mạng lưới chi nhánh"
      heroTitle={organizationName}
      heroDescription="Quản lý danh mục, địa chỉ và trạng thái hoạt động của từng chi nhánh."
      heroAside={
        <button
          type="button"
          className="organization-hero-button"
          onClick={openCreate}
        >
          Thêm chi nhánh
        </button>
      }
    >
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

      <section
        className="branch-management-schedule organization-report-section"
        aria-labelledby="organization-branches-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">DANH MỤC CHI NHÁNH</span>
            <h2 id="organization-branches-title">Chi nhánh của tổ chức</h2>
          </div>
          <small>
            {branches.filter((branch) => branch.is_active).length} đang hoạt
            động
          </small>
        </header>

        <div className={styles.toolbar}>
          <label>
            Tìm chi nhánh
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, mã, địa chỉ hoặc liên hệ"
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
            {filteredBranches.length}/{branches.length} chi nhánh
          </small>
        </div>

        {loading ? (
          <p role="status">Đang tải chi nhánh...</p>
        ) : (
          <DataTable
            rows={filteredBranches}
            rowKey={(branch) => branch.id_branch}
            empty={
              <EmptyState
                title={
                  branches.length
                    ? "Không có chi nhánh phù hợp"
                    : "Tổ chức chưa có chi nhánh"
                }
                description={
                  branches.length
                    ? "Hãy thử thay đổi từ khóa hoặc trạng thái lọc."
                    : "Thêm chi nhánh đầu tiên để bắt đầu vận hành."
                }
              />
            }
            columns={[
              {
                key: "branch",
                header: "Chi nhánh",
                cell: (branch) => (
                  <div className={styles.branchCell}>
                    <strong>{branch.name}</strong>
                    <small>
                      {branch.code} · {branch.address_line}
                    </small>
                  </div>
                ),
              },
              {
                key: "contact",
                header: "Liên hệ",
                cell: (branch) => (
                  <div className={styles.branchCell}>
                    <strong>{branch.phone || "—"}</strong>
                    <small>{branch.email || "Chưa có email"}</small>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Trạng thái",
                cell: (branch) => (
                  <StatusBadge tone={branch.is_active ? "success" : "neutral"}>
                    {branch.is_active ? "Đang hoạt động" : "Đã ngưng"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Thao tác",
                className: styles.actionsCell,
                cell: (branch) => (
                  <div className="organization-row-actions">
                    <button
                      type="button"
                      onClick={() => openBranchDetails(branch)}
                    >
                      Chi tiết
                    </button>
                    <button type="button" onClick={() => openEdit(branch)}>
                      Sửa
                    </button>
                    <button
                      type="button"
                      className={branch.is_active ? "is-danger" : undefined}
                      disabled={busy}
                      onClick={() => setConfirmingBranch(branch)}
                    >
                      {branch.is_active ? "Ngưng" : "Kích hoạt"}
                    </button>
                    {branch.is_active && (
                      <Link
                        to={`/quan-ly-chi-nhanh?chi-nhanh=${branch.id_branch}`}
                      >
                        Vận hành
                      </Link>
                    )}
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      {modalOpen && (
        <OrganizationBranchModal
          branch={editingBranch}
          form={form}
          provinces={provinces}
          wards={wards}
          loadingWards={loadingWards}
          busy={busy}
          error={formError}
          onChange={(changes) =>
            setForm((current) => ({ ...current, ...changes }))
          }
          onProvinceChange={changeProvince}
          onClose={() => {
            if (!busy) {
              setModalOpen(false);
              setEditingBranch(null);
              setModalOrganizationId(null);
            }
          }}
          onSubmit={() => void submitBranch()}
        />
      )}

      {confirmingBranch && (
        <ConfirmationModal
          title={
            confirmingBranch.is_active
              ? "Ngưng hoạt động chi nhánh"
              : "Kích hoạt chi nhánh"
          }
          description={
            confirmingBranch.is_active
              ? `Chi nhánh ${confirmingBranch.name} sẽ không còn nhận lịch mới. Nếu còn lịch tương lai, hệ thống sẽ từ chối thao tác.`
              : `Kích hoạt ${confirmingBranch.name} để chi nhánh có thể nhận lịch mới.`
          }
          confirmLabel={
            confirmingBranch.is_active
              ? "Ngưng chi nhánh"
              : "Kích hoạt chi nhánh"
          }
          danger={confirmingBranch.is_active}
          busy={busy}
          onCancel={() => setConfirmingBranch(null)}
          onConfirm={() => void toggleActive(confirmingBranch)}
        />
      )}

      {selectedBranch && (
        <AdminModal
          open
          placement="end"
          className="organization-audit-drawer"
          title={selectedBranch.name}
          description={`${selectedBranch.code} · ${selectedBranch.is_active ? "Đang hoạt động" : "Đã ngưng hoạt động"}`}
          onClose={() => setSelectedBranch(null)}
        >
          {detailsError && (
            <div className="app-error" role="alert">
              {detailsError}
            </div>
          )}
          <div className="organization-audit-detail">
            <dl>
              <div>
                <dt>Địa chỉ</dt>
                <dd>{selectedBranch.address_line}</dd>
              </div>
              <div>
                <dt>Điện thoại</dt>
                <dd>{selectedBranch.phone || "Chưa cập nhật"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{selectedBranch.email || "Chưa cập nhật"}</dd>
              </div>
            </dl>
            {!selectedBranch.is_active ? (
              <p>Chi nhánh đã ngưng hoạt động; số liệu vận hành không khả dụng.</p>
            ) : detailsLoading ? (
              <p role="status">Đang tải tình hình vận hành...</p>
            ) : !detailsError ? (
              <section className="organization-detail-kpis">
                <article>
                  <span>Nha sĩ hoạt động</span>
                  <strong>{branchDetails.dentists}</strong>
                </article>
                <article>
                  <span>Dịch vụ đang cung cấp</span>
                  <strong>{branchDetails.activeServices}</strong>
                </article>
                <article>
                  <span>Ghế / phòng sẵn sàng</span>
                  <strong>{branchDetails.activeChairs}</strong>
                </article>
              </section>
            ) : null}
            {selectedBranch.is_active && <div className="organization-row-actions organization-detail-links">
              <Link
                to={`/quan-ly-chi-nhanh?chi-nhanh=${selectedBranch.id_branch}`}
              >
                Tổng quan
              </Link>
              <Link
                to={`/quan-ly-chi-nhanh/lich-hen?chi-nhanh=${selectedBranch.id_branch}`}
              >
                Lịch hẹn
              </Link>
              <Link
                to={`/quan-ly-chi-nhanh/hoa-don?chi-nhanh=${selectedBranch.id_branch}`}
              >
                Hóa đơn
              </Link>
              <Link
                to={`/quan-ly-chi-nhanh/cau-hinh?chi-nhanh=${selectedBranch.id_branch}`}
              >
                Cấu hình
              </Link>
            </div>}
          </div>
        </AdminModal>
      )}
    </OrganizationPageLayout>
  );
}
