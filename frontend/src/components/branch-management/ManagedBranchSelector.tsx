import { useEffect, useState, type FormEvent } from 'react'

import type { ManagedBranch } from '../../api/management'

interface ManagedBranchSelectorProps {
  branches: ManagedBranch[]
  loading: boolean
  error: string
  onSelect: (branchId: number) => void
}

export function ManagedBranchSelector({
  branches,
  loading,
  error,
  onSelect,
}: ManagedBranchSelectorProps) {
  const activeBranches = branches.filter((branch) => branch.is_active)
  const [selectedId, setSelectedId] = useState(
    activeBranches[0] ? String(activeBranches[0].id_branch) : '',
  )

  useEffect(() => {
    if (!activeBranches.some((branch) => String(branch.id_branch) === selectedId)) {
      setSelectedId(activeBranches[0] ? String(activeBranches[0].id_branch) : '')
    }
  }, [activeBranches, selectedId])

  function submit(event: FormEvent) {
    event.preventDefault()
    const branchId = Number(selectedId)
    if (branchId) onSelect(branchId)
  }

  return (
    <section className="managed-branch-selector" aria-labelledby="branch-selector-title">
      <span className="managed-branch-selector-kicker">PHẠM VI LÀM VIỆC</span>
      <h1 id="branch-selector-title">Chọn chi nhánh làm việc</h1>
      <p>Chọn chi nhánh để xem ca làm hoặc báo cáo tương ứng.</p>

      {error && <div className="dentist-error" role="alert">{error}</div>}
      {loading ? (
        <p role="status">Đang tải danh sách chi nhánh...</p>
      ) : activeBranches.length > 0 ? (
        <form onSubmit={submit}>
          <label htmlFor="managed-branch-select">Chi nhánh</label>
          <div>
            <select
              id="managed-branch-select"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {activeBranches.map((branch) => (
                <option key={branch.id_branch} value={branch.id_branch}>
                  {branch.name}
                </option>
              ))}
            </select>
            <button type="submit">Tiếp tục</button>
          </div>
        </form>
      ) : (
        <p role="status">Tài khoản chưa được phân công chi nhánh hoạt động.</p>
      )}
    </section>
  )
}
