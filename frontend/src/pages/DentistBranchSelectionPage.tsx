import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'

import { getBranchDetail } from '../api/booking'
import { AuthBar } from '../auth/AuthBar'
import { useAuth } from '../auth/AuthContext'
import { activeBranchIdsForRole, hasActiveRole } from '../auth/roles'
import { Seo } from '../seo/Seo'
import type { BranchDetail } from '../types/api'

export function DentistBranchSelectionPage() {
  const { isAuthenticated, user } = useAuth()
  const navigate = useNavigate()
  const [branches, setBranches] = useState<BranchDetail[] | null>(null)
  const [error, setError] = useState('')

  const branchIds = useMemo(
    () => activeBranchIdsForRole(user, 'DENTIST'),
    [user],
  )

  useEffect(() => {
    if (!isAuthenticated || branchIds.length === 0) return
    let active = true
    Promise.allSettled(branchIds.map((id) => getBranchDetail(id))).then((results) => {
      if (!active) return
      const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value.data] : [])
      setBranches(loaded)
      if (loaded.length !== branchIds.length) setError('Không thể tải đầy đủ thông tin chi nhánh.')
    })
    return () => { active = false }
  }, [branchIds, isAuthenticated])

  if (!isAuthenticated) return <Navigate to="/dang-nhap?returnTo=%2Fbac-si%2Fchon-chi-nhanh" replace />
  if (!hasActiveRole(user, ['DENTIST'])) return <Navigate to="/" replace />

  return (
    <div className="dentist-page dentist-branch-selection-page">
      <Seo title="Chọn chi nhánh làm việc | DentaVie" description="Chọn chi nhánh làm việc để vào khu vực nha sĩ." path="/bac-si/chon-chi-nhanh" noIndex />
      <header className="dentist-header">
        <Link className="brand" to="/" aria-label="Trang chủ DentaVie"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link>
        <div className="dentist-header-context"><span>Khu vực chuyên môn</span><strong>Nha sĩ</strong></div>
        <AuthBar />
      </header>
      <main className="dentist-branch-selection-main">
        <p className="eyebrow">Bắt đầu ca làm việc</p>
        <h1>Chọn chi nhánh làm việc</h1>
        <p className="dentist-branch-selection-copy">Bạn đang được phân công tại {branchIds.length} chi nhánh. Chọn một chi nhánh để xem lịch khám và bắt đầu làm việc.</p>
        {error && <div className="dentist-error" role="alert">{error}</div>}
        {!branches ? <div className="dentist-branch-select-loading">Đang tải chi nhánh được phân công...</div> : branches.length === 0 ? (
          <div className="dentist-branch-select-loading">Chưa có chi nhánh làm việc được phân công.</div>
        ) : (
          <div className="dentist-branch-select-grid">
            {branches.map((branch) => (
              <article className="dentist-branch-select-card" key={branch.id_branch}>
                <span>{branch.code}</span>
                <h2>{branch.name}</h2>
                <p>{branch.full_address}</p>
                <dl>
                  <div><dt>Hotline</dt><dd>{branch.phone || 'Chưa cập nhật'}</dd></div>
                  <div><dt>Email</dt><dd>{branch.email || 'Chưa cập nhật'}</dd></div>
                </dl>
                <button type="button" className="button" onClick={() => navigate(`/bac-si?chi-nhanh=${branch.id_branch}`)}>Làm việc tại chi nhánh này</button>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
