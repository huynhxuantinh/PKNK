from datetime import date, time
from decimal import Decimal

from django.contrib.gis.geos import Point
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import Dentist, PatientProfile, User
from apps.catalog.models import BranchService, DentistService, Service
from apps.locations.models import (
    AdministrativeUnit,
    Branch,
    BranchImage,
    BranchOpeningHour,
    Chair,
    Province,
    Ward,
)
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import WorkShift


SERVICES = (
    (
        "GENERAL",
        "Nha khoa tổng quát",
        "Khám định kỳ, cạo vôi và chăm sóc sức khỏe răng miệng toàn diện.",
        45,
        10,
        "350000",
    ),
    (
        "ORTHODONTICS",
        "Niềng răng",
        "Tư vấn và xây dựng lộ trình chỉnh nha phù hợp từng giai đoạn.",
        60,
        15,
        "800000",
    ),
    (
        "IMPLANT",
        "Cấy ghép Implant",
        "Khám, chụp phim và lập kế hoạch phục hồi răng mất.",
        90,
        20,
        "15000000",
    ),
    (
        "COSMETIC",
        "Nha khoa thẩm mỹ",
        "Tẩy trắng, phục hình và cải thiện nụ cười tự nhiên.",
        60,
        10,
        "2500000",
    ),
    (
        "ROOT_CANAL",
        "Điều trị tủy",
        "Kiểm soát đau và bảo tồn răng thật bằng điều trị nội nha.",
        75,
        15,
        "1800000",
    ),
    (
        "PEDIATRIC",
        "Nha khoa trẻ em",
        "Khám và chăm sóc răng miệng nhẹ nhàng dành cho trẻ.",
        40,
        10,
        "300000",
    ),
)


# Mã và tên phường theo đơn vị hành chính 2 cấp sau sắp xếp năm 2025.
# Nguồn dữ liệu: https://github.com/open-admin-data/vietnam-administrative-divisions/tree/main/divisions/ho-chi-minh-79
LEGACY_DEMO_WARD_CODES = (
    "DEMO-BEN-NGHE",
    "DEMO-THAO-DIEN",
    "DEMO-PHU-NHUAN",
    "DEMO-VO-THI-SAU",
    "DEMO-Q5-P7",
    "DEMO-TAN-HUNG",
    "DEMO-BINH-THANH-21",
    "DEMO-GO-VAP-11",
    "DEMO-TAN-BINH-12",
)


BRANCHES = (
    {
        "code": "Q1",
        "name": "PKNK Dental Sài Gòn",
        "ward_code": "26740",
        "ward_name": "Phường Sài Gòn",
        "address": "125 Nguyễn Huệ",
        "longitude": 106.7038,
        "latitude": 10.7753,
        "phone": "028 7300 1001",
        "image": "/images/branches/quan-1.jpg",
        "image_name": "quan-1.jpg",
        "image_size": 135280,
    },
    {
        "code": "TD",
        "name": "PKNK Dental An Khánh",
        "ward_code": "27094",
        "ward_name": "Phường An Khánh",
        "address": "42 Quốc Hương",
        "longitude": 106.7329,
        "latitude": 10.8039,
        "phone": "028 7300 1002",
        "image": "/images/branches/thu-duc.jpg",
        "image_name": "thu-duc.jpg",
        "image_size": 96493,
    },
    {
        "code": "PN",
        "name": "PKNK Dental Cầu Kiệu",
        "ward_code": "27058",
        "ward_name": "Phường Cầu Kiệu",
        "address": "68 Phan Xích Long",
        "longitude": 106.6896,
        "latitude": 10.7982,
        "phone": "028 7300 1003",
        "image": "/images/branches/phu-nhuan.jpg",
        "image_name": "phu-nhuan.jpg",
        "image_size": 217202,
    },
    {
        "code": "Q3",
        "name": "PKNK Dental Bàn Cờ",
        "ward_code": "27154",
        "ward_name": "Phường Bàn Cờ",
        "address": "215 Võ Văn Tần",
        "longitude": 106.6875,
        "latitude": 10.7737,
        "phone": "028 7300 1004",
        "image": "/images/branches/quan-3.jpg",
        "image_name": "quan-3.jpg",
        "image_size": 135280,
    },
    {
        "code": "Q5",
        "name": "PKNK Dental An Đông",
        "ward_code": "27316",
        "ward_name": "Phường An Đông",
        "address": "412 Nguyễn Trãi",
        "longitude": 106.6692,
        "latitude": 10.7544,
        "phone": "028 7300 1005",
        "image": "/images/branches/quan-5.jpg",
        "image_name": "quan-5.jpg",
        "image_size": 96493,
    },
    {
        "code": "Q7",
        "name": "PKNK Dental Tân Thuận",
        "ward_code": "27478",
        "ward_name": "Phường Tân Thuận",
        "address": "86 Nguyễn Thị Thập",
        "longitude": 106.7183,
        "latitude": 10.7382,
        "phone": "028 7300 1006",
        "image": "/images/branches/quan-7.jpg",
        "image_name": "quan-7.jpg",
        "image_size": 217202,
    },
    {
        "code": "BT",
        "name": "PKNK Dental Thạnh Mỹ Tây",
        "ward_code": "26956",
        "ward_name": "Phường Thạnh Mỹ Tây",
        "address": "214 Xô Viết Nghệ Tĩnh",
        "longitude": 106.7117,
        "latitude": 10.8015,
        "phone": "028 7300 1007",
        "image": "/images/branches/binh-thanh.jpg",
        "image_name": "binh-thanh.jpg",
        "image_size": 135280,
    },
    {
        "code": "GV",
        "name": "PKNK Dental Thông Tây Hội",
        "ward_code": "26898",
        "ward_name": "Phường Thông Tây Hội",
        "address": "615 Quang Trung",
        "longitude": 106.6637,
        "latitude": 10.8365,
        "phone": "028 7300 1008",
        "image": "/images/branches/go-vap.jpg",
        "image_name": "go-vap.jpg",
        "image_size": 96493,
    },
    {
        "code": "TB",
        "name": "PKNK Dental Bảy Hiền",
        "ward_code": "26983",
        "ward_name": "Phường Bảy Hiền",
        "address": "172 Cộng Hòa",
        "longitude": 106.6533,
        "latitude": 10.8010,
        "phone": "028 7300 1009",
        "image": "/images/branches/tan-binh.jpg",
        "image_name": "tan-binh.jpg",
        "image_size": 217202,
    },
)


