import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { AuthBar } from '../../auth/AuthBar'
import { Seo } from '../../seo/Seo'

interface ManagementPageHeaderProps {
  title: string
  path: string
  authBar?: ReactNode
}

export function ManagementPageHeader({ title, path, authBar }: ManagementPageHeaderProps) {
  return <>
    <Seo title={`${title} | DentaVie`} description={`${title} trong khu vực vận hành DentaVie.`} path={path} noIndex />
    <header className="dentist-header">
      <Link className="brand" to="/"><img src="/branding/dentavie-logo-horizontal-color.png" alt="DentaVie" /></Link>
      <div className="dentist-header-context"><span>Khu vực vận hành</span><strong>{title}</strong></div>
      {authBar ?? <AuthBar />}
    </header>
  </>
}
