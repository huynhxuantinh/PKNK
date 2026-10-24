import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ManagedBranchSelector } from './ManagedBranchSelector'

describe('managed branch selector', () => {
  it('shows every active branch available to the manager', () => {
    const markup = renderToStaticMarkup(
      <ManagedBranchSelector
        branches={[
          { id_branch: 2, name: 'PKNK Dental Cầu Kiệu', is_active: true },
          { id_branch: 5, name: 'PKNK Dental An Khánh', is_active: true },
          { id_branch: 8, name: 'Chi nhánh đã dừng', is_active: false },
        ]}
        loading={false}
        error=""
        onSelect={() => undefined}
      />,
    )

    expect(markup).toContain('Chọn chi nhánh làm việc')
    expect(markup).toContain('PKNK Dental Cầu Kiệu')
    expect(markup).toContain('PKNK Dental An Khánh')
    expect(markup).not.toContain('Chi nhánh đã dừng')
  })
})