DENTISTS = (
    {
        "email": "minh.dentist@demo.pknk.vn",
        "name": "BS. Nguyễn Hoàng Minh",
        "license": "DEMO-RHM-001",
        "biography": "Nha sĩ tổng quát và nội nha với 9 năm kinh nghiệm.",
        "services": ("GENERAL", "ROOT_CANAL"),
        "branches": ("Q1", "PN"),
    },
    {
        "email": "lan.dentist@demo.pknk.vn",
        "name": "BS. Trần Ngọc Lan",
        "license": "DEMO-RHM-002",
        "biography": "Chuyên chỉnh nha và thiết kế nụ cười.",
        "services": ("ORTHODONTICS", "COSMETIC"),
        "branches": ("Q1", "TD"),
    },
    {
        "email": "huy.dentist@demo.pknk.vn",
        "name": "BS. Lê Quốc Huy",
        "license": "DEMO-RHM-003",
        "biography": "Chuyên phục hình và cấy ghép Implant.",
        "services": ("GENERAL", "IMPLANT", "ROOT_CANAL"),
        "branches": ("TD", "PN"),
    },
    {
        "email": "an.dentist@demo.pknk.vn",
        "name": "BS. Phạm Thùy An",
        "license": "DEMO-RHM-004",
        "biography": "Chuyên chăm sóc và điều trị răng miệng trẻ em.",
        "services": ("GENERAL", "PEDIATRIC"),
        "branches": ("Q1", "TD", "PN"),
    },
    {
        "email": "thao.dentist@demo.pknk.vn",
        "name": "BS. Đặng Minh Thảo",
        "license": "DEMO-RHM-005",
        "biography": "Nha sĩ tổng quát, thẩm mỹ và điều trị nội nha.",
        "services": ("GENERAL", "COSMETIC", "ROOT_CANAL"),
        "branches": ("Q3",),
    },
    {
        "email": "khoa.dentist@demo.pknk.vn",
        "name": "BS. Vũ Anh Khoa",
        "license": "DEMO-RHM-006",
        "biography": "Chuyên phục hình, cấy ghép Implant và điều trị tủy.",
        "services": ("GENERAL", "IMPLANT", "ROOT_CANAL"),
        "branches": ("Q5",),
    },
    {
        "email": "nhu.dentist@demo.pknk.vn",
        "name": "BS. Nguyễn Quỳnh Như",
        "license": "DEMO-RHM-007",
        "biography": "Chuyên chỉnh nha và chăm sóc răng miệng trẻ em.",
        "services": ("GENERAL", "ORTHODONTICS", "PEDIATRIC"),
        "branches": ("Q7",),
    },
    {
        "email": "phong.dentist@demo.pknk.vn",
        "name": "BS. Trương Quốc Phong",
        "license": "DEMO-RHM-008",
        "biography": "Nha sĩ tổng quát, thẩm mỹ và nha khoa trẻ em.",
        "services": ("GENERAL", "COSMETIC", "PEDIATRIC"),
        "branches": ("BT",),
    },
    {
        "email": "mai.dentist@demo.pknk.vn",
        "name": "BS. Lê Thanh Mai",
        "license": "DEMO-RHM-009",
        "biography": "Chuyên nội nha và chăm sóc sức khỏe răng miệng dự phòng.",
        "services": ("GENERAL", "ROOT_CANAL", "PEDIATRIC"),
        "branches": ("GV",),
    },
    {
        "email": "son.dentist@demo.pknk.vn",
        "name": "BS. Phan Hoàng Sơn",
        "license": "DEMO-RHM-010",
        "biography": "Chuyên chỉnh nha và thiết kế nụ cười thẩm mỹ.",
        "services": ("GENERAL", "ORTHODONTICS", "COSMETIC"),
        "branches": ("TB",),
    },
)


