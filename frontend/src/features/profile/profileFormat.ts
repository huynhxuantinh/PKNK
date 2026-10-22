export function displayProfileValue(value: string | null | undefined) {
  return value?.trim() || 'Chưa cập nhật'
}

export function displayGender(value: string | null | undefined) {
  const labels: Record<string, string> = {
    MALE: 'Nam',
    FEMALE: 'Nữ',
    OTHER: 'Khác',
  }
  return value ? labels[value] || value : 'Chưa cập nhật'
}
