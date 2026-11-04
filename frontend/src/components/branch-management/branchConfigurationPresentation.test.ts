import { describe, expect, it } from 'vitest'

import type { ManagedBranchService } from '../../api/management'
import {
  branchServiceFormValues,
  buildBranchServicePayload,
} from './branchConfigurationPresentation'

const inheritedService: ManagedBranchService = {
  id_branch_service: 12,
  branch_id: 3,
  service_id: 8,
  service_name: 'Khám tổng quát',
  price: '500000.00',
  duration_minutes: null,
  buffer_minutes: null,
  is_active: true,
}

describe('branchConfigurationPresentation', () => {
  it('preserves inherited duration and buffer when only the branch price changes', () => {
    const form = branchServiceFormValues(inheritedService)
    const payload = buildBranchServicePayload({ ...form, price: '550000' })

    expect(form.duration_minutes).toBe('')
    expect(form.buffer_minutes).toBe('')
    expect(payload).toEqual({
      service_id: 8,
      price: '550000',
      duration_minutes: null,
      buffer_minutes: null,
    })
  })

  it('restores inheritance when custom duration and buffer values are cleared', () => {
    const editedForm = {
      ...branchServiceFormValues(inheritedService),
      duration_minutes: '75',
      buffer_minutes: '20',
    }
    const payloadAfterClearing = buildBranchServicePayload({
      ...editedForm,
      duration_minutes: '',
      buffer_minutes: '',
    })

    expect(payloadAfterClearing.duration_minutes).toBeNull()
    expect(payloadAfterClearing.buffer_minutes).toBeNull()
  })
})
