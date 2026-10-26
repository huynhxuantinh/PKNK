import { useEffect, useState } from 'react'

import {
  listOrganizationAuditEvents,
  listOrganizationBranches,
  type AuditEvent,
  type AuditEventPage,
  type AuditEventFilters,
  type OrganizationBranch,
} from '../api/organization'
import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'
import {
  auditAccessTypeLabel,
  commonAuditActions,
  formatAuditTimestamp,
  safeAuditJson,
} from '../features/organization/organizationAudit'

interface FilterDraft {
  branchId: string
  action: string
  accessType: '' | 'READ' | 'WRITE'
}

const emptyDraft: FilterDraft = { branchId: '', action: '', accessType: '' }

export function OrganizationAuditPage() {
  const scope = useOrganizationScope()
  const [branches, setBranches] = useState<OrganizationBranch[]>([])
  const [draft, setDraft] = useState<FilterDraft>(emptyDraft)
  const [applied, setApplied] = useState<FilterDraft>(emptyDraft)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<AuditEventPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Quản trị tổ chức'

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    listOrganizationBranches(scope.organizationId, controller.signal)
      .then((response) => setBranches(response.data))
      .catch(() => {
        if (!controller.signal.aborted) setBranches([])
      })
    return () => controller.abort()
  }, [scope.organizationId])

  useEffect(() => {
    if (!scope.organizationId) return
    const controller = new AbortController()
    const filters: AuditEventFilters = {
      page,
      branch_id: applied.branchId ? Number(applied.branchId) : undefined,
      action: applied.action.trim() || undefined,
      access_type: applied.accessType || undefined,
    }
    setLoading(true)
    setError('')
    listOrganizationAuditEvents(scope.organizationId, filters, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return
        setData(response)
        setExpandedId(null)
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setData(null)
        setError(caught instanceof Error ? caught.message : 'Không thể tải nhật ký hoạt động.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [scope.organizationId, page, applied])

  function applyFilters() {
    setPage(1)
    setApplied({ ...draft })
  }

  function clearFilters() {
    setDraft(emptyDraft)
    setApplied(emptyDraft)
    setPage(1)
  }

  function branchName(branchId: number | null) {
    if (!branchId) return 'Toàn tổ chức'
    return branches.find((branch) => branch.id_branch === branchId)?.name
      || `Chi nhánh #${branchId}`
  }

  const items = data?.results || []
  const totalPages = data ? Math.max(1, Math.ceil(data.count / 20)) : 1

  return (
    <OrganizationPageLayout
      title="Nhật ký hoạt động"
      path="/quan-ly-to-chuc/nhat-ky"
      active="audit"
      organizationId={scope.organizationId}
      options={scope.options}
      onSelectOrganization={scope.selectOrganization}
      heroKicker="Truy vết thao tác"
      heroTitle={organizationName}
      heroDescription="Tra cứu các thao tác đọc và thay đổi dữ liệu trong tổ chức. Danh sách không tự động làm mới."
      heroAside={
        data ? <span className="organization-hero-stat">{data.count} sự kiện</span> : undefined
      }
    >
      {error && <div className="dentist-error" role="alert">{error}</div>}

      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-audit-filters-title">
        <header>
          <div>
            <span className="branch-report-eyebrow">BỘ LỌC</span>
            <h2 id="organization-audit-filters-title">Tìm sự kiện</h2>
          </div>
          <small>Bấm “Áp dụng” để tải lại danh sách</small>
        </header>

        <form
          className="organization-filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            applyFilters()
          }}
        >
          <label>
            Chi nhánh
            <select
              value={draft.branchId}
              onChange={(event) => setDraft((current) => ({ ...current, branchId: event.target.value }))}
            >
              <option value="">Toàn tổ chức</option>
              {branches.map((branch) => (
                <option key={branch.id_branch} value={branch.id_branch}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hành động
            <input
              list="organization-audit-actions"
              placeholder="Ví dụ: BRANCH_UPDATED"
              value={draft.action}
              onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
            />
            <datalist id="organization-audit-actions">
              {commonAuditActions.map((action) => (
                <option key={action} value={action} />
              ))}
            </datalist>
          </label>
          <label>
            Loại truy cập
            <select
              value={draft.accessType}
              onChange={(event) => setDraft((current) => ({
                ...current,
                accessType: event.target.value as FilterDraft['accessType'],
              }))}
            >
              <option value="">Tất cả</option>
              <option value="READ">Đọc</option>
              <option value="WRITE">Thay đổi</option>
            </select>
          </label>
          <div className="organization-filter-actions">
            <button type="button" className="button-secondary" onClick={clearFilters}>
              Xóa lọc
            </button>
            <button type="submit" disabled={loading}>
              {loading ? 'Đang tải...' : 'Áp dụng'}
            </button>
          </div>
        </form>
      </section>

      <section className="branch-management-schedule organization-report-section" aria-labelledby="organization-audit-table-title">
        <header>
          <div>
            <span className="branch-report-eyebrow">SỰ KIỆN</span>
            <h2 id="organization-audit-table-title">Nhật ký tổ chức</h2>
          </div>
          <small>
            {data ? `Trang ${page} / ${totalPages}` : 'Chưa có dữ liệu'}
          </small>
        </header>

        {loading ? (
          <p role="status">Đang tải nhật ký...</p>
        ) : items.length > 0 ? (
          <div className="branch-report-table-wrap">
            <table className="branch-report-table organization-report-table organization-audit-table">
              <thead>
                <tr>
                  <th>Thời điểm</th>
                  <th>Người thực hiện</th>
                  <th>Hành động</th>
                  <th>Tài nguyên</th>
                  <th>Chi nhánh</th>
                  <th>Loại</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((event) => (
                  <AuditRow
                    key={event.id_audit_event}
                    event={event}
                    branchName={branchName(event.branch_id)}
                    expanded={expandedId === event.id_audit_event}
                    onToggle={() => setExpandedId(
                      expandedId === event.id_audit_event ? null : event.id_audit_event,
                    )}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="branch-report-empty">Không có sự kiện phù hợp với bộ lọc.</p>
        )}

        <div className="organization-pagination">
          <button
            type="button"
            disabled={loading || !data?.previous}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Trang trước
          </button>
          <span>Trang {page} / {totalPages}</span>
          <button
            type="button"
            disabled={loading || !data?.next}
            onClick={() => setPage((current) => current + 1)}
          >
            Trang sau
          </button>
        </div>
      </section>
    </OrganizationPageLayout>
  )
}

function AuditRow({
  event,
  branchName,
  expanded,
  onToggle,
}: {
  event: AuditEvent
  branchName: string
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr>
        <td>{formatAuditTimestamp(event.created_at)}</td>
        <td>{event.actor_email || 'Hệ thống'}</td>
        <td>
          <strong>{event.action}</strong>
        </td>
        <td>
          {event.resource_type}
          <small>{event.resource_id || '—'}</small>
        </td>
        <td>{branchName}</td>
        <td>
          <span className={`organization-status ${event.access_type === 'WRITE' ? 'is-warning' : 'is-active'}`}>
            {auditAccessTypeLabel(event.access_type)}
          </span>
        </td>
        <td>
          <button type="button" className="organization-inline-link" onClick={onToggle}>
            {expanded ? 'Thu gọn' : 'Chi tiết'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="organization-audit-detail-row">
          <td colSpan={7}>
            <div className="organization-audit-detail">
              <dl>
                <div><dt>IP</dt><dd>{event.ip_address || '—'}</dd></div>
                <div><dt>Request ID</dt><dd>{event.request_id || '—'}</dd></div>
                <div><dt>Thời điểm gốc</dt><dd>{event.created_at}</dd></div>
              </dl>
              <div className="organization-audit-json">
                <div>
                  <span>Trước thay đổi</span>
                  <pre>{safeAuditJson(event.before_data)}</pre>
                </div>
                <div>
                  <span>Sau thay đổi</span>
                  <pre>{safeAuditJson(event.after_data)}</pre>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
