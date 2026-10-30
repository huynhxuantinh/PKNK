import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('leaflet', () => ({
  default: {
    divIcon: () => ({}),
  },
}))

import type { OrganizationBranch } from '../../api/organization'
import { branchToForm } from '../../features/organization/organizationValidation'
import { OrganizationBranchModal } from './OrganizationBranchModal'

const branch: OrganizationBranch = {
  id_branch: 5,
  organization_id: 1,
  code: 'AK',
  name: 'PKNK Dental An Khánh',
  phone: '02873001002',
  email: 'ak@example.com',
  province_code: '79',
  ward_code: '26734',
  address_line: '42 Quốc Hương',
  location: { latitude: 10.8039, longitude: 106.7329 },
  is_active: true,
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
}

describe('OrganizationBranchModal', () => {
  it('renders the location picker and existing branch coordinates', () => {
    const markup = renderToStaticMarkup(
      <OrganizationBranchModal
        branch={branch}
        form={branchToForm(branch)}
        provinces={[{ code: '79', full_name: 'Thành phố Hồ Chí Minh' }]}
        wards={[{ code: '26734', full_name: 'Phường An Khánh' }]}
        loadingWards={false}
        busy={false}
        error=""
        onChange={() => undefined}
        onProvinceChange={() => undefined}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    )

    expect(markup).toContain('data-testid="location-picker"')
    expect(markup).toContain('Tìm trên bản đồ')
    expect(markup).toContain('aria-label="Chọn vị trí chi nhánh trên bản đồ"')
    expect(markup).toContain('value="10.8039"')
    expect(markup).toContain('value="106.7329"')
    expect(markup).toContain('42 Quốc Hương, Phường An Khánh, Thành phố Hồ Chí Minh')
  })
})