class Command(BaseCommand):
    help = "Tạo dữ liệu demo đầy đủ cho luồng tìm chi nhánh và đặt lịch."

    def add_arguments(self, parser):
        parser.add_argument(
            "--password",
            default="Demo123!",
            help="Mật khẩu dùng chung cho các tài khoản demo.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        password = options["password"]
        organization, _ = Organization.objects.update_or_create(
            slug="pknk-dental-demo",
            defaults={
                "name": "PKNK Dental",
                "timezone": "Asia/Ho_Chi_Minh",
                "auto_confirm": True,
                "slot_hold_minutes": 10,
                "cancellation_cutoff_minutes": 1440,
                "no_show_grace_minutes": 15,
                "is_active": True,
            },
        )

        admin_unit, _ = AdministrativeUnit.objects.update_or_create(
            code=1,
            defaults={
                "full_name": "Thành phố trực thuộc trung ương",
                "full_name_en": "Municipality",
                "short_name": "Thành phố",
            },
        )
        province, _ = Province.objects.update_or_create(
            code="79",
            defaults={
                "name": "Hồ Chí Minh",
                "full_name": "Thành phố Hồ Chí Minh",
                "administrative_unit": admin_unit,
            },
        )

        branches = {}
        for branch_data in BRANCHES:
            ward, _ = Ward.objects.update_or_create(
                code=branch_data["ward_code"],
                defaults={
                    "province": province,
                    "name": branch_data["ward_name"],
                    "full_name": branch_data["ward_name"],
                    "administrative_unit": admin_unit,
                },
            )
            branch, _ = Branch.objects.update_or_create(
                organization=organization,
                code=branch_data["code"],
                defaults={
                    "name": branch_data["name"],
                    "phone": branch_data["phone"],
                    "email": f"{branch_data['code'].lower()}@demo.pknk.vn",
                    "province": province,
                    "ward": ward,
                    "address_line": branch_data["address"],
                    "location": Point(
                        branch_data["longitude"],
                        branch_data["latitude"],
                        srid=4326,
                    ),
                    "is_active": True,
                },
            )
            branches[branch_data["code"]] = branch

            for weekday in range(1, 8):
                is_closed = weekday == 7
                BranchOpeningHour.objects.update_or_create(
                    branch=branch,
                    weekday=weekday,
                    defaults={
                        "is_closed": is_closed,
                        "open_time": None if is_closed else time(8, 0),
                        "close_time": None if is_closed else time(18, 0),
                    },
                )

            for chair_number in range(1, 4):
                Chair.objects.update_or_create(
                    branch=branch,
                    code=f"G{chair_number:02d}",
                    defaults={
                        "name": f"Ghế khám {chair_number}",
                        "resource_type": Chair.ResourceType.CHAIR,
                        "is_active": True,
                    },
                )

            BranchImage.objects.filter(branch=branch, is_primary=True).exclude(
                storage_key=branch_data["image"]
            ).update(is_primary=False)
            BranchImage.objects.update_or_create(
                storage_key=branch_data["image"],
                defaults={
                    "branch": branch,
                    "original_name": branch_data["image_name"],
                    "mime_type": "image/jpeg",
                    "size_bytes": branch_data["image_size"],
                    "is_primary": True,
                    "sort_order": 0,
                },
            )

        services = {}
        for code, name, description, duration, buffer_minutes, price in SERVICES:
            service, _ = Service.objects.update_or_create(
                organization=organization,
                code=code,
                defaults={
                    "name": name,
                    "description": description,
                    "standard_duration_minutes": duration,
                    "buffer_minutes": buffer_minutes,
                    "standard_price": Decimal(price),
                    "is_active": True,
                },
            )
            services[code] = service
            for branch_index, branch in enumerate(branches.values()):
                BranchService.objects.update_or_create(
                    branch=branch,
                    service=service,
                    defaults={
                        "price": Decimal(price) + Decimal(branch_index * 50000),
                        "duration_minutes": None,
                        "buffer_minutes": None,
                        "is_active": True,
                    },
                )

        organization_admin = self._upsert_user(
            email="admin@demo.pknk.vn",
            full_name="Quản trị PKNK Dental",
            password=password,
        )
        Membership.objects.update_or_create(
            user=organization_admin,
            organization=organization,
            branch=None,
            role=Membership.Role.ORGANIZATION_ADMIN,
            defaults={"is_active": True},
        )

        branch_admin = self._upsert_user(
            email="branch.admin@demo.pknk.vn",
            full_name="Quản lý chi nhánh Demo",
            password=password,
        )
        for branch in branches.values():
            Membership.objects.update_or_create(
                user=branch_admin,
                organization=organization,
                branch=branch,
                role=Membership.Role.BRANCH_ADMIN,
                defaults={"is_active": True},
            )

        for dentist_data in DENTISTS:
            user = self._upsert_user(
                email=dentist_data["email"],
                full_name=dentist_data["name"],
                password=password,
            )
            dentist, _ = Dentist.objects.update_or_create(
                user=user,
                defaults={
                    "organization": organization,
                    "license_number": dentist_data["license"],
                    "biography": dentist_data["biography"],
                    "is_active": True,
                },
            )
            for service_code in dentist_data["services"]:
                DentistService.objects.get_or_create(
                    dentist=dentist,
                    service=services[service_code],
                )
            for branch_code in dentist_data["branches"]:
                branch = branches[branch_code]
                Membership.objects.update_or_create(
                    user=user,
                    organization=organization,
                    branch=branch,
                    role=Membership.Role.DENTIST,
                    defaults={"is_active": True},
                )
                for weekday in range(1, 7):
                    WorkShift.objects.update_or_create(
                        dentist=dentist,
                        branch=branch,
                        weekday=weekday,
                        start_time=time(8, 0),
                        defaults={
                            "end_time": time(18, 0),
                            "valid_from": date(2024, 1, 1),
                            "valid_to": None,
                            "is_active": True,
                        },
                    )

        patient = self._upsert_user(
            email="patient@demo.pknk.vn",
            full_name="Nguyễn Minh Anh",
            password=password,
        )
        PatientProfile.objects.update_or_create(
            user=patient,
            defaults={
                "date_of_birth": date(1995, 6, 15),
                "gender": PatientProfile.Gender.FEMALE,
                "phone": "0901234567",
                "province": province,
                "ward": Ward.objects.get(code="26740"),
                "address_line": "20 Lê Thánh Tôn",
            },
        )
        Membership.objects.update_or_create(
            user=patient,
            organization=organization,
            branch=None,
            role=Membership.Role.PATIENT,
            defaults={"is_active": True},
        )

        Ward.objects.filter(
            code__in=LEGACY_DEMO_WARD_CODES,
            branches__isnull=True,
            patient_profiles__isnull=True,
        ).delete()

        self.stdout.write(self.style.SUCCESS("Đã tạo/cập nhật dữ liệu demo."))
        self.stdout.write(f"Chi nhánh: {len(branches)} | Dịch vụ: {len(services)} | Nha sĩ: {len(DENTISTS)}")
        self.stdout.write("Tài khoản: patient@demo.pknk.vn, admin@demo.pknk.vn, branch.admin@demo.pknk.vn")
        self.stdout.write(f"Mật khẩu demo: {password}")

    @staticmethod
    def _upsert_user(*, email, full_name, password):
        user, _ = User.objects.update_or_create(
            email=email,
            defaults={
                "full_name": full_name,
                "is_active": True,
                "email_verified_at": timezone.now(),
            },
        )
        user.set_password(password)
        user.save(update_fields=["password"])
        return user
