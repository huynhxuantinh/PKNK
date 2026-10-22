export interface PriceItem {
  name: string
  unit: string
  price: string
  note?: string
}

export interface PriceGroup {
  id: string
  title: string
  description: string
  items: PriceItem[]
}

export const priceGroups: PriceGroup[] = [
  {
    id: 'tong-quat',
    title: 'Nha khoa tổng quát',
    description: 'Khám, phòng ngừa và điều trị các vấn đề răng miệng thường gặp.',
    items: [
      { name: 'Khám và tư vấn tổng quát', unit: 'Lần', price: 'Miễn phí' },
      { name: 'Cạo vôi và đánh bóng', unit: '2 hàm', price: 'Từ 350.000đ' },
      { name: 'Trám răng Composite', unit: 'Răng', price: 'Từ 600.000đ' },
      { name: 'Nhổ răng đơn giản', unit: 'Răng', price: 'Từ 700.000đ' },
    ],
  },
  {
    id: 'nieng-rang',
    title: 'Niềng răng',
    description: 'Lộ trình chỉnh nha được cá nhân hóa theo tình trạng khớp cắn.',
    items: [
      { name: 'Tư vấn và lập kế hoạch chỉnh nha', unit: 'Lần', price: 'Từ 800.000đ' },
      { name: 'Niềng răng mắc cài kim loại', unit: 'Liệu trình', price: 'Từ 35.000.000đ' },
      { name: 'Niềng răng mắc cài sứ', unit: 'Liệu trình', price: 'Từ 50.000.000đ' },
      { name: 'Niềng răng khay trong suốt', unit: 'Liệu trình', price: 'Từ 65.000.000đ' },
    ],
  },
  {
    id: 'implant',
    title: 'Cấy ghép Implant',
    description: 'Phục hồi răng mất với trụ và kế hoạch điều trị phù hợp.',
    items: [
      { name: 'Implant Hàn Quốc', unit: 'Trụ', price: 'Từ 15.000.000đ' },
      { name: 'Implant Thụy Sĩ', unit: 'Trụ', price: 'Từ 28.000.000đ' },
      { name: 'Mão sứ trên Implant', unit: 'Răng', price: 'Từ 6.000.000đ' },
      { name: 'Ghép xương hỗ trợ Implant', unit: 'Vị trí', price: 'Theo chỉ định' },
    ],
  },
  {
    id: 'tham-my',
    title: 'Nha khoa thẩm mỹ',
    description: 'Cải thiện màu sắc, hình thể và sự hài hòa của nụ cười.',
    items: [
      { name: 'Tẩy trắng răng tại phòng khám', unit: 'Liệu trình', price: 'Từ 2.500.000đ' },
      { name: 'Răng sứ Zirconia', unit: 'Răng', price: 'Từ 5.000.000đ' },
      { name: 'Răng toàn sứ cao cấp', unit: 'Răng', price: 'Từ 7.000.000đ' },
      { name: 'Mặt dán sứ Veneer', unit: 'Răng', price: 'Từ 8.000.000đ' },
    ],
  },
  {
    id: 'dieu-tri-tuy',
    title: 'Điều trị tủy',
    description: 'Điều trị nội nha nhằm kiểm soát đau và bảo tồn răng thật.',
    items: [
      { name: 'Điều trị tủy răng cửa', unit: 'Răng', price: 'Từ 1.800.000đ' },
      { name: 'Điều trị tủy răng tiền hàm', unit: 'Răng', price: 'Từ 2.500.000đ' },
      { name: 'Điều trị tủy răng hàm', unit: 'Răng', price: 'Từ 3.500.000đ' },
      { name: 'Điều trị tủy lại', unit: 'Răng', price: 'Từ 3.000.000đ' },
    ],
  },
  {
    id: 'tre-em',
    title: 'Nha khoa trẻ em',
    description: 'Chăm sóc răng nhẹ nhàng và phù hợp theo từng độ tuổi.',
    items: [
      { name: 'Khám răng trẻ em', unit: 'Lần', price: 'Từ 300.000đ' },
      { name: 'Cạo vôi răng trẻ em', unit: '2 hàm', price: 'Từ 250.000đ' },
      { name: 'Trám răng sữa', unit: 'Răng', price: 'Từ 300.000đ' },
      { name: 'Nhổ răng sữa', unit: 'Răng', price: 'Từ 150.000đ' },
    ],
  },
]

export function filterPriceGroups(groups: PriceGroup[], query: string) {
  const normalized = query.trim().toLocaleLowerCase('vi')
  if (!normalized) return groups

  return groups.flatMap((group) => {
    if (`${group.title} ${group.description}`.toLocaleLowerCase('vi').includes(normalized)) {
      return [group]
    }
    const matchingItems = group.items.filter((item) =>
      `${item.name} ${item.unit} ${item.price}`.toLocaleLowerCase('vi').includes(normalized),
    )
    return matchingItems.length ? [{ ...group, items: matchingItems }] : []
  })
}
