import { useEffect, useMemo, useRef, useState } from 'react'

import { replaceClinicalPerformedServices } from '../../api/dentist'
import type {
  BranchService,
  ClinicalEncounter,
  ClinicalPerformedService,
  ClinicalPerformedServiceInput,
} from '../../types/api'

type EditableService = ClinicalPerformedServiceInput & { key: string }

type Props = {
  encounter: ClinicalEncounter
  branchServices: BranchService[]
  disabled: boolean
  onSaved: (result: { confirmed: boolean; updated_at: string; items: ClinicalPerformedService[] }) => void
  onDirtyChange: (dirty: boolean) => void
}

const money = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })

function toEditable(item: ClinicalPerformedService): EditableService {
  return {
    key: String(item.id_clinical_performed_service),
    branch_service_id: item.branch_service_id,
    quantity: item.quantity,
    tooth_reference: item.tooth_reference,
    clinical_note: item.clinical_note,
  }
}

function areEqual(left: EditableService[], right: EditableService[]) {
  return left.length === right.length && left.every((item, index) => {
    const other = right[index]
    return item.branch_service_id === other.branch_service_id
      && item.quantity === other.quantity
      && item.tooth_reference === other.tooth_reference
      && item.clinical_note === other.clinical_note
  })
}

export function PerformedServicesPanel({ encounter, branchServices, disabled, onSaved, onDirtyChange }: Props) {
  const [items, setItems] = useState<EditableService[]>(() => encounter.performed_services.map(toEditable))
  const [initialItems, setInitialItems] = useState<EditableService[]>(() => encounter.performed_services.map(toEditable))
  const [confirmed, setConfirmed] = useState(encounter.performed_services_confirmed)
  const [initialConfirmed, setInitialConfirmed] = useState(encounter.performed_services_confirmed)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const synchronizedEncounterId = useRef<number | null>(null)
  const servicesById = useMemo(() => new Map(branchServices.map((service) => [service.id_branch_service, service])), [branchServices])

  useEffect(() => {
    if (synchronizedEncounterId.current === encounter.id_clinical_encounter) return
    synchronizedEncounterId.current = encounter.id_clinical_encounter
    const nextItems = encounter.performed_services.map(toEditable)
    setItems(nextItems)
    setInitialItems(nextItems)
    setConfirmed(encounter.performed_services_confirmed)
    setInitialConfirmed(encounter.performed_services_confirmed)
    setError('')
  // Lưu nháp nội dung bệnh án cũng thay đổi updated_at. Chỉ đồng bộ lại khi
  // chuyển sang một lượt khám khác; nếu không, các dịch vụ nha sĩ đang nhập
  // nhưng chưa xác nhận sẽ bị ghi đè bằng dữ liệu cũ từ server.
  }, [encounter.id_clinical_encounter, encounter.performed_services, encounter.performed_services_confirmed])

  const dirty = !areEqual(items, initialItems) || confirmed !== initialConfirmed

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  function updateItem(key: string, changes: Partial<EditableService>) {
    setItems((current) => current.map((item) => item.key === key ? { ...item, ...changes } : item))
    setConfirmed(false)
  }

  function addItem() {
    const firstService = branchServices[0]
    if (!firstService) {
      setError('Chi nhánh chưa có dịch vụ đang hoạt động để ghi nhận.')
      return
    }
    setItems((current) => [...current, {
      key: crypto.randomUUID(),
      branch_service_id: firstService.id_branch_service,
      quantity: 1,
      tooth_reference: '',
      clinical_note: '',
    }])
    setConfirmed(false)
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key))
    setConfirmed(false)
  }

  async function save() {
    if (!confirmed) {
      setError(items.length
        ? 'Hãy xác nhận danh sách dịch vụ đã thực hiện trước khi lưu.'
        : 'Hãy xác nhận không thực hiện thủ thuật trong lượt khám này.')
      return
    }
    if (items.some((item) => !servicesById.has(item.branch_service_id) || item.quantity < 1)) {
      setError('Kiểm tra lại dịch vụ và số lượng trước khi lưu.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const response = await replaceClinicalPerformedServices(encounter.id_clinical_encounter, {
        confirmed: true,
        items: items.map((item) => ({
          branch_service_id: item.branch_service_id,
          quantity: item.quantity,
          tooth_reference: item.tooth_reference,
          clinical_note: item.clinical_note,
        })),
      })
      const savedItems = response.data.items.map(toEditable)
      setItems(savedItems)
      setInitialItems(savedItems)
      setConfirmed(response.data.confirmed)
      setInitialConfirmed(response.data.confirmed)
      onSaved(response.data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu dịch vụ đã thực hiện.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="performed-services" aria-labelledby="performed-services-title">
      <header>
        <div>
          <p className="eyebrow">Dịch vụ thực tế</p>
          <div className="performed-services-title-row">
            <h2 id="performed-services-title">Dịch vụ đã thực hiện</h2>
            <span className={encounter.performed_services_confirmed ? 'is-confirmed' : ''}>
              {encounter.performed_services_confirmed ? 'Đã xác nhận' : 'Chưa xác nhận'}
            </span>
          </div>
          <p>Chỉ ghi các thủ thuật đã làm hôm nay. Kế hoạch điều trị lần sau được quản lý riêng.</p>
        </div>
      </header>

      {disabled ? (
        encounter.performed_services.length === 0 ? (
          <div className="performed-services-empty">Chưa ghi nhận thủ thuật nào trong lượt khám này.</div>
        ) : (
          <div className="performed-services-list performed-services-list-readonly">
            {encounter.performed_services.map((item, index) => (
              <article key={item.id_clinical_performed_service}>
                <div className="performed-service-number">{String(index + 1).padStart(2, '0')}</div>
                <div className="performed-service-snapshot">
                  <strong>{item.service_name_snapshot}</strong>
                  <span>{money.format(Number(item.unit_price_snapshot))}</span>
                </div>
                <dl>
                  <div>
                    <dt>Số lượng</dt>
                    <dd>{item.quantity}</dd>
                  </div>
                  <div>
                    <dt>Răng / vùng điều trị</dt>
                    <dd>{item.tooth_reference || 'Không ghi nhận'}</dd>
                  </div>
                  <div>
                    <dt>Ghi chú chuyên môn</dt>
                    <dd>{item.clinical_note || 'Không ghi nhận'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <div className="performed-services-empty">Chưa ghi nhận thủ thuật nào trong lượt khám này.</div>
      ) : (
        <div className="performed-services-list">
          {items.map((item, index) => {
            const selected = servicesById.get(item.branch_service_id)
            return (
              <article key={item.key}>
                <div className="performed-service-number">{String(index + 1).padStart(2, '0')}</div>
                <label>Dịch vụ
                  <select
                    value={item.branch_service_id}
                    disabled={disabled || saving}
                    onChange={(event) => updateItem(item.key, { branch_service_id: Number(event.target.value) })}
                  >
                    {!selected && <option value={item.branch_service_id}>Dịch vụ không còn hoạt động</option>}
                    {branchServices.map((service) => (
                      <option key={service.id_branch_service} value={service.id_branch_service}>{service.name}</option>
                    ))}
                  </select>
                  {selected && <small>{money.format(Number(selected.price))}</small>}
                </label>
                <label>Số lượng
                  <input type="number" min="1" step="1" value={item.quantity} disabled={disabled || saving} onChange={(event) => updateItem(item.key, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
                </label>
                <label>Số răng / vùng điều trị
                  <input value={item.tooth_reference || ''} disabled={disabled || saving} onChange={(event) => updateItem(item.key, { tooth_reference: event.target.value })} placeholder="Ví dụ: răng 16" />
                </label>
                <label>Ghi chú chuyên môn
                  <input value={item.clinical_note || ''} disabled={disabled || saving} onChange={(event) => updateItem(item.key, { clinical_note: event.target.value })} placeholder="Nội dung đã thực hiện" />
                </label>
                {!disabled && <button type="button" className="performed-service-remove" disabled={saving} onClick={() => removeItem(item.key)}>Bỏ</button>}
              </article>
            )
          })}
        </div>
      )}

      {!disabled && <>
        <div className="performed-services-actions">
          <button type="button" className="performed-service-add" disabled={saving || branchServices.length === 0} onClick={addItem}>+ Thêm dịch vụ</button>
          <label className="performed-services-confirmation">
            <input type="checkbox" checked={confirmed} disabled={saving} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>{items.length ? 'Tôi xác nhận các dịch vụ trên đã thực hiện.' : 'Tôi xác nhận không thực hiện thủ thuật trong lượt khám này.'}</span>
          </label>
          <button type="button" className="performed-services-save" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Đang lưu...' : 'Xác nhận dịch vụ'}</button>
        </div>
        {error && <p className="performed-services-error" role="alert">{error}</p>}
      </>}
    </section>
  )
}
