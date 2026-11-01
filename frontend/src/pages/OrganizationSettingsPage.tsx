import { OrganizationPageLayout } from '../components/organization-management/OrganizationPageLayout'
import { OrganizationSettingsPanel } from '../components/organization-management/OrganizationSettingsPanel'
import { useOrganizationScope } from '../components/organization-management/useOrganizationScope'

export function OrganizationSettingsPage() {
  const scope = useOrganizationScope()
  const organizationName =
    scope.options.find((option) => option.id === scope.organizationId)?.name
    || 'Cài đặt tổ chức'

  return (
    <OrganizationPageLayout
      organizationId={scope.organizationId}
      heroKicker="Thiết lập vận hành"
      heroTitle="Cài đặt tổ chức"
      heroDescription={`Điều chỉnh các thông số chung cho ${organizationName} và toàn bộ chi nhánh trực thuộc.`}
    >
      {scope.organizationId && <OrganizationSettingsPanel organizationId={scope.organizationId} />}
    </OrganizationPageLayout>
  )
}
