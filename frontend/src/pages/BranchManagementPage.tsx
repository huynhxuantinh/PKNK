import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
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
} from '../api/management'
import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { canAccessArea } from '../auth/roles'
import {
  AppointmentList,
  ManagementErrorBanner,
} from '../components/branch-management/AppointmentList'
import { CancelAppointmentModal } from '../components/branch-management/CancelAppointmentModal'
import { ManagementSectionNav } from '../components/branch-management/ManagementSectionNav'
import { RescheduleAppointmentModal } from '../components/branch-management/RescheduleAppointmentModal'
import {
  appointmentStatusLabels,
  hcmDate,
} from '../components/branch-management/appointmentPresentation'
import { resolveManagedBranchId } from '../components/branch-management/managedBranchSelection'
import { Seo } from '../seo/Seo'
import type { BranchDetail, Slot } from '../types/api'

type AppointmentAction = 'confirm' | 'check-in' | 'no-show'

export function BranchManagementPage() {
  const { isAuthenticated, user } = useAuth()
  const [params, setParams] = useSearchParams()

  const directBranches = useMemo<ManagedBranch[]>(
    () =>
      (user?.memberships || [])
        .filter(
          (membership) =>
            membership.is_active &&
            membership.role === 'BRANCH_ADMIN' &&
            membership.branch_id,
        )
        .map((membership) => ({
          id_branch: membership.branch_id as number,
          name: membership.branch_name || `Chi nhánh #${membership.branch_id}`,
          is_active: true,
        })),
    [user],
  )
  const organizationIds = useMemo(
    () => [
      ...new Set(
        (user?.memberships || [])
          .filter(
            (membership) =>
              membership.is_active && membership.role === 'ORGANIZATION_ADMIN',
          )
          .map((membership) => membership.organization_id),
      ),
    ],
    [user],
  )

  const [branches, setBranches] = useState<ManagedBranch[]>(directBranches)
  const [loaded, setLoaded] = useState(organizationIds.length === 0)
  const [branch, setBranch] = useState<BranchDetail | null>(null)
  const [date, setDate] = useState(() => hcmDate(new Date()))
  const [days, setDays] = useState<1 | 7>(1)
  const [dentistId, setDentistId] = useState<number>()
  const [status, setStatus] = useState<ManagementAppointmentStatus | ''>('')
  const [items, setItems] = useState<ManagementAppointment[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [cancelling, setCancelling] = useState<ManagementAppointment | null>(null)
  const [moving, setMoving] = useState<ManagementAppointment | null>(null)

  const activeBranches = branches.filter((item) => item.is_active)
  const branchIds = activeBranches.map((item) => item.id_branch)
  const requestedBranchId = Number(params.get('chi-nhanh')) || null
  const branchId = resolveManagedBranchId(requestedBranchId, branches, loaded)
  const isManager = canAccessArea(user, 'MANAGEMENT')

  useEffect(() => {
    let active = true
    setLoaded(organizationIds.length === 0)

    Promise.all(organizationIds.map(listManagedOrganizationBranches))
      .then((results) => {
        if (!active) return
        const allBranches = [
          ...directBranches,
          ...results.flatMap((result) => result.data),
        ]
        setBranches([
          ...new Map(allBranches.map((item) => [item.id_branch, item])).values(),
        ])
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error ? caughtError.message : 'Không thể tải chi nhánh.',
          )
        }
      })
      .finally(() => {
        if (active) setLoaded(true)
      })

    return () => {
      active = false
    }
  }, [directBranches, organizationIds])

  useEffect(() => {
    if (branchId && requestedBranchId !== branchId) {
      setParams({ 'chi-nhanh': String(branchId) }, { replace: true })
    }
  }, [branchId, requestedBranchId, setParams])

  useEffect(() => {
    if (!branchId) return
    getBranchDetail(branchId)
      .then((response) => setBranch(response.data))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Không thể tải chi nhánh.'),
      )
  }, [branchId])

  useEffect(() => {
    if (!branchId) return
    setItems(null)
    setError('')
    listBranchAppointments(branchId, date, status || undefined, dentistId, days)
      .then((response) => setItems(response.data))
      .catch((caughtError) =>
        setError(caughtError instanceof Error ? caughtError.message : 'Không thể tải lịch hẹn.'),
      )
  }, [branchId, date, days, dentistId, status])

  function replaceAppointment(next: ManagementAppointment) {
    setItems(
      (current) =>
        current?.map((item) =>
          item.public_code === next.public_code ? next : item,
        ) || null,
    )
  }

  async function updateAppointment(item: ManagementAppointment, action: AppointmentAction) {
    setBusy(item.public_code)
    setError('')
    try {
      const response =
        action === 'confirm'
          ? await confirmManagedAppointment(item.public_code)
          : action === 'check-in'
            ? await checkInManagedAppointment(item.public_code)
            : await markManagedAppointmentNoShow(item.public_code)
      replaceAppointment(response.data)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Không thể cập nhật lịch.')
    } finally {
      setBusy('')
    }
  }

  async function cancelAppointment(reason: string) {
    if (!cancelling) return
    setBusy(cancelling.public_code)
    try {
      const response = await cancelManagedAppointment(cancelling.public_code, reason)
      replaceAppointment(response.data)
      setCancelling(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Không thể hủy lịch.')
    } finally {
      setBusy('')
    }
  }

  async function findRescheduleSlots(moveDate: string, moveDentistId?: number) {
    if (!moving) return []
    try {
      const response = await listManagedRescheduleSlots(
        moving.public_code,
        moveDate,
        moveDentistId,
      )
      return response.data
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Không thể tải giờ trống.')
      return []
    }
  }

  async function moveAppointment(
    slot: Slot,
    reason: string,
    moveDentistId: number | undefined,
    idempotencyKey: string,
  ) {
    if (!moving) return
    setBusy(moving.public_code)
    try {
      const response = await rescheduleManagedAppointment(moving.public_code, {
        starts_at: slot.starts_at,
        reason,
        dentist_id: moveDentistId,
        idempotency_key: idempotencyKey,
      })
      setItems((current) =>
        current
          ? [
              ...current.map((item) =>
                item.public_code === moving.public_code
                  ? { ...item, status: 'CANCELLED' as const }
                  : item,
              ),
              response.data,
            ]
          : current,
      )
      setMoving(null)
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Không thể đổi lịch.')
    } finally {
      setBusy('')
    }
  }

  if (!isAuthenticated) {
    return <Navigate to="/dang-nhap?returnTo=%2Fquan-ly-chi-nhanh" replace />
  }
  if (!isManager || (loaded && !branchId)) return <Navigate to="/" replace />

  return (
    <div className="branch-management-page">
      <Seo
        title="Quản lý chi nhánh | DentaVie"
        description="Khu vực vận hành chi nhánh DentaVie."
        path="/quan-ly-chi-nhanh"
        noIndex
      />
      <header className="dentist-header">
        <Link className="brand" to="/">
          <img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" />
        </Link>
        <div className="dentist-header-context">
          <span>Khu vực vận hành</span>
          <strong>Quản lý chi nhánh</strong>
        </div>
        <AuthBar />
      </header>

      <main className="branch-management-main">
        <section className="branch-management-hero">
          <div>
            <p className="eyebrow">Vận hành hằng ngày</p>
            <h1>{branch?.name || 'Quản lý chi nhánh'}</h1>
            <p>{branch?.full_address || 'Đang tải...'}</p>
          </div>
          {branchIds.length > 1 && (
            <label>
              Chi nhánh
              <select
                value={branchId || ''}
                onChange={(event) => setParams({ 'chi-nhanh': event.target.value })}
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

        {branchId && <ManagementSectionNav branchId={branchId} active="appointments" />}

        {error && <ManagementErrorBanner message={error} />}

        <section className="branch-management-schedule">
          <header>
            <div>
              <p className="eyebrow">Lịch hẹn chi nhánh</p>
              <h2>Điều phối lịch khám</h2>
            </div>
          </header>

          <div className="branch-management-filters">
            <label>
              Ngày
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              Xem
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value) as 1 | 7)}
              >
                <option value={1}>Theo ngày</option>
                <option value={7}>Theo tuần</option>
              </select>
            </label>
            <label>
              Nha sĩ
              <select
                value={dentistId || ''}
                onChange={(event) =>
                  setDentistId(event.target.value ? Number(event.target.value) : undefined)
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
                  setStatus(event.target.value as ManagementAppointmentStatus | '')
                }
              >
                <option value="">Tất cả</option>
                {Object.entries(appointmentStatusLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <AppointmentList
            items={items}
            busyCode={busy}
            onAction={updateAppointment}
            onCancel={setCancelling}
            onReschedule={setMoving}
          />
        </section>
      </main>

      {cancelling && (
        <CancelAppointmentModal
          appointment={cancelling}
          busy={busy === cancelling.public_code}
          onClose={() => setCancelling(null)}
          onConfirm={cancelAppointment}
        />
      )}
      {moving && (
        <RescheduleAppointmentModal
          appointment={moving}
          dentists={branch?.dentists || []}
          busy={busy === moving.public_code}
          onClose={() => setMoving(null)}
          onFindSlots={findRescheduleSlots}
          onConfirm={moveAppointment}
        />
      )}
    </div>
  )
}
