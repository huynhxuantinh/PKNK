import type { ReactNode } from 'react'

import { ManagementPageHeader } from '../branch-management/ManagementPageHeader'
import type { OrganizationOption } from '../../features/organization/organizationSelection'
import {
  OrganizationSectionNav,
  type OrganizationSection,
} from './OrganizationSectionNav'

interface OrganizationPageLayoutProps {
  title: string
  path: string
  active: OrganizationSection
  organizationId: number | null
  options: OrganizationOption[]
  onSelectOrganization: (organizationId: number) => void
  heroKicker: string
  heroTitle: string
  heroDescription: string
  heroAside?: ReactNode
  children: ReactNode
}

export function OrganizationPageLayout({
  title,
  path,
  active,
  organizationId,
  options,
  onSelectOrganization,
  heroKicker,
  heroTitle,
  heroDescription,
  heroAside,
  children,
}: OrganizationPageLayoutProps) {
  return (
    <div className="branch-management-page organization-management-page">
      <ManagementPageHeader title={title} path={path} />
      <main className="branch-management-main">
        <section className="branch-management-hero organization-management-hero">
          <div>
            <span className="organization-eyebrow">{heroKicker}</span>
            <h1>{heroTitle}</h1>
            <p>{heroDescription}</p>
          </div>
          <div className="organization-hero-tools">
            {heroAside}
            {options.length > 1 && (
              <label>
                Tổ chức đang quản trị
                <select
                  value={organizationId || ''}
                  onChange={(event) => onSelectOrganization(Number(event.target.value))}
                >
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </section>

        {organizationId ? (
          <>
            <OrganizationSectionNav active={active} organizationId={organizationId} />
            {children}
          </>
        ) : (
          <p className="management-error" role="alert">
            Tài khoản chưa được cấp quyền quản trị tổ chức.
          </p>
        )}
      </main>
    </div>
  )
}
