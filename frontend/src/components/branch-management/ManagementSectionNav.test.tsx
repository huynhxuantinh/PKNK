import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { ManagementSectionNav } from './ManagementSectionNav'

describe('ManagementSectionNav', () => {
  it('links every management section to the selected branch', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ManagementSectionNav branchId={5} active="appointments" />
      </MemoryRouter>,
    )

    expect(markup).toContain('href="/quan-ly-chi-nhanh?chi-nhanh=5"')
    expect(markup).toContain('href="/quan-ly-chi-nhanh/ca-lam?chi-nhanh=5"')
    expect(markup).toContain('href="/quan-ly-chi-nhanh/bao-cao?chi-nhanh=5"')
    expect(markup).toContain('href="/quan-ly-chi-nhanh/hoa-don?chi-nhanh=5"')
    expect(markup).toContain('href="/quan-ly-chi-nhanh/cau-hinh?chi-nhanh=5"')
    expect(markup).toContain('aria-current="page"')
  })
})
