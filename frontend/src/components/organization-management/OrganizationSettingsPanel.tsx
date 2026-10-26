import { useEffect, useState, type FormEvent } from 'react'

import {
  getOrganization,
  updateOrganization,
  type ManagedOrganization,
} from '../../api/organization'
import { ConfirmationModal } from '../ConfirmationModal'

interface OrganizationFormState {
  name: string
  timezone: string
  autoConfirm: boolean
  slotHoldMinutes: string
  cancellationCutoffMinutes: string
  noShowGraceMinutes: string
}

function toForm(organization: ManagedOrganization): OrganizationFormState {
  return {
    name: organization.name,
    timezone: organization.timezone,
    autoConfirm: organization.auto_confirm,
    slotHoldMinutes: String(organization.slot_hold_minutes),
    cancellationCutoffMinutes: String(organization.cancellation_cutoff_minutes),
    noShowGraceMinutes: String(organization.no_show_grace_minutes),
  }
}

export function OrganizationSettingsPanel({ organizationId }: { organizationId: number }) {
  const [organization, setOrganization] = useState<ManagedOrganization | null>(null)
  const [form, setForm] = useState<OrganizationFormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sensitiveConfirmOpen, setSensitiveConfirmOpen] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setNotice('')
    getOrganization(organizationId, controller.signal)
      .then((response) => {
        setOrganization(response.data)
        setForm(toForm(response.data))
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setError(caught instanceof Error ? caught.message : 'Không thể tải cài đặt tổ chức.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [organizationId])

  function update<K extends keyof OrganizationFormState>(
    key: K,
    value: OrganizationFormState[K],
  ) {
    setForm((current) => (current ? { ...current, [key]: value } : current))
  }

  function hasSensitiveChanges() {
    if (!organization || !form) return false
    return (
      form.timezone !== organization.timezone
      || Number(form.noShowGraceMinutes) !== organization.no_show_grace_minutes
    )
  }

  async function save() {
    if (!form || !organization) return
    const name = form.name.trim()
    if (!name) {
      setError('Tên tổ chức không được để trống.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await updateOrganization(organization.id_organization, {
        name,
        timezone: form.timezone,
        auto_confirm: form.autoConfirm,
        slot_hold_minutes: Number(form.slotHoldMinutes),
        cancellation_cutoff_minutes: Number(form.cancellationCutoffMinutes),
        no_show_grace_minutes: Number(form.noShowGraceMinutes),
      })
      setOrganization(response.data)
      setForm(toForm(response.data))
      setSensitiveConfirmOpen(false)
      setNotice('Đã lưu cài đặt tổ chức.')
    } catch (caught) {
      setSensitiveConfirmOpen(false)
      setError(caught instanceof Error ? caught.message : 'Không thể lưu cài đặt tổ chức.')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (hasSensitiveChanges()) {
      setSensitiveConfirmOpen(true)
      return
    }
    void save()
  }

  return (
    <section className="branch-management-schedule organization-settings" aria-labelledby="organization-settings-title">
      <header>
        <div>
          <span className="branch-report-eyebrow">CÀI ĐẶT TỔ CHỨC</span>
          <h2 id="organization-settings-title">Thông số vận hành</h2>
        </div>
        <small>Áp dụng cho toàn bộ chi nhánh</small>
      </header>

      {error && <div className="dentist-error" role="alert">{error}</div>}
      {notice && <div className="staff-schedule-notice" role="status">{notice}</div>}

      {loading ? (
        <p role="status">Đang tải cài đặt tổ chức...</p>
      ) : form && organization ? (
        <form className="organization-settings-form" onSubmit={submit}>
          <label>
            Tên tổ chức
            <input
              required
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
            />
          </label>
          <label>
            Múi giờ
            <input
              required
              value={form.timezone}
              onChange={(event) => update('timezone', event.target.value)}
            />
          </label>
          <label className="organization-checkbox">
            <input
              type="checkbox"
              checked={form.autoConfirm}
              onChange={(event) => update('autoConfirm', event.target.checked)}
            />
            Tự động xác nhận lịch hẹn
          </label>
          <label>
            Giữ chỗ (phút)
            <input
              required
              min="1"
              max="60"
              type="number"
              value={form.slotHoldMinutes}
              onChange={(event) => update('slotHoldMinutes', event.target.value)}
            />
          </label>
          <label>
            Hạn hủy trước (phút)
            <input
              required
              min="0"
              type="number"
              value={form.cancellationCutoffMinutes}
              onChange={(event) => update('cancellationCutoffMinutes', event.target.value)}
            />
          </label>
          <label>
            Ân hạn không đến (phút)
            <input
              required
              min="0"
              max="120"
              type="number"
              value={form.noShowGraceMinutes}
              onChange={(event) => update('noShowGraceMinutes', event.target.value)}
            />
          </label>
          <div className="organization-settings-actions">
            <p>
              Đổi múi giờ hoặc ân hạn không đến sẽ ảnh hưởng tới lịch hẹn và báo cáo.
            </p>
            <button type="submit" disabled={busy}>
              {busy ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
          </div>
        </form>
      ) : null}

      {sensitiveConfirmOpen && (
        <ConfirmationModal
          title="Xác nhận thay đổi ảnh hưởng vận hành"
          description="Bạn đang thay đổi múi giờ hoặc thời gian ân hạn không đến. Thay đổi này ảnh hưởng tới cách tính lịch hẹn và báo cáo hiện có. Tiếp tục lưu?"
          confirmLabel="Lưu thay đổi"
          busy={busy}
          onCancel={() => setSensitiveConfirmOpen(false)}
          onConfirm={() => void save()}
        />
      )}
    </section>
  )
}
