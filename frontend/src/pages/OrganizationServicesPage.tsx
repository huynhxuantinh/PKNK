import { useEffect, useMemo, useState } from "react";

import {
  createOrganizationService,
  listOrganizationBranches,
  listOrganizationServices,
  updateOrganizationService,
  type OrganizationBranch,
  type OrganizationService,
} from "../api/organization";
import {
  listManagedBranchServices,
  type ManagedBranchService,
} from "../api/management";
import { ConfirmationModal } from "../components/ConfirmationModal";
import {
  AdminModal,
  DataTable,
  EmptyState,
  StatusBadge,
} from "../components/admin/ui";
import { OrganizationPageLayout } from "../components/organization-management/OrganizationPageLayout";
import { OrganizationServiceModal } from "../components/organization-management/OrganizationServiceModal";
import { useOrganizationScope } from "../components/organization-management/useOrganizationScope";
import {
  buildServiceInput,
  emptyServiceForm,
  serviceToForm,
  type ServiceFormState,
} from "../features/organization/organizationValidation";
import { formatVnd } from "../components/branch-management/branchReportPresentation";
import styles from "./OrganizationServicesPage.module.css";

export function OrganizationServicesPage() {
  const scope = useOrganizationScope();
  const [services, setServices] = useState<OrganizationService[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE"
  >("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingService, setEditingService] =
    useState<OrganizationService | null>(null);
  const [modalOrganizationId, setModalOrganizationId] = useState<number | null>(
    null,
  );
  const [form, setForm] = useState<ServiceFormState>(emptyServiceForm);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<OrganizationService | null>(
    null,
  );
  const [comparing, setComparing] = useState<OrganizationService | null>(null);
  const [comparisonBranches, setComparisonBranches] = useState<
    OrganizationBranch[]
  >([]);
  const [branchServiceMap, setBranchServiceMap] = useState<
    Record<number, ManagedBranchService | null>
  >({});
  const [comparisonFailedBranchIds, setComparisonFailedBranchIds] = useState<
    number[]
  >([]);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name ||
    "Quản trị tổ chức";
  const filteredServices = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("vi-VN");
    return services.filter((service) => {
      const matchesKeyword =
        !keyword ||
        [service.name, service.code, service.description]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase("vi-VN").includes(keyword),
          );
      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" ? service.is_active : !service.is_active);
      return matchesKeyword && matchesStatus;
    });
  }, [query, services, statusFilter]);

  useEffect(() => {
    if (!scope.organizationId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    listOrganizationServices(scope.organizationId, controller.signal)
      .then((response) => setServices(response.data))
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setServices([]);
        setError(
          caught instanceof Error ? caught.message : "Không thể tải dịch vụ.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope.organizationId, reloadKey]);

  useEffect(() => {
    setModalOpen(false);
    setModalOrganizationId(null);
    setEditingService(null);
    setConfirming(null);
    setComparing(null);
    setForm(emptyServiceForm());
    setFormError("");
    setComparisonBranches([]);
    setBranchServiceMap({});
    setComparisonFailedBranchIds([]);
    setNotice("");
  }, [scope.organizationId]);

  useEffect(() => {
    if (!comparing || !scope.organizationId) return;
    const controller = new AbortController();
    setComparisonLoading(true);
    setComparisonError("");
    setComparisonBranches([]);
    setBranchServiceMap({});
    setComparisonFailedBranchIds([]);
    listOrganizationBranches(scope.organizationId, controller.signal)
      .then(async (branchResponse) => {
        const branches = branchResponse.data.filter(
          (branch) => branch.is_active,
        );
        const results = await Promise.allSettled(
          branches.map(async (branch) => {
            const response = await listManagedBranchServices(
              branch.id_branch,
              controller.signal,
            );
            return [
              branch.id_branch,
              response.data.find(
                (item) => item.service_id === comparing.id_service,
              ) || null,
            ] as const;
          }),
        );
        if (controller.signal.aborted) return;
        setComparisonBranches(branches);
        setBranchServiceMap(
          Object.fromEntries(
            results.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          ),
        );
        const failedBranchIds = results.flatMap((result, index) =>
          result.status === "rejected" ? [branches[index].id_branch] : [],
        );
        setComparisonFailedBranchIds(failedBranchIds);
        if (failedBranchIds.length > 0)
          setComparisonError(
            `Không tải được cấu hình dịch vụ của ${failedBranchIds.length} chi nhánh. Các chi nhánh còn lại vẫn hiển thị.`,
          );
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setComparisonError(
          caught instanceof Error
            ? caught.message
            : "Không thể tải cấu hình dịch vụ theo chi nhánh.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setComparisonLoading(false);
      });
    return () => controller.abort();
  }, [comparing, scope.organizationId]);

  function openCreate() {
    setEditingService(null);
    setModalOrganizationId(scope.organizationId);
    setForm(emptyServiceForm());
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(service: OrganizationService) {
    setEditingService(service);
    setModalOrganizationId(scope.organizationId);
    setForm(serviceToForm(service));
    setFormError("");
    setModalOpen(true);
  }

  async function submitService() {
    if (!scope.organizationId || modalOrganizationId !== scope.organizationId) {
      setFormError("Phạm vi tổ chức đã thay đổi. Hãy mở lại biểu mẫu.");
      return;
    }
    let input;
    try {
      input = buildServiceInput(form);
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "Dữ liệu dịch vụ chưa hợp lệ.",
      );
      return;
    }
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      if (editingService) {
        await updateOrganizationService(editingService.id_service, input);
        setNotice("Đã cập nhật dịch vụ.");
      } else {
        await createOrganizationService(scope.organizationId, input);
        setNotice("Đã tạo dịch vụ.");
      }
      setModalOpen(false);
      setEditingService(null);
      setModalOrganizationId(null);
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setFormError(
        caught instanceof Error ? caught.message : "Không thể lưu dịch vụ.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(service: OrganizationService) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateOrganizationService(service.id_service, {
        is_active: !service.is_active,
      });
      setConfirming(null);
      setNotice(
        service.is_active ? "Đã ngưng dịch vụ." : "Đã kích hoạt dịch vụ.",
      );
      setReloadKey((current) => current + 1);
    } catch (caught) {
      setConfirming(null);
      setError(
        caught instanceof Error
          ? caught.message
          : "Không thể cập nhật dịch vụ.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <OrganizationPageLayout
      organizationId={scope.organizationId}
      heroKicker="Danh mục dịch vụ"
      heroTitle={organizationName}
      heroDescription="Chuẩn hóa danh mục dịch vụ dùng chung. Giá và thời lượng riêng của từng chi nhánh được cấu hình ở trang Cấu hình chi nhánh."
      heroAside={
        <button
          type="button"
          className="organization-hero-button"
          onClick={openCreate}
        >
          Thêm dịch vụ
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

      <p className="organization-hint">
        Giá và thời lượng riêng theo chi nhánh được cấu hình tại trang Cấu hình
        chi nhánh. Trang này chỉ quản lý danh mục dịch vụ dùng chung của tổ
        chức.
      </p>

      <section
        className="branch-management-schedule organization-report-section"
        aria-labelledby="organization-services-title"
      >
        <header>
          <div>
            <span className="branch-report-eyebrow">DANH MỤC DỊCH VỤ</span>
            <h2 id="organization-services-title">Dịch vụ của tổ chức</h2>
          </div>
          <small>
            {services.filter((service) => service.is_active).length} đang hoạt
            động
          </small>
        </header>

        <div className={styles.toolbar}>
          <label>
            Tìm dịch vụ
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tên, mã hoặc mô tả"
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
            {filteredServices.length}/{services.length} dịch vụ
          </small>
        </div>

        {loading ? (
          <p role="status">Đang tải dịch vụ...</p>
        ) : (
          <DataTable
            rows={filteredServices}
            rowKey={(service) => service.id_service}
            empty={
              <EmptyState
                title={
                  services.length
                    ? "Không có dịch vụ phù hợp"
                    : "Tổ chức chưa có dịch vụ"
                }
                description={
                  services.length
                    ? "Hãy thử đổi từ khóa hoặc trạng thái lọc."
                    : "Thêm dịch vụ đầu tiên để chuẩn hóa danh mục."
                }
              />
            }
            columns={[
              {
                key: "service",
                header: "Dịch vụ",
                cell: (service) => (
                  <div className={styles.serviceCell}>
                    <strong>{service.name}</strong>
                    <small>
                      {service.code}
                      {service.description ? ` · ${service.description}` : ""}
                    </small>
                  </div>
                ),
              },
              {
                key: "duration",
                header: "Thời lượng",
                cell: (service) => (
                  <div className={styles.serviceCell}>
                    <strong>{service.standard_duration_minutes} phút</strong>
                    <small>
                      {service.buffer_minutes > 0
                        ? `Đệm ${service.buffer_minutes} phút`
                        : "Không có thời gian đệm"}
                    </small>
                  </div>
                ),
              },
              {
                key: "price",
                header: "Giá chuẩn",
                cell: (service) => formatVnd(service.standard_price),
              },
              {
                key: "status",
                header: "Trạng thái",
                cell: (service) => (
                  <StatusBadge tone={service.is_active ? "success" : "neutral"}>
                    {service.is_active ? "Đang hoạt động" : "Đã ngưng"}
                  </StatusBadge>
                ),
              },
              {
                key: "actions",
                header: "Thao tác",
                className: styles.actionsCell,
                cell: (service) => (
                  <div className="organization-row-actions">
                    <button type="button" onClick={() => setComparing(service)}>
                      So sánh giá
                    </button>
                    <button type="button" onClick={() => openEdit(service)}>
                      Sửa
                    </button>
                    <button
                      type="button"
                      className={service.is_active ? "is-danger" : undefined}
                      disabled={busy}
                      onClick={() => setConfirming(service)}
                    >
                      {service.is_active ? "Ngưng" : "Kích hoạt"}
                    </button>
                  </div>
                ),
              },
            ]}
          />
        )}
      </section>

      {modalOpen && (
        <OrganizationServiceModal
          service={editingService}
          form={form}
          busy={busy}
          error={formError}
          onChange={(changes) =>
            setForm((current) => ({ ...current, ...changes }))
          }
          onClose={() => {
            if (!busy) {
              setModalOpen(false);
              setEditingService(null);
              setModalOrganizationId(null);
            }
          }}
          onSubmit={() => void submitService()}
        />
      )}

      {confirming && (
        <ConfirmationModal
          title={
            confirming.is_active
              ? "Ngưng hoạt động dịch vụ"
              : "Kích hoạt dịch vụ"
          }
          description={
            confirming.is_active
              ? `Ngưng dịch vụ ${confirming.name}? Nếu dịch vụ còn lịch hẹn tương lai, hệ thống sẽ từ chối thao tác.`
              : `Kích hoạt ${confirming.name} để dịch vụ có thể được cấu hình và nhận lịch mới.`
          }
          confirmLabel={
            confirming.is_active ? "Ngưng dịch vụ" : "Kích hoạt dịch vụ"
          }
          danger={confirming.is_active}
          busy={busy}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void toggleActive(confirming)}
        />
      )}

      {comparing && (
        <AdminModal
          open
          placement="end"
          className="organization-audit-drawer organization-service-comparison"
          title={`Giá dịch vụ: ${comparing.name}`}
          description={`Giá chuẩn toàn chuỗi: ${formatVnd(comparing.standard_price)} · ${comparing.standard_duration_minutes} phút`}
          onClose={() => setComparing(null)}
        >
          {comparisonError && (
            <div className="app-error" role="alert">
              {comparisonError}
            </div>
          )}
          {comparisonLoading ? (
            <p role="status">Đang tải cấu hình ở các chi nhánh...</p>
          ) : (
            <DataTable
              rows={comparisonBranches}
              rowKey={(branch) => branch.id_branch}
              empty={<EmptyState title="Chưa có chi nhánh hoạt động" />}
              columns={[
                {
                  key: "branch",
                  header: "Chi nhánh",
                  cell: (branch) => (
                    <div className={styles.serviceCell}>
                      <strong>{branch.name}</strong>
                      <small>
                        {branch.code} · {branch.address_line}
                      </small>
                    </div>
                  ),
                },
                {
                  key: "price",
                  header: "Giá áp dụng",
                  cell: (branch) => {
                    const service = branchServiceMap[branch.id_branch];
                    return comparisonFailedBranchIds.includes(branch.id_branch)
                      ? "Không tải được"
                      : service
                        ? formatVnd(service.price)
                        : "Chưa cấu hình";
                  },
                },
                {
                  key: "time",
                  header: "Thời lượng",
                  cell: (branch) => {
                    const service = branchServiceMap[branch.id_branch];
                    return comparisonFailedBranchIds.includes(branch.id_branch)
                      ? "—"
                      : service
                        ? `${service.duration_minutes ?? comparing.standard_duration_minutes} phút${service.buffer_minutes ? ` · đệm ${service.buffer_minutes} phút` : ""}`
                        : "—";
                  },
                },
                {
                  key: "status",
                  header: "Trạng thái",
                  cell: (branch) => {
                    const service = branchServiceMap[branch.id_branch];
                    return comparisonFailedBranchIds.includes(
                      branch.id_branch,
                    ) ? (
                      <StatusBadge tone="danger">Lỗi tải</StatusBadge>
                    ) : service ? (
                      <StatusBadge
                        tone={service.is_active ? "success" : "neutral"}
                      >
                        {service.is_active ? "Đang cung cấp" : "Đã ngưng"}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="warning">Chưa thêm</StatusBadge>
                    );
                  },
                },
                {
                  key: "open",
                  header: "",
                  cell: (branch) => (
                    <a
                      className="organization-inline-link"
                      href={`/quan-ly-chi-nhanh/cau-hinh?chi-nhanh=${branch.id_branch}`}
                    >
                      Cấu hình
                    </a>
                  ),
                },
              ]}
            />
          )}
          <p className="organization-hint">
            Giá chuẩn là mức tham khảo của tổ chức. Giá hiển thị là cấu hình
            thực tế tại từng chi nhánh.
          </p>
        </AdminModal>
      )}
    </OrganizationPageLayout>
  );
}
