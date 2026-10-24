import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ManagementPageHeader } from './ManagementPageHeader'

describe('ManagementPageHeader', () => {
  it('renders the management identity and supplied account controls', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ManagementPageHeader title="Báo cáo chi nhánh" path="/quan-ly-chi-nhanh/bao-cao" authBar={<span>Tài khoản</span>} />
      </MemoryRouter>,
    )

    expect(markup).toContain('Khu vực vận hành')
    expect(markup).toContain('Báo cáo chi nhánh')
    expect(markup).toContain('Tài khoản')
    expect(markup).toContain('dentavie-logo-horizontal-color.png')
  })
})
