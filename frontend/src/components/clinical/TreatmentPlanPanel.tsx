import { useEffect, useState, type FormEvent } from 'react'

import {
  createTreatmentPlan,
  createTreatmentPlanItem,
  deleteTreatmentPlanItem,
  updateTreatmentPlan,
  updateTreatmentPlanItem,
} from '../../api/dentist'
import type {
  BranchService,
  TreatmentPlan,
  TreatmentPlanItem,
  TreatmentPlanItemStatus,
  TreatmentPlanStatus,
} from '../../types/api'
import { ConfirmationModal } from '../ConfirmationModal'

const statusLabels: Record<TreatmentPlanStatus, string> = {
  DRAFT: 'Bản nháp',
  ACTIVE: 'Đang điều trị',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

const itemStatusLabels: Record<TreatmentPlanItemStatus, string> = {
  PLANNED: 'Dự kiến',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
}

function recalculateLocalTotal(plan: TreatmentPlan, items: TreatmentPlanItem[]) {
  const total = items.reduce(
    (sum, item) =>
      item.status === 'CANCELLED' ? sum : sum + Number(item.planned_price),
    0,
  )
  return { ...plan, items, total_estimate: total.toFixed(2) }
}

interface TreatmentPlanCardProps {
  plan: TreatmentPlan
  services: BranchService[]
  onChange: (plan: TreatmentPlan) => void
  onDirtyChange: (key: string, dirty: boolean) => void
}

function TreatmentPlanCard({ plan, services, onChange, onDirtyChange }: TreatmentPlanCardProps) {
  const [title, setTitle] = useState(plan.title)
  const [description, setDescription] = useState(plan.description)
  const [serviceId, setServiceId] = useState(services[0]?.id_service.toString() ?? '')
  const [price, setPrice] = useState(services[0]?.price ?? '')
  const [sequence, setSequence] = useState(
    String(Math.max(0, ...plan.items.map((item) => item.sequence)) + 1),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmation, setConfirmation] = useState<
    | { type: 'cancel-plan' }
    | { type: 'complete-plan' }
    | { type: 'delete-item'; item: TreatmentPlanItem }
    | null
  >(null)
  const editable = plan.status === 'DRAFT' || plan.status === 'ACTIVE'

  useEffect(() => {
    onDirtyChange(`plan:${plan.id_treatment_plan}:details`, title !== plan.title || description !== plan.description)
  }, [description, onDirtyChange, plan.description, plan.id_treatment_plan, plan.title, title])

  useEffect(() => {
    if (!serviceId && services[0]) {
      setServiceId(String(services[0].id_service))
      setPrice(services[0].price)
    }
  }, [serviceId, services])

  useEffect(() => {
    setTitle(plan.title)
    setDescription(plan.description)
  }, [plan.description, plan.title])

  async function savePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await updateTreatmentPlan(plan.id_treatment_plan, {
        title: title.trim(),
        description: description.trim(),
      })
      onChange({ ...plan, ...response.data })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu kế hoạch.')
    } finally {
      setBusy(false)
    }
  }

  async function changeStatus(status: TreatmentPlanStatus) {
    setBusy(true)
    setError('')
    try {
      const response = await updateTreatmentPlan(plan.id_treatment_plan, { status })
      onChange({ ...plan, ...response.data })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể đổi trạng thái.')
    } finally {
      setBusy(false)
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!serviceId) return
    setBusy(true)
    setError('')
    try {
      const response = await createTreatmentPlanItem(plan.id_treatment_plan, {
        service_id: Number(serviceId),
        sequence: Number(sequence),
        planned_price: price,
        status: 'PLANNED',
      })
      onChange(
        recalculateLocalTotal(plan, [...plan.items, response.data]),
      )
      setSequence(String(Number(sequence) + 1))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể thêm dịch vụ.')
    } finally {
      setBusy(false)
    }
  }

  async function saveItem(item: TreatmentPlanItem, input: {
    sequence: number
    planned_price: string
    status: TreatmentPlanItemStatus
    note: string
  }) {
    setBusy(true)
    setError('')
    try {
      const response = await updateTreatmentPlanItem(item.id_treatment_plan_item, input)
      const items = plan.items.map((current) =>
        current.id_treatment_plan_item === item.id_treatment_plan_item
          ? response.data
          : current,
      )
      onChange(recalculateLocalTotal(plan, items))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể cập nhật dịch vụ.')
    } finally {
      setBusy(false)
    }
  }

  async function removeItem(item: TreatmentPlanItem) {
    setBusy(true)
    setError('')
    try {
      await deleteTreatmentPlanItem(item.id_treatment_plan_item)
      onDirtyChange(`plan:${plan.id_treatment_plan}:item:${item.id_treatment_plan_item}`, false)
      onChange(
        recalculateLocalTotal(
          plan,
          plan.items.filter(
            (current) =>
              current.id_treatment_plan_item !== item.id_treatment_plan_item,
          ),
        ),
      )
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể xóa dịch vụ.')
    } finally {
      setBusy(false)
    }
  }

  function updateSelectedService(value: string) {
    setServiceId(value)
    const selected = services.find((service) => service.id_service === Number(value))
    if (selected) setPrice(selected.price)
  }

  return (
    <article className="clinical-plan-card">
      <header className="clinical-plan-card__header">
        <div>
          <h3>{plan.title}</h3>
          <span>{statusLabels[plan.status]}</span>
        </div>
        <strong>
          {Number(plan.total_estimate).toLocaleString('vi-VN')} ₫
        </strong>
      </header>

      {error && <p className="app-error" role="alert">{error}</p>}

      {editable ? (
        <form className="clinical-plan-details" onSubmit={savePlan}>
          <label>
            Tiêu đề
            <input value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Mô tả
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !title.trim()}>Lưu thông tin</button>
        </form>
      ) : (
        plan.description && <p>{plan.description}</p>
      )}

      <div className="clinical-plan-items">
        <h4>Dịch vụ dự kiến</h4>
        {plan.items.length === 0 ? (
          <p>Chưa có dịch vụ trong kế hoạch.</p>
        ) : (
          plan.items.map((item) => (
            <TreatmentPlanItemEditor
              key={item.id_treatment_plan_item}
              item={item}
              disabled={!editable || busy}
              onDirtyChange={(dirty) => onDirtyChange(`plan:${plan.id_treatment_plan}:item:${item.id_treatment_plan_item}`, dirty)}
              onSave={(input) => void saveItem(item, input)}
              onDelete={() => setConfirmation({ type: 'delete-item', item })}
            />
          ))
        )}
      </div>

      {editable && services.length > 0 && (
        <form className="clinical-plan-add-item" onSubmit={addItem}>
          <label>
            Dịch vụ
            <select value={serviceId} required onChange={(event) => updateSelectedService(event.target.value)}>
              {services.map((service) => (
                <option key={service.id_service} value={service.id_service}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Thứ tự
            <input type="number" min={1} required value={sequence} onChange={(event) => setSequence(event.target.value)} />
          </label>
          <label>
            Giá dự kiến (₫)
            <input type="number" min={0} step={1000} required value={price} onChange={(event) => setPrice(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Thêm dịch vụ dự kiến</button>
        </form>
      )}

      <footer className="clinical-plan-actions">
        {plan.status === 'DRAFT' && (
          <>
            <button type="button" disabled={busy} onClick={() => void changeStatus('ACTIVE')}>Công bố kế hoạch</button>
            <button type="button" disabled={busy} onClick={() => setConfirmation({ type: 'cancel-plan' })}>Hủy kế hoạch</button>
          </>
        )}
        {plan.status === 'ACTIVE' && (
          <>
            <button type="button" disabled={busy} onClick={() => setConfirmation({ type: 'complete-plan' })}>Đánh dấu hoàn thành</button>
            <button type="button" disabled={busy} onClick={() => setConfirmation({ type: 'cancel-plan' })}>Hủy kế hoạch</button>
          </>
        )}
      </footer>
      {confirmation && (
        <ConfirmationModal
          title={confirmation.type === 'cancel-plan' ? 'Hủy kế hoạch điều trị?' : confirmation.type === 'complete-plan' ? 'Đánh dấu kế hoạch hoàn thành?' : 'Xóa mục điều trị?'}
          description={confirmation.type === 'cancel-plan' ? 'Kế hoạch sẽ chuyển sang trạng thái đã hủy theo quy tắc hiện tại.' : confirmation.type === 'complete-plan' ? 'Xác nhận kế hoạch điều trị này đã hoàn thành.' : `Mục “${confirmation.item.service_name}” sẽ bị xóa khỏi kế hoạch.`}
          confirmLabel={confirmation.type === 'cancel-plan' ? 'Hủy kế hoạch' : confirmation.type === 'complete-plan' ? 'Đánh dấu hoàn thành' : 'Xóa mục'}
          danger={confirmation.type !== 'complete-plan'}
          busy={busy}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const action = confirmation
            setConfirmation(null)
            if (action.type === 'cancel-plan') void changeStatus('CANCELLED')
            else if (action.type === 'complete-plan') void changeStatus('COMPLETED')
            else void removeItem(action.item)
          }}
        />
      )}
    </article>
  )
}

interface TreatmentPlanItemEditorProps {
  item: TreatmentPlanItem
  disabled: boolean
  onDirtyChange: (dirty: boolean) => void
  onSave: (input: {
    sequence: number
    planned_price: string
    status: TreatmentPlanItemStatus
    note: string
  }) => void
  onDelete: () => void
}

function TreatmentPlanItemEditor({
  item,
  disabled,
  onDirtyChange,
  onSave,
  onDelete,
}: TreatmentPlanItemEditorProps) {
  const [sequence, setSequence] = useState(String(item.sequence))
  const [price, setPrice] = useState(item.planned_price)
  const [status, setStatus] = useState<TreatmentPlanItemStatus>(item.status)
  const [note, setNote] = useState(item.note)
  const [confirmCompletion, setConfirmCompletion] = useState(false)

  useEffect(() => {
    setSequence(String(item.sequence))
    setPrice(item.planned_price)
    setStatus(item.status)
    setNote(item.note)
  }, [item.note, item.planned_price, item.sequence, item.status])

  useEffect(() => {
    onDirtyChange(Number(sequence) !== item.sequence || price !== item.planned_price || status !== item.status || note !== item.note)
  }, [item.note, item.planned_price, item.sequence, item.status, note, onDirtyChange, price, sequence, status])

  function save() {
    setConfirmCompletion(false)
    onSave({ sequence: Number(sequence), planned_price: price, status, note })
  }

  return (
    <form
      className="clinical-plan-item"
      onSubmit={(event) => {
        event.preventDefault()
        if (status === 'COMPLETED' && item.status !== 'COMPLETED') {
          setConfirmCompletion(true)
          return
        }
        save()
      }}
    >
      <strong>{item.service_name}</strong>
      <label>
        Thứ tự
        <input type="number" min={1} required disabled={disabled} value={sequence} onChange={(event) => setSequence(event.target.value)} />
      </label>
      <label>
        Giá dự kiến
        <input type="number" min={0} step={1000} required disabled={disabled} value={price} onChange={(event) => setPrice(event.target.value)} />
      </label>
      <label>
        Trạng thái
        <select disabled={disabled} value={status} onChange={(event) => setStatus(event.target.value as TreatmentPlanItemStatus)}>
          {Object.entries(itemStatusLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <label>
        Ghi chú
        <input disabled={disabled} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {!disabled && (
        <div>
          <button type="submit">Lưu mục</button>
          <button type="button" onClick={onDelete}>Xóa mục</button>
        </div>
      )}
      {confirmCompletion && (
        <ConfirmationModal
          title="Đánh dấu mục điều trị hoàn thành?"
          description={`Xác nhận dịch vụ “${item.service_name}” đã hoàn thành.`}
          confirmLabel="Đánh dấu hoàn thành"
          onCancel={() => setConfirmCompletion(false)}
          onConfirm={save}
        />
      )}
    </form>
  )
}

interface TreatmentPlanPanelProps {
  encounterId: number
  plans: TreatmentPlan[]
  services: BranchService[]
  disabled?: boolean
  onChange: (plans: TreatmentPlan[]) => void
  onDirtyChange: (key: string, dirty: boolean) => void
}

export function TreatmentPlanPanel({
  encounterId,
  plans,
  services,
  disabled = false,
  onChange,
  onDirtyChange,
}: TreatmentPlanPanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onDirtyChange('treatment-plan:create', Boolean(title || description))
  }, [description, onDirtyChange, title])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await createTreatmentPlan(encounterId, {
        title: title.trim(),
        description: description.trim(),
      })
      onChange([...plans, response.data])
      setTitle('')
      setDescription('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể tạo kế hoạch.')
    } finally {
      setBusy(false)
    }
  }

  function replacePlan(updated: TreatmentPlan) {
    onChange(plans.map((plan) =>
      plan.id_treatment_plan === updated.id_treatment_plan ? updated : plan,
    ))
  }

  return (
    <section id="treatment-plans" className="examination-history clinical-workflow-panel">
      <header>
        <div>
          <p className="eyebrow">Điều trị tiếp theo</p>
          <h2>Kế hoạch điều trị</h2>
        </div>
        <span>{plans.length} kế hoạch</span>
      </header>
      {error && <p className="app-error" role="alert">{error}</p>}
      {plans.map((plan) => (
        <TreatmentPlanCard
          key={plan.id_treatment_plan}
          plan={plan}
          services={services}
          onChange={replacePlan}
          onDirtyChange={onDirtyChange}
        />
      ))}
      {plans.length === 0 && <p>Chưa có kế hoạch điều trị.</p>}
      {!disabled && (
        <form className="clinical-plan-create" onSubmit={submit}>
          <h3>Tạo kế hoạch từ bệnh án đã chốt</h3>
          <label>
            Tiêu đề
            <input value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            Mô tả
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <button type="submit" disabled={busy || !title.trim()}>
            {busy ? 'Đang lưu...' : 'Tạo kế hoạch'}
          </button>
        </form>
      )}
    </section>
  )
}
