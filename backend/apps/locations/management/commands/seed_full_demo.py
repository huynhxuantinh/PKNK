"""Build a deterministic, linked demo dataset without touching real records."""

import hashlib
import io
import random
import re
from collections import Counter
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.db.models import Q
from django.utils import timezone
from PIL import Image, ImageOps

from apps.accounts.models import Dentist, PatientProfile, User
from apps.billing.models import Invoice, InvoiceLine, Payment
from apps.catalog.models import BranchService, DentistService, Service
from apps.clinical.models import (
    ClinicalAmendment,
    ClinicalEncounter,
    ClinicalPerformedService,
    TreatmentPlan,
    TreatmentPlanItem,
)
from apps.locations.models import Branch, BranchImage, BranchOpeningHour, Chair, Holiday
from apps.notifications.models import Notification
from apps.organizations.models import Membership, Organization
from apps.scheduling.models import (
    Appointment,
    AppointmentStatusHistory,
    TimeOff,
    WorkShift,
)

from .seed_demo import BRANCHES, DENTISTS, SERVICES


DEMO_ORGANIZATION_SLUG = "pknk-dental-demo"
DEMO_PASSWORD = "Demo123!"
MIN_PATIENTS = 30
MAX_PATIENTS = 50
MIN_APPOINTMENTS = 80
MAX_APPOINTMENTS = 150
DEMO_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
TIME_SLOTS = (time(8), time(10), time(13), time(15), time(16))
EXTRA_SERVICES = (
    ("SCALING", "Cạo vôi răng", "Làm sạch mảng bám và chăm sóc nướu.", 45, 10, "500000"),
    ("FILLING", "Trám răng", "Phục hồi răng sâu hoặc tổn thương nhẹ.", 45, 10, "650000"),
    ("EXTRACTION", "Nhổ răng", "Khám và thực hiện nhổ răng theo chỉ định.", 45, 15, "800000"),
    ("WHITENING", "Tẩy trắng răng", "Tư vấn và chăm sóc răng thẩm mỹ.", 60, 15, "2500000"),
    ("CROWN", "Bọc răng sứ", "Phục hình răng theo kế hoạch điều trị.", 90, 20, "5500000"),
)
STAFF_DENTIST_NAMES = (
    "Nguyễn Minh Anh", "Trần Quốc Bảo", "Lê Ngọc Hân", "Phạm Hoàng Nam", "Võ Thị Thanh Trúc",
    "Huỳnh Gia Huy", "Đặng Thảo Nguyên", "Bùi Đức Anh", "Nguyễn Khánh Linh", "Trương Minh Khang",
    "Phan Bảo Ngọc", "Lý Thành Đạt", "Đỗ Phương Thảo", "Nguyễn Anh Tuấn", "Trần Mỹ Duyên",
    "Lê Hoàng Phúc", "Phạm Quỳnh Như", "Võ Nhật Minh", "Huỳnh Ngọc Diệp", "Đặng Quốc Hưng",
    "Bùi Thanh Hằng", "Nguyễn Đức Huy", "Trương Hà My", "Phan Minh Quân", "Đỗ Khánh Vy",
    "Lê Trung Kiên", "Trần Ngọc Mai", "Nguyễn Thành Long", "Phạm Bảo Trân", "Võ Minh Đức",
)
DEMO_NAMES = (
    ("Nguyễn", "Minh Anh"), ("Trần", "Gia Hân"), ("Lê", "Hoàng Nam"),
    ("Phạm", "Thảo Vy"), ("Võ", "Quốc Bảo"), ("Đặng", "Khánh Linh"),
    ("Bùi", "Thanh Tùng"), ("Đỗ", "Ngọc Mai"), ("Hồ", "Tuấn Kiệt"),
    ("Dương", "Phương Thảo"), ("Ngô", "Đức Minh"), ("Vũ", "Hải Yến"),
    ("Phan", "Anh Khoa"), ("Huỳnh", "Bảo Ngọc"), ("Trương", "Minh Châu"),
    ("Đoàn", "Hoàng Phúc"), ("Mai", "Quỳnh Như"), ("Cao", "Thiên Ân"),
    ("Lý", "Tường Vy"), ("Tạ", "Nhật Hào"), ("Châu", "Thu Hà"),
    ("Lâm", "Gia Bảo"), ("Đinh", "Yến Nhi"), ("Tôn", "Hữu Phước"),
    ("Vương", "Mỹ Duyên"), ("Hà", "Trọng Nghĩa"), ("Từ", "Thanh Trúc"),
    ("Hứa", "Quang Huy"), ("Thái", "Kim Ngân"), ("La", "Phúc An"),
    ("Tăng", "Diệu Linh"), ("Chung", "Thành Đạt"), ("Lương", "Bích Ngọc"),
    ("Ninh", "Đình Khang"), ("Lưu", "Khả Hân"), ("Mạc", "Gia Khiêm"),
    ("Tô", "Hoài Thương"), ("Bạch", "Minh Quân"), ("Kiều", "Thùy Dương"),
    ("Đào", "Khánh An"), ("Hồng", "Thiên Phúc"), ("Trịnh", "Tâm Như"),
    ("Nghiêm", "Hoàng Long"), ("Cù", "Ánh Tuyết"), ("Tống", "Khôi Nguyên"),
    ("Lã", "Mộc Miên"), ("Thạch", "Trí Dũng"), ("Ôn", "Hồng Nhung"),
    ("Quan", "Bảo Trân"), ("Triệu", "Đăng Khoa"),
)
STREET_NAMES = (
    "Nguyễn Trãi", "Lê Văn Sỹ", "Cách Mạng Tháng Tám", "Phan Đăng Lưu",
    "Nguyễn Thị Minh Khai", "Điện Biên Phủ", "Trường Sa", "Hoàng Văn Thụ",
)
STATUS_TEMPLATE = (
    ["COMPLETED"] * 40
    + ["RESCHEDULED_OLD"] * 3
    + ["CANCELLED"] * 3
    + ["NO_SHOW"] * 3
    + ["EXPIRED"]
    + ["PENDING"] * 8
    + ["CONFIRMED"] * 16
    + ["RESCHEDULED_NEW"] * 3
    + ["HELD", "CHECKED_IN", "IN_PROGRESS"]
)


class Command(BaseCommand):
    help = "Tạo dữ liệu demo DentaVie có liên kết; không xóa dữ liệu hiện có."

    def add_arguments(self, parser):
        parser.add_argument("--password", default=DEMO_PASSWORD)
        parser.add_argument("--media-dir", default=None, help="Thư mục ảnh nguồn; mặc định là media/img trong repo.")
        parser.add_argument("--asset-dir", default=None, help="Thư mục ảnh public frontend; dùng chủ yếu cho test/local.")
        parser.add_argument("--patients", type=int, default=40)
        parser.add_argument("--appointments", type=int, default=100)
        parser.add_argument("--seed", type=int, default=42, help="Seed ngẫu nhiên để tạo lại cùng bộ dữ liệu.")
        parser.add_argument("--dry-run", action="store_true", help="Kiểm tra ảnh và môi trường, không ghi database/file.")
        parser.add_argument("--reset-demo", action="store_true", help="Tùy chọn reset; bị từ chối vì dữ liệu lịch sử được bảo vệ append-only/immutable.")
        parser.add_argument("--allow-remote-demo-seed", action="store_true", help="Cho phép thêm demo lên database remote trống/chỉ có dữ liệu demo.")

    def handle(self, *args, **options):
        self._validate_counts(options["patients"], options["appointments"])
        self._guard_database(options["reset_demo"], options["allow_remote_demo_seed"])

        repo_root = Path(__file__).resolve().parents[5]
        media_dir = Path(options["media_dir"]).expanduser() if options["media_dir"] else repo_root / "media" / "img"
        asset_dir = Path(options["asset_dir"]).expanduser() if options["asset_dir"] else repo_root / "frontend" / "public" / "images" / "demo" / "branches"
        photos = self._inspect_media(media_dir)
        selected_images = self._select_branch_images(photos)
        self.stdout.write(self.style.SUCCESS(
            f"Ảnh hợp lệ: {len(photos)} | phòng khám: {sum(p['category'] == 'clinic' for p in photos)} | "
            f"bác sĩ/bệnh nhân: {sum(p['category'] == 'people' for p in photos)} | "
            f"tư vấn: {sum(p['category'] == 'consultation' for p in photos)} | "
            f"thiết bị: {sum(p['category'] == 'equipment' for p in photos)}"
        ))
        self.stdout.write(f"Sẽ dùng {len(selected_images)} ảnh stock minh họa cho chi nhánh; không gắn ảnh vào bệnh án.")
        self.stdout.write(f"Ảnh public đích: {asset_dir}")

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("Dry-run: không ghi dữ liệu hoặc sao chép file."))
            return
        if options["reset_demo"]:
            raise CommandError(
                "Reset bị từ chối: schema bảo vệ lịch sử lịch hẹn, bệnh án, amendment và hóa đơn theo hướng append-only/immutable. "
                "Không có bản ghi nào bị xóa; hãy dùng database local/test mới nếu cần dựng lại từ đầu."
            )

        self._copy_branch_images(selected_images, asset_dir)
        with transaction.atomic():
            # Reuse the existing baseline command only when its demo namespace is incomplete.
            # This avoids rewriting hundreds of baseline rows on every idempotent rerun.
            if not self._core_demo_ready():
                call_command("seed_demo", password=options["password"], stdout=io.StringIO())
            organization = Organization.objects.get(slug=DEMO_ORGANIZATION_SLUG)
            branches = {branch.code: branch for branch in Branch.objects.filter(organization=organization)}
            for branch in branches.values():
                ward_name = branch.ward.name.removeprefix("Phường ")
                expected_name = f"DentaVie {ward_name}"
                if branch.name != expected_name:
                    branch.name = expected_name
                    branch.save(update_fields=["name", "updated_at"])
            province = branches["Q1"].province
            wards = {branch.code: branch.ward for branch in branches.values()}
            services = self._ensure_services(organization, branches)
            dentists = {dentist.user.email: dentist for dentist in Dentist.objects.filter(organization=organization).select_related("user")}
            self._ensure_dentist_assignments(dentists, services)
            self._ensure_branch_service_staff(organization, branches, dentists, services, options["password"])
            self._ensure_branch_images(branches, selected_images, asset_dir)
            self._ensure_holidays_and_time_off(organization, branches, dentists)
            patients = self._ensure_patients(
                count=options["patients"], password=options["password"],
                organization=organization, province=province, wards=wards, seed=options["seed"],
            )
            counts = self._ensure_appointments(
                count=options["appointments"], organization=organization,
                branches=branches, dentists=dentists, services=services,
                patients=patients, seed=options["seed"],
            )
            clinical_counts = self._ensure_clinical_and_billing(
                organization=organization, branches=branches, dentists=dentists,
                services=services, patients=patients, counts=counts,
            )
            self._ensure_notifications()

        self.stdout.write(self.style.SUCCESS("Đã tạo/cập nhật bộ dữ liệu demo đồng bộ."))
        self.stdout.write(
            f"Chi nhánh: {len(branches)} | dịch vụ: {len(services)} | nha sĩ: {len(dentists)} | "
            f"bệnh nhân demo: {len(patients)} | lịch hẹn demo: {len(counts)}"
        )
        self.stdout.write(
            f"Lịch theo trạng thái: {dict(Counter(item.status for item in counts.values()))}"
        )
        self.stdout.write(f"Bệnh án: {clinical_counts['encounters']} | kế hoạch: {clinical_counts['plans']} | hóa đơn: {clinical_counts['invoices']} | thanh toán tiền mặt: {clinical_counts['payments']}")
        self.stdout.write("Không tạo giao dịch payOS, không gửi email, không xóa dữ liệu hiện có.")

    @staticmethod
    def _core_demo_ready():
        organization = Organization.objects.filter(slug=DEMO_ORGANIZATION_SLUG).first()
        if not organization:
            return False
        branch_codes = set(Branch.objects.filter(organization=organization).values_list("code", flat=True))
        service_codes = set(Service.objects.filter(organization=organization).values_list("code", flat=True))
        expected_emails = {
            "admin@demo.pknk.vn",
            "patient@demo.pknk.vn",
            "patient2@demo.pknk.vn",
            *(dentist["email"] for dentist in DENTISTS),
            *(f"branch.admin.{branch['code'].lower()}@demo.pknk.vn" for branch in BRANCHES),
        }
        existing_emails = set(User.objects.filter(email__in=expected_emails).values_list("email", flat=True))
        branch_ids = list(Branch.objects.filter(organization=organization).values_list("id_branch", flat=True))
        return (
            len(branch_codes) >= len(BRANCHES)
            and len(service_codes) >= len(SERVICES)
            and existing_emails == expected_emails
            and BranchOpeningHour.objects.filter(branch_id__in=branch_ids).count() >= len(BRANCHES) * 7
            and Chair.objects.filter(branch_id__in=branch_ids).count() >= len(BRANCHES) * 3
            and BranchService.objects.filter(branch_id__in=branch_ids, service__organization=organization).count()
            >= len(BRANCHES) * len(SERVICES)
            and Membership.objects.filter(organization=organization, role=Membership.Role.BRANCH_ADMIN, is_active=True).count()
            >= len(BRANCHES)
            and Membership.objects.filter(organization=organization, role=Membership.Role.DENTIST, is_active=True).count()
            >= len(DENTISTS)
        )

    @staticmethod
    def _validate_counts(patient_count, appointment_count):
        if not MIN_PATIENTS <= patient_count <= MAX_PATIENTS:
            raise CommandError(f"--patients phải nằm trong khoảng {MIN_PATIENTS}–{MAX_PATIENTS}.")
        if not MIN_APPOINTMENTS <= appointment_count <= MAX_APPOINTMENTS:
            raise CommandError(f"--appointments phải nằm trong khoảng {MIN_APPOINTMENTS}–{MAX_APPOINTMENTS}.")

    def _guard_database(self, reset, allow_remote):
        host = (connection.settings_dict.get("HOST") or "").strip().lower()
        name = str(connection.settings_dict.get("NAME") or "").lower()
        local_hosts = {"", "localhost", "127.0.0.1", "::1", "db"}
        is_test_database = name.startswith("test_")
        is_local_database = host in local_hosts and name in {"pknk", "pknk_test", "test_pknk"}
        if reset and not (is_test_database or is_local_database):
            raise CommandError("--reset-demo chỉ được xét trên database local/test đã nhận diện; không có thay đổi nào được ghi.")
        if host not in local_hosts:
            if not allow_remote:
                raise CommandError("Từ chối seed database remote. Chỉ dùng --allow-remote-demo-seed cho database demo mới đã kiểm tra.")
            if "demo" not in name and "seed" not in name:
                raise CommandError("Từ chối seed remote: tên database phải nhận diện rõ là demo/seed để tránh nhầm Neon production.")
            if Organization.objects.exclude(slug=DEMO_ORGANIZATION_SLUG).exists():
                raise CommandError("Remote database có organization ngoài demo; từ chối seed để bảo vệ dữ liệu.")
            if User.objects.exclude(email__endswith="@demo.pknk.vn").exists():
                raise CommandError("Remote database có tài khoản ngoài demo; từ chối seed để bảo vệ dữ liệu.")
            if Appointment.objects.exclude(public_code__startswith="DV-DEMO-").exists():
                raise CommandError("Remote database có lịch hẹn ngoài namespace demo; từ chối seed để bảo vệ dữ liệu.")
            if Invoice.objects.exclude(appointment__public_code__startswith="DV-DEMO-").exists():
                raise CommandError("Remote database có hóa đơn ngoài namespace demo; từ chối seed để bảo vệ dữ liệu.")

    @staticmethod
    def _inspect_media(media_dir):
        if not media_dir.is_dir():
            raise CommandError(f"Không tìm thấy thư mục ảnh: {media_dir}")
        categories = (
            ("01_Phong_kham_noi_that", "clinic"),
            ("02_Bac_si_va_benh_nhan", "people"),
            ("03_Tiep_don_tu_van", "consultation"),
            ("04_Thiet_bi_dung_cu", "equipment"),
        )
        files = []
        for path in sorted(media_dir.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            relative_parts = path.relative_to(media_dir).parts
            category = next((kind for folder, kind in categories if folder in relative_parts), "other")
            if path.name.upper().startswith("XEM_TRUOC"):
                continue
            if path.stat().st_size <= 0 or path.stat().st_size > 15 * 1024 * 1024:
                raise CommandError(f"Ảnh có dung lượng không hợp lệ (tối đa 15 MB): {path}")
            try:
                with Image.open(path) as source:
                    source.verify()
                with Image.open(path) as source:
                    width, height = source.size
                    image_format = source.format
            except Exception as error:
                raise CommandError(f"Không đọc được ảnh {path}: {error}") from error
            if width < 100 or height < 100 or image_format not in {"JPEG", "PNG", "WEBP"}:
                raise CommandError(f"Ảnh không đúng định dạng hoặc kích thước tối thiểu 100×100: {path}")
            files.append({"path": path, "category": category, "width": width, "height": height, "format": image_format})
        if not files:
            raise CommandError(f"Không có ảnh JPG/PNG/WEBP hợp lệ trong {media_dir}; không seed đường dẫn giả.")
        return files

    @staticmethod
    def _select_branch_images(photos):
        clinic_images = [photo for photo in photos if photo["category"] == "clinic"]
        supplemental = [photo for photo in photos if photo["category"] in {"consultation", "equipment"}]
        selected = (clinic_images + supplemental)[: len(BRANCHES)]
        if len(selected) < len(BRANCHES):
            raise CommandError(
                f"Cần ít nhất {len(BRANCHES)} ảnh phòng khám/tư vấn/thiết bị; hiện chỉ có {len(selected)}. "
                "Ảnh chân dung/bệnh nhân không được dùng thay ảnh cơ sở."
            )
        return selected

    @staticmethod
    def _copy_branch_images(selected_images, asset_dir):
        asset_dir.mkdir(parents=True, exist_ok=True)
        attribution_lines = [
            "# Ảnh chi nhánh demo",
            "Ảnh stock từ Pexels, chỉ dùng minh họa; không đại diện nhân viên hay cơ sở thật của DentaVie.",
            "Nguồn và giấy phép: media/img/DANH_SACH_ANH_VA_NGUON.csv; https://www.pexels.com/license/",
            "",
        ]
        for branch_data, photo in zip(BRANCHES, selected_images):
            digest = hashlib.sha256(photo["path"].read_bytes()).hexdigest()[:10]
            filename = f"branch-{branch_data['code'].lower()}-{digest}.jpg"
            photo_id = re.search(r"(\d+)$", photo["path"].stem)
            if photo_id:
                attribution_lines.append(f"- `{filename}`: https://www.pexels.com/photo/{photo_id.group(1)}/")
            destination = asset_dir / filename
            output = io.BytesIO()
            with Image.open(photo["path"]) as source:
                image = ImageOps.exif_transpose(source).convert("RGB")
                image.thumbnail((1600, 1600))
                image.save(output, format="JPEG", optimize=True, quality=84)
            payload = output.getvalue()
            if destination.exists() and destination.read_bytes() != payload:
                raise CommandError(f"Từ chối ghi đè file ảnh không khớp: {destination}")
            if not destination.exists():
                destination.write_bytes(payload)
        attribution_path = asset_dir / "ATTRIBUTION.md"
        attribution_content = "\n".join(attribution_lines) + "\n"
        if attribution_path.exists() and attribution_path.read_text(encoding="utf-8") != attribution_content:
            raise CommandError(f"Từ chối ghi đè tài liệu attribution không khớp: {attribution_path}")
        if not attribution_path.exists():
            attribution_path.write_text(attribution_content, encoding="utf-8")

    def _ensure_branch_images(self, branches, selected_images, asset_dir):
        for branch_data, photo in zip(BRANCHES, selected_images):
            digest = hashlib.sha256(photo["path"].read_bytes()).hexdigest()[:10]
            filename = f"branch-{branch_data['code'].lower()}-{digest}.jpg"
            destination = asset_dir / filename
            storage_key = f"/images/demo/branches/{filename}"
            BranchImage.objects.filter(branch=branches[branch_data["code"]], is_primary=True).exclude(
                storage_key=storage_key
            ).update(is_primary=False)
            BranchImage.objects.update_or_create(
                storage_key=storage_key,
                defaults={
                    "branch": branches[branch_data["code"]],
                    "original_name": photo["path"].name,
                    "mime_type": "image/jpeg",
                    "size_bytes": destination.stat().st_size,
                    "is_primary": True,
                    "sort_order": 0,
                },
            )

    def _ensure_services(self, organization, branches):
        services = {}
        catalog = list(SERVICES) + list(EXTRA_SERVICES)
        for code, name, description, duration, buffer_minutes, price in catalog:
            service, created = Service.objects.get_or_create(
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
            if not created and not service.is_active:
                service.is_active = True
                service.save(update_fields=["is_active", "updated_at"])
            services[code] = service
            for branch_index, branch in enumerate(sorted(branches.values(), key=lambda row: row.code)):
                price_delta = Decimal((branch_index % 5) * 25000)
                branch_service, created = BranchService.objects.get_or_create(
                    branch=branch,
                    service=service,
                    defaults={
                        "price": Decimal(price) + price_delta,
                        "duration_minutes": None,
                        "buffer_minutes": None,
                        "is_active": True,
                    },
                )
                if not created and not branch_service.is_active:
                    branch_service.is_active = True
                    branch_service.save(update_fields=["is_active"])
        return services

    @staticmethod
    def _ensure_dentist_assignments(dentists, services):
        service_codes_by_dentist = {item["email"]: set(item["services"]) for item in DENTISTS}
        extras_by_capability = {
            "SCALING": {"GENERAL"},
            "FILLING": {"GENERAL", "ROOT_CANAL"},
            "EXTRACTION": {"GENERAL", "ROOT_CANAL", "IMPLANT"},
            "WHITENING": {"COSMETIC"},
            "CROWN": {"COSMETIC", "IMPLANT"},
        }
        for email, dentist in dentists.items():
            capabilities = service_codes_by_dentist.get(email, set())
            for code, supported in extras_by_capability.items():
                if capabilities.intersection(supported):
                    DentistService.objects.get_or_create(dentist=dentist, service=services[code])

    @staticmethod
    def _service_capabilities():
        return {
            "GENERAL": {"GENERAL"},
            "ORTHODONTICS": {"ORTHODONTICS"},
            "IMPLANT": {"IMPLANT"},
            "COSMETIC": {"COSMETIC"},
            "ROOT_CANAL": {"ROOT_CANAL"},
            "PEDIATRIC": {"PEDIATRIC"},
            "SCALING": {"GENERAL"},
            "FILLING": {"GENERAL", "ROOT_CANAL"},
            "EXTRACTION": {"GENERAL", "ROOT_CANAL", "IMPLANT"},
            "WHITENING": {"COSMETIC"},
            "CROWN": {"COSMETIC", "IMPLANT"},
        }

    @classmethod
    def _has_branch_service_staff(cls, branch, service, organization, *, today=None):
        today = today or timezone.localdate()
        capability_codes = cls._service_capabilities()[service.code]
        # Service catalog rows are unique by organization/code; resolve required skills
        # through the dentist-service relation so branch membership and shifts stay scoped.
        return Dentist.objects.filter(
            organization=organization,
            is_active=True,
            dentist_services__service__organization=organization,
            dentist_services__service__code__in=capability_codes,
            user__memberships__organization=organization,
            user__memberships__branch=branch,
            user__memberships__role=Membership.Role.DENTIST,
            user__memberships__is_active=True,
            work_shifts__branch=branch,
            work_shifts__is_active=True,
            work_shifts__valid_from__lte=today,
        ).filter(
            Q(work_shifts__valid_to__isnull=True) | Q(work_shifts__valid_to__gte=today)
        ).exists()

    @classmethod
    def _ensure_branch_service_staff(cls, organization, branches, dentists, services, password):
        today = timezone.localdate()
        core_service_codes = [service[0] for service in SERVICES]
        specialty_names = {
            "GENERAL": "Nha khoa tổng quát",
            "ORTHODONTICS": "Chỉnh nha",
            "IMPLANT": "Implant",
            "COSMETIC": "Nha khoa thẩm mỹ",
            "ROOT_CANAL": "Điều trị nội nha",
            "PEDIATRIC": "Nha khoa trẻ em",
        }
        for branch in branches.values():
            for service_code in core_service_codes:
                service = services[service_code]
                if cls._has_branch_service_staff(branch, service, organization, today=today):
                    continue

                email = f"staff.{branch.code.lower()}.{service_code.lower()}@demo.pknk.vn"
                full_name = f"BS. {STAFF_DENTIST_NAMES[0]}"
                user, created = User.objects.get_or_create(
                    email=email,
                    defaults={
                        "full_name": full_name,
                        "is_active": True,
                        "email_verified_at": timezone.now(),
                    },
                )
                if created:
                    user.set_password(password)
                    user.save(update_fields=["password"])
                elif not user.is_active or user.full_name != full_name:
                    user.is_active = True
                    user.full_name = full_name
                    user.save(update_fields=["is_active", "full_name"])
                dentist, _ = Dentist.objects.get_or_create(
                    user=user,
                    defaults={
                        "organization": organization,
                        "license_number": f"DEMO-{branch.code}-{service_code}",
                        "biography": f"Nha sĩ demo phụ trách {specialty_names[service_code]} tại chi nhánh {branch.name}.",
                        "is_active": True,
                    },
                )
                if dentist.organization_id != organization.pk or not dentist.is_active:
                    dentist.organization = organization
                    dentist.is_active = True
                    dentist.save(update_fields=["organization", "is_active", "updated_at"])
                Membership.objects.get_or_create(
                    user=user,
                    organization=organization,
                    branch=branch,
                    role=Membership.Role.DENTIST,
                    defaults={"is_active": True},
                )
                membership = Membership.objects.get(
                    user=user, organization=organization, branch=branch, role=Membership.Role.DENTIST
                )
                if not membership.is_active:
                    membership.is_active = True
                    membership.save(update_fields=["is_active"])
                DentistService.objects.get_or_create(dentist=dentist, service=service)
                for code, supported in {
                    "SCALING": {"GENERAL"},
                    "FILLING": {"GENERAL", "ROOT_CANAL"},
                    "EXTRACTION": {"GENERAL", "ROOT_CANAL", "IMPLANT"},
                    "WHITENING": {"COSMETIC"},
                    "CROWN": {"COSMETIC", "IMPLANT"},
                }.items():
                    if service_code in supported:
                        DentistService.objects.get_or_create(dentist=dentist, service=services[code])
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
                dentists[email] = dentist

        generated_dentists = Dentist.objects.filter(
            organization=organization,
            user__email__startswith="staff.",
        ).select_related("user").order_by("user__email")
        for index, dentist in enumerate(generated_dentists):
            expected_name = f"BS. {STAFF_DENTIST_NAMES[index % len(STAFF_DENTIST_NAMES)]}"
            if dentist.user.full_name != expected_name:
                dentist.user.full_name = expected_name
                dentist.user.save(update_fields=["full_name"])

        unsupported = [
            f"{branch.code}/{service.code}"
            for branch in branches.values()
            for service in services.values()
            if not cls._has_branch_service_staff(branch, service, organization, today=today)
        ]
        if unsupported:
            raise CommandError("Không đủ nha sĩ/ca trực cho dịch vụ chi nhánh: " + ", ".join(unsupported))

    @staticmethod
    def _ensure_holidays_and_time_off(organization, branches, dentists):
        today = timezone.localtime(timezone.now(), DEMO_TIMEZONE).date()
        holiday_date = today + timedelta(days=14)
        while holiday_date.weekday() == 6:
            holiday_date += timedelta(days=1)
        Holiday.objects.update_or_create(
            organization=organization, branch=None, holiday_date=holiday_date,
            defaults={"name": "Ngày nghỉ demo toàn chuỗi", "is_closed": True},
        )
        branch = branches["Q1"]
        branch_holiday_date = today + timedelta(days=9)
        while branch_holiday_date.weekday() == 6:
            branch_holiday_date += timedelta(days=1)
        Holiday.objects.update_or_create(
            organization=organization, branch=branch, holiday_date=branch_holiday_date,
            defaults={"name": "Bảo trì chi nhánh demo", "is_closed": True},
        )
        dentist = dentists["minh.dentist@demo.pknk.vn"]
        leave_date = today + timedelta(days=5)
        while leave_date.weekday() == 6:
            leave_date += timedelta(days=1)
        starts_at = timezone.make_aware(datetime.combine(leave_date, time(8)), DEMO_TIMEZONE)
        ends_at = timezone.make_aware(datetime.combine(leave_date, time(18)), DEMO_TIMEZONE)
        TimeOff.objects.get_or_create(
            dentist=dentist, branch=branches["Q1"], starts_at=starts_at, ends_at=ends_at,
            defaults={"reason": "Nghỉ phép demo", "is_active": True},
        )

    def _ensure_patients(self, *, count, password, organization, province, wards, seed):
        rng = random.Random(seed)
        patients = []
        for index in range(count):
            if index == 0:
                user = User.objects.get(email="patient@demo.pknk.vn")
                profile = user.patient_profile
            elif index == 1:
                user = User.objects.get(email="patient2@demo.pknk.vn")
                profile = user.patient_profile
            else:
                last_name, given_name = DEMO_NAMES[index]
                full_name = f"{last_name} {given_name}"
                email = f"demo.patient.{index + 1:03d}@demo.pknk.vn"
                user, created = User.objects.get_or_create(
                    email=email,
                    defaults={
                        "full_name": full_name,
                        "phone": f"090{index + 1:07d}",
                        "is_active": True,
                        "email_verified_at": timezone.now(),
                    },
                )
                if created:
                    user.set_password(password)
                    user.save(update_fields=["password"])
                elif user.full_name != full_name or not user.email_verified_at or not user.is_active:
                    # Only demo namespace accounts are touched; do not reset passwords on reruns.
                    user.full_name = full_name
                    user.email_verified_at = user.email_verified_at or timezone.now()
                    user.is_active = True
                    user.save(update_fields=["full_name", "email_verified_at", "is_active"])
                profile, _ = PatientProfile.objects.get_or_create(
                    user=user,
                    defaults={
                        "date_of_birth": date(1975 + (index * 7) % 36, 1 + (index * 5) % 12, 1 + (index * 11) % 27),
                        "gender": list(PatientProfile.Gender.values)[index % len(PatientProfile.Gender.values)],
                        "province": province,
                        "ward": wards[BRANCHES[index % len(BRANCHES)]["code"]],
                        "address_line": f"Số {10 + index}, đường {STREET_NAMES[index % len(STREET_NAMES)]}",
                    },
                )
                Membership.objects.get_or_create(
                    user=user, organization=organization, branch=None, role=Membership.Role.PATIENT,
                    defaults={"is_active": True},
                )
            patients.append(profile)
        # Stable pseudo-random patient order while preserving the two easy-login accounts.
        tail = patients[2:]
        rng.shuffle(tail)
        return patients[:2] + tail

    def _ensure_appointments(self, *, count, organization, branches, dentists, services, patients, seed):
        rng = random.Random(seed)
        self._prepare_slot_data(organization, branches, dentists)
        status_plan = list(STATUS_TEMPLATE[:count])
        while len(status_plan) < count:
            status_plan.append("COMPLETED")
        manager_by_branch = {
            branch.code: Membership.objects.get(
                organization=organization,
                branch=branch,
                role=Membership.Role.BRANCH_ADMIN,
                is_active=True,
            ).user
            for branch in branches.values()
        }
        patients = list(patients)
        appointments = {
            appointment.public_code: appointment
            for appointment in Appointment.objects.filter(public_code__startswith="DV-DEMO-").select_related(
                "branch", "branch_service__service", "dentist", "patient_profile"
            )
        }
        reschedule_sources = []

        for number, scenario in enumerate(status_plan, start=1):
            public_code = f"DV-DEMO-{number:06d}"
            existing = appointments.get(public_code)
            if existing:
                if scenario == "RESCHEDULED_OLD":
                    reschedule_sources.append(existing)
                continue

            if scenario == "RESCHEDULED_NEW":
                if not reschedule_sources:
                    continue
                original = reschedule_sources.pop(0)
                candidate = self._find_slot(
                    branches=branches,
                    dentists=dentists,
                    services=services,
                    rng=rng,
                    direction="future",
                    branch=original.branch,
                    dentist=original.dentist,
                    service=original.branch_service.service,
                    patient_profile=original.patient_profile,
                )
                if candidate is None:
                    continue
                appointment = self._create_appointment(
                    number=number, scenario="RESCHEDULED_NEW", candidate=candidate,
                    patient_profile=original.patient_profile, organization=organization,
                    manager_by_branch=manager_by_branch, rescheduled_from=original,
                )
                appointments[public_code] = appointment
                continue

            profile = rng.choice(patients)
            if scenario in {"CHECKED_IN", "IN_PROGRESS"}:
                candidate = self._find_current_slot(
                    branches=branches, dentists=dentists, services=services, rng=rng,
                    scenario=scenario, patient_profile=profile,
                )
                if candidate is None:
                    continue
            else:
                direction = "past" if scenario in {
                    "COMPLETED", "RESCHEDULED_OLD", "CANCELLED", "NO_SHOW", "EXPIRED"
                } else "future"
                candidate = self._find_slot(
                    branches=branches, dentists=dentists, services=services,
                    rng=rng, direction=direction, patient_profile=profile,
                )
                if candidate is None:
                    raise CommandError(f"Không tìm được slot hợp lệ cho lịch demo {public_code} ({scenario}).")

            appointment = self._create_appointment(
                number=number, scenario=scenario, candidate=candidate,
                patient_profile=profile, organization=organization,
                manager_by_branch=manager_by_branch,
            )
            appointments[public_code] = appointment
            if scenario == "RESCHEDULED_OLD":
                reschedule_sources.append(appointment)

        # If a special scenario cannot be placed, fill only its missing target code.
        # This keeps reruns idempotent and never creates records past the requested range.
        for number in range(1, count + 1):
            code = f"DV-DEMO-{number:06d}"
            if code in appointments:
                continue
            profile = rng.choice(patients)
            candidate = self._find_slot(
                branches=branches, dentists=dentists, services=services,
                rng=rng, direction="past", patient_profile=profile,
            )
            if candidate is None:
                raise CommandError("Không còn slot lịch sử hợp lệ để hoàn tất số lượng lịch demo yêu cầu.")
            appointment = self._create_appointment(
                number=number, scenario="COMPLETED", candidate=candidate,
                patient_profile=profile, organization=organization,
                manager_by_branch=manager_by_branch,
            )
            appointments[code] = appointment

        return appointments

    def _prepare_slot_data(self, organization, branches, dentists):
        self._shift_map = {}
        for shift in WorkShift.objects.filter(
            branch__organization=organization,
            dentist__organization=organization,
            is_active=True,
        ):
            self._shift_map.setdefault((shift.dentist_id, shift.branch_id, shift.weekday), []).append(shift)
        self._opening_map = {
            (hour.branch_id, hour.weekday): hour
            for branch in branches.values()
            for hour in branch.opening_hours.all()
        }
        self._branch_services = {
            (item.branch_id, item.service_id): item
            for item in BranchService.objects.filter(
                branch__organization=organization,
                is_active=True,
                service__is_active=True,
            ).select_related("service")
        }
        self._dentist_services = {}
        for row in DentistService.objects.filter(
            dentist__organization=organization,
            service__organization=organization,
            service__is_active=True,
        ).select_related("service"):
            self._dentist_services.setdefault(row.dentist_id, []).append(row.service)
        self._chairs = {}
        for chair in Chair.objects.filter(branch__organization=organization, is_active=True).order_by("code"):
            self._chairs.setdefault(chair.branch_id, []).append(chair)
        self._holidays = set(
            Holiday.objects.filter(organization=organization, is_closed=True).values_list("branch_id", "holiday_date")
        )
        self._time_offs = {}
        for row in TimeOff.objects.filter(dentist__organization=organization, is_active=True):
            self._time_offs.setdefault(row.dentist_id, []).append(row)
        self._reservations_by_dentist = {}
        self._reservations_by_chair = {}
        self._reservations_by_patient = {}
        existing = Appointment.objects.filter(
            branch__organization=organization
        ).values_list("patient_profile_id", "dentist_id", "chair_id", "starts_at", "occupied_until")
        for patient_id, dentist_id, chair_id, starts_at, occupied_until in existing:
            self._reservations_by_dentist.setdefault(dentist_id, []).append((starts_at, occupied_until))
            self._reservations_by_chair.setdefault(chair_id, []).append((starts_at, occupied_until))
            self._reservations_by_patient.setdefault(patient_id, []).append((starts_at, occupied_until))

    def _find_current_slot(self, *, branches, dentists, services, rng, scenario, patient_profile):
        now = timezone.localtime(timezone.now(), DEMO_TIMEZONE)
        if now.weekday() != 6 and time(8) <= now.time() < time(17):
            start = (now - timedelta(minutes=15) if scenario == "IN_PROGRESS" else now + timedelta(minutes=20))
            start = start.replace(second=0, microsecond=0)
            current = self._find_slot(
                branches=branches, dentists=dentists, services=services, rng=rng,
                direction="today", requested_start=start, patient_profile=patient_profile,
            )
            if current:
                return current

        # Keep all supported appointment states represented even when the seed runs
        # outside clinic hours; use a valid prior working slot instead of dropping them.
        prior_workday = datetime.combine(now.date(), time(10), tzinfo=DEMO_TIMEZONE)
        return self._find_slot(
            branches=branches, dentists=dentists, services=services, rng=rng,
            direction="past", requested_start=prior_workday, patient_profile=patient_profile,
        )

    def _find_slot(
        self, *, branches, dentists, services, rng, direction, branch=None,
        dentist=None, service=None, requested_start=None,
        patient_profile=None,
    ):
        today = timezone.localtime(timezone.now(), DEMO_TIMEZONE).date()
        if direction == "past":
            days = list(range(1, 61))
            rng.shuffle(days)
            candidate_dates = [today - timedelta(days=offset) for offset in days]
        elif direction == "future":
            days = list(range(1, 46))
            rng.shuffle(days)
            candidate_dates = [today + timedelta(days=offset) for offset in days]
        else:
            candidate_dates = [today]
        branch_choices = [branch] if branch else list(branches.values())
        rng.shuffle(branch_choices)

        for day in candidate_dates:
            if day.weekday() == 6:
                continue
            for target_branch in branch_choices:
                holiday = (
                    (None, day) in self._holidays
                    or (target_branch.pk, day) in self._holidays
                )
                if holiday:
                    continue
                opening = self._opening_map.get((target_branch.pk, day.isoweekday()))
                if not opening or opening.is_closed or not opening.open_time or not opening.close_time:
                    continue
                dentist_choices = [dentist] if dentist else [
                    dentists[item["email"]]
                    for item in DENTISTS
                    if target_branch.code in item["branches"] and item["email"] in dentists
                ]
                rng.shuffle(dentist_choices)
                for target_dentist in dentist_choices:
                    if not target_dentist.is_active:
                        continue
                    service_choices = [service] if service else [
                        item for item in self._dentist_services.get(target_dentist.pk, [])
                        if (target_branch.pk, item.pk) in self._branch_services
                    ]
                    rng.shuffle(service_choices)
                    for target_service in service_choices:
                        branch_service = self._branch_services.get((target_branch.pk, target_service.pk))
                        if not branch_service:
                            continue
                        duration = branch_service.duration_minutes or target_service.standard_duration_minutes
                        buffer_minutes = branch_service.buffer_minutes if branch_service.buffer_minutes is not None else target_service.buffer_minutes
                        start_times = [requested_start.timetz().replace(tzinfo=None)] if requested_start else list(TIME_SLOTS)
                        if requested_start is None:
                            rng.shuffle(start_times)
                        for start_time in start_times:
                            local_start = datetime.combine(day, start_time, tzinfo=DEMO_TIMEZONE)
                            starts_at = local_start.astimezone(timezone.get_current_timezone())
                            ends_at = starts_at + timedelta(minutes=duration)
                            occupied_until = ends_at + timedelta(minutes=buffer_minutes)
                            occupied_local = occupied_until.astimezone(DEMO_TIMEZONE).time().replace(tzinfo=None)
                            if occupied_local > opening.close_time:
                                continue
                            shifts = self._shift_map.get((target_dentist.pk, target_branch.pk, day.isoweekday()), [])
                            shift_ok = any(
                                shift.valid_from <= day
                                and (shift.valid_to is None or shift.valid_to >= day)
                                and shift.start_time <= start_time
                                and shift.end_time >= occupied_local
                                for shift in shifts
                            )
                            if not shift_ok:
                                continue
                            has_time_off = any(
                                (leave.branch_id is None or leave.branch_id == target_branch.pk)
                                and leave.starts_at < occupied_until
                                and leave.ends_at > starts_at
                                for leave in self._time_offs.get(target_dentist.pk, [])
                            )
                            if has_time_off:
                                continue
                            chairs = list(self._chairs.get(target_branch.pk, []))
                            rng.shuffle(chairs)
                            for chair in chairs:
                                patient_busy = patient_profile is not None and any(
                                    left < occupied_until and right > starts_at
                                    for left, right in self._reservations_by_patient.get(patient_profile.pk, [])
                                )
                                dentist_busy = any(
                                    left < occupied_until and right > starts_at
                                    for left, right in self._reservations_by_dentist.get(target_dentist.pk, [])
                                )
                                chair_busy = any(
                                    left < occupied_until and right > starts_at
                                    for left, right in self._reservations_by_chair.get(chair.pk, [])
                                )
                                if not patient_busy and not dentist_busy and not chair_busy:
                                    return {
                                        "branch": target_branch,
                                        "dentist": target_dentist,
                                        "chair": chair,
                                        "service": target_service,
                                        "branch_service": branch_service,
                                        "starts_at": starts_at,
                                        "ends_at": ends_at,
                                        "occupied_until": occupied_until,
                                        "duration": duration,
                                        "buffer": buffer_minutes,
                                    }
        return None

    def _create_appointment(
        self, *, number, scenario, candidate, patient_profile, organization,
        manager_by_branch, rescheduled_from=None,
    ):
        branch = candidate["branch"]
        dentist = candidate["dentist"]
        patient_user = patient_profile.user
        starts_at, ends_at = candidate["starts_at"], candidate["ends_at"]
        status = scenario
        if scenario in {"RESCHEDULED_OLD", "CANCELLED"}:
            status = Appointment.Status.CANCELLED
        elif scenario == "RESCHEDULED_NEW":
            status = Appointment.Status.CONFIRMED
        elif scenario == "COMPLETED":
            status = Appointment.Status.COMPLETED

        held_at = min(starts_at - timedelta(days=1), timezone.now())
        expires_at = held_at + timedelta(minutes=organization.slot_hold_minutes)
        if scenario == "HELD":
            held_at = timezone.now()
            expires_at = held_at + timedelta(minutes=organization.slot_hold_minutes)
        confirmed_at = None
        checked_in_at = None
        started_at = None
        completed_at = None
        cancelled_at = None
        cancelled_by = None
        cancel_reason = ""
        no_show_at = None
        if scenario not in {"HELD", "PENDING", "EXPIRED"}:
            confirmed_at = min(starts_at - timedelta(hours=2), timezone.now())
        if status in {Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS, Appointment.Status.COMPLETED}:
            checked_in_at = starts_at - timedelta(minutes=10)
        if status in {Appointment.Status.IN_PROGRESS, Appointment.Status.COMPLETED}:
            started_at = starts_at
        if status == Appointment.Status.COMPLETED:
            completed_at = ends_at
        if status == Appointment.Status.CANCELLED:
            cancelled_at = min(starts_at - timedelta(hours=2), timezone.now())
            cancelled_by = patient_user
            cancel_reason = "Đổi lịch hẹn demo" if scenario == "RESCHEDULED_OLD" else "Bệnh nhân xin hủy lịch demo"
        if scenario == "NO_SHOW":
            no_show_at = starts_at + timedelta(minutes=organization.no_show_grace_minutes + 5)

        appointment = Appointment.objects.create(
            public_code=f"DV-DEMO-{number:06d}",
            patient_profile=patient_profile,
            branch=branch,
            branch_service=candidate["branch_service"],
            dentist=dentist,
            chair=candidate["chair"],
            service_name_snapshot=candidate["service"].name,
            service_price_snapshot=candidate["branch_service"].price,
            contact_name_snapshot=patient_user.full_name,
            contact_phone_snapshot=patient_user.phone,
            contact_email_snapshot=patient_user.email,
            patient_note="Lịch minh họa dùng cho môi trường demo.",
            duration_minutes=candidate["duration"],
            buffer_minutes=candidate["buffer"],
            starts_at=starts_at,
            ends_at=ends_at,
            occupied_until=candidate["occupied_until"],
            status=status,
            held_at=held_at,
            expires_at=expires_at,
            confirmed_at=confirmed_at,
            checked_in_at=checked_in_at,
            started_at=started_at,
            completed_at=completed_at,
            cancelled_at=cancelled_at,
            cancelled_by=cancelled_by,
            cancel_reason=cancel_reason,
            no_show_at=no_show_at,
            rescheduled_from=rescheduled_from,
        )
        self._reservations_by_dentist.setdefault(dentist.pk, []).append((starts_at, candidate["occupied_until"]))
        self._reservations_by_chair.setdefault(candidate["chair"].pk, []).append((starts_at, candidate["occupied_until"]))
        self._reservations_by_patient.setdefault(patient_profile.pk, []).append((starts_at, candidate["occupied_until"]))
        self._create_status_history(appointment, scenario, manager_by_branch[branch.code], patient_user)
        return appointment

    @staticmethod
    def _create_status_history(appointment, scenario, branch_manager, patient_user):
        start = appointment.starts_at
        event_rows = [
            (None, Appointment.Status.HELD, AppointmentStatusHistory.ActorType.PATIENT, patient_user, appointment.held_at, ""),
        ]
        if scenario == "HELD":
            pass
        elif scenario == "EXPIRED":
            event_rows.append((Appointment.Status.HELD, Appointment.Status.EXPIRED, AppointmentStatusHistory.ActorType.SYSTEM, None, appointment.expires_at + timedelta(minutes=1), "Hết hạn giữ chỗ demo"))
        else:
            first_status = Appointment.Status.PENDING if scenario == "PENDING" else Appointment.Status.CONFIRMED
            event_rows.append((Appointment.Status.HELD, first_status, AppointmentStatusHistory.ActorType.PATIENT, patient_user, min(start - timedelta(hours=2), timezone.now()), ""))
            if first_status == Appointment.Status.PENDING and scenario != "PENDING":
                event_rows.append((Appointment.Status.PENDING, Appointment.Status.CONFIRMED, AppointmentStatusHistory.ActorType.BRANCH_ADMIN, branch_manager, start - timedelta(hours=1), "Quản lý xác nhận lịch demo"))
            if scenario in {"CHECKED_IN", "IN_PROGRESS", "COMPLETED"}:
                event_rows.append((Appointment.Status.CONFIRMED, Appointment.Status.CHECKED_IN, AppointmentStatusHistory.ActorType.BRANCH_ADMIN, branch_manager, start - timedelta(minutes=10), ""))
                if scenario in {"IN_PROGRESS", "COMPLETED"}:
                    event_rows.append((Appointment.Status.CHECKED_IN, Appointment.Status.IN_PROGRESS, AppointmentStatusHistory.ActorType.DENTIST, appointment.dentist.user, start, ""))
                if scenario == "COMPLETED":
                    event_rows.append((Appointment.Status.IN_PROGRESS, Appointment.Status.COMPLETED, AppointmentStatusHistory.ActorType.DENTIST, appointment.dentist.user, appointment.ends_at, ""))
            elif scenario == "NO_SHOW":
                event_rows.append((Appointment.Status.CONFIRMED, Appointment.Status.NO_SHOW, AppointmentStatusHistory.ActorType.BRANCH_ADMIN, branch_manager, appointment.no_show_at, "Không liên hệ được bệnh nhân trong thời gian chờ"))
            elif scenario in {"CANCELLED", "RESCHEDULED_OLD"}:
                event_rows.append((Appointment.Status.CONFIRMED, Appointment.Status.CANCELLED, AppointmentStatusHistory.ActorType.PATIENT, patient_user, appointment.cancelled_at, appointment.cancel_reason))
        AppointmentStatusHistory.objects.bulk_create([
            AppointmentStatusHistory(
                appointment=appointment,
                from_status=from_status,
                to_status=to_status,
                actor_type=actor_type,
                actor_user=actor,
                created_at=created_at,
                reason=reason,
            )
            for from_status, to_status, actor_type, actor, created_at, reason in event_rows
        ])

    def _ensure_clinical_and_billing(self, *, organization, branches, dentists, services, patients, counts):
        appointments = sorted(counts.values(), key=lambda item: (item.starts_at, item.public_code))
        completed = [item for item in appointments if item.status == Appointment.Status.COMPLETED]
        manager_by_branch = {
            branch.code: Membership.objects.get(
                organization=organization, branch=branch,
                role=Membership.Role.BRANCH_ADMIN, is_active=True,
            ).user
            for branch in branches.values()
        }
        created_encounters = 0
        created_plans = 0
        created_invoices = 0
        created_payments = 0
        finalized_encounters = []

        for index, appointment in enumerate(appointments):
            if appointment.status not in {Appointment.Status.COMPLETED, Appointment.Status.IN_PROGRESS}:
                continue
            encounter, created = ClinicalEncounter.objects.get_or_create(
                appointment=appointment,
                defaults={
                    "status": ClinicalEncounter.Status.DRAFT,
                    "chief_complaint": "Khám và tư vấn nha khoa demo.",
                    "medical_history": "Thông tin sức khỏe giả lập phục vụ trình diễn.",
                    "diagnosis_summary": "Cần theo dõi sức khỏe răng miệng định kỳ.",
                    "notes": "Nội dung bệnh án hoàn toàn giả lập.",
                    "aftercare_instructions": "Vệ sinh răng miệng đúng cách và tái khám theo lịch.",
                    "created_by": appointment.dentist.user,
                },
            )
            created_encounters += int(created)
            if not encounter.performed_services.exists():
                ClinicalPerformedService.objects.create(
                    encounter=encounter,
                    branch_service=appointment.branch_service,
                    service_code_snapshot=appointment.branch_service.service.code,
                    service_name_snapshot=appointment.service_name_snapshot,
                    unit_price_snapshot=appointment.service_price_snapshot,
                    quantity=1,
                    tooth_reference="Vùng răng minh họa",
                    clinical_note="Dữ liệu giả lập; không phải hồ sơ bệnh nhân thật.",
                )
                encounter.performed_services_confirmed = True
                encounter.save(update_fields=["performed_services_confirmed", "updated_at"])
            if appointment.status == Appointment.Status.COMPLETED and encounter.status == ClinicalEncounter.Status.DRAFT:
                encounter.status = ClinicalEncounter.Status.FINALIZED
                encounter.finalized_by = appointment.dentist.user
                encounter.finalized_at = appointment.completed_at or appointment.ends_at
                encounter.save(update_fields=["status", "finalized_by", "finalized_at", "updated_at"])
            if appointment.status == Appointment.Status.COMPLETED and encounter.status == ClinicalEncounter.Status.FINALIZED:
                finalized_encounters.append(encounter)

        for index, encounter in enumerate(finalized_encounters):
            if index % 10 == 0 and not encounter.amendments.exists():
                ClinicalAmendment.objects.create(
                    encounter=encounter,
                    content="Bổ sung minh họa: bệnh nhân được hướng dẫn theo dõi và chăm sóc tại nhà.",
                    reason="Hoàn thiện ghi chú sau buổi khám demo.",
                    author=encounter.finalized_by,
                )

        plan_statuses = [
            TreatmentPlan.Status.DRAFT,
            TreatmentPlan.Status.ACTIVE,
            TreatmentPlan.Status.COMPLETED,
            TreatmentPlan.Status.CANCELLED,
        ]
        for index, encounter in enumerate(finalized_encounters[::4][:12]):
            plan, created = TreatmentPlan.objects.get_or_create(
                originating_encounter=encounter,
                title="Kế hoạch chăm sóc răng miệng demo",
                defaults={
                    "organization": organization,
                    "patient_profile": encounter.appointment.patient_profile,
                    "dentist": encounter.appointment.dentist,
                    "branch": encounter.appointment.branch,
                    "description": "Các bước dự kiến; không tự tạo dịch vụ thực hiện hoặc hóa đơn.",
                    "status": TreatmentPlan.Status.DRAFT,
                },
            )
            if created:
                created_plans += 1
                plan_services = [
                    encounter.appointment.branch_service.service,
                    services["GENERAL"],
                ]
                item_rows = []
                for sequence, service in enumerate(dict.fromkeys(plan_services), start=1):
                    item_rows.append(TreatmentPlanItem(
                        treatment_plan=plan,
                        service=service,
                        sequence=sequence,
                        planned_price=service.standard_price,
                        note="Dự kiến, cần bác sĩ và bệnh nhân thống nhất.",
                        status=TreatmentPlanItem.Status.PLANNED,
                    ))
                TreatmentPlanItem.objects.bulk_create(item_rows)
                total = sum((row.planned_price for row in item_rows), Decimal("0"))
                TreatmentPlan.objects.filter(pk=plan.pk).update(total_estimate=total)
                plan.total_estimate = total
                target_status = plan_statuses[index % len(plan_statuses)]
                if target_status in {TreatmentPlan.Status.COMPLETED, TreatmentPlan.Status.CANCELLED}:
                    item_status = (
                        TreatmentPlanItem.Status.COMPLETED
                        if target_status == TreatmentPlan.Status.COMPLETED
                        else TreatmentPlanItem.Status.CANCELLED
                    )
                    TreatmentPlanItem.objects.filter(treatment_plan=plan).update(status=item_status)
                if target_status != TreatmentPlan.Status.DRAFT:
                    plan.status = target_status
                    plan.save(update_fields=["status", "updated_at"])

        for index, appointment in enumerate(completed):
            # Keep completed visits in the invoice queue as well as all billing states.
            if index < 5:
                continue
            if Invoice.objects.filter(appointment=appointment).exists():
                continue
            invoice_status = None
            replacement = False
            if index < 9:
                invoice_status = "DRAFT"
            elif index < 13:
                invoice_status = "ISSUED"
            elif index < 33:
                invoice_status = "PAID"
            elif index < 35:
                invoice_status = "REPLACEMENT"
                replacement = True
            else:
                continue
            manager = manager_by_branch[appointment.branch.code]
            old_invoice = None
            if replacement:
                old_invoice = self._create_invoice(appointment, manager, number=f"{index + 1:03d}", status="VOID")
                created_invoices += 1
            invoice = self._create_invoice(
                appointment, manager,
                number=f"{index + 1:03d}-R" if replacement else f"{index + 1:03d}",
                status="DRAFT" if replacement else invoice_status,
                replacement_for=old_invoice,
            )
            created_invoices += 1
            if invoice.status == Invoice.Status.PAID:
                created_payments += 1

        return {
            "encounters": ClinicalEncounter.objects.filter(appointment__public_code__startswith="DV-DEMO-").count(),
            "plans": TreatmentPlan.objects.filter(originating_encounter__appointment__public_code__startswith="DV-DEMO-").count(),
            "invoices": Invoice.objects.filter(appointment__public_code__startswith="DV-DEMO-").count(),
            "payments": Payment.objects.filter(invoice__appointment__public_code__startswith="DV-DEMO-").count(),
            "new_encounters": created_encounters,
            "new_plans": created_plans,
            "new_invoices": created_invoices,
            "new_payments": created_payments,
        }

    @staticmethod
    def _create_invoice(appointment, manager, *, number, status, replacement_for=None):
        invoice_number = f"DEMO-INV-{appointment.public_code.rsplit('-', 1)[-1]}-{number}"
        invoice = Invoice.objects.create(
            appointment=appointment,
            branch=appointment.branch,
            patient_profile=appointment.patient_profile,
            replacement_for=replacement_for,
            invoice_number=invoice_number,
            status=Invoice.Status.DRAFT,
            created_by=manager,
        )
        performed = list(appointment.clinical_encounter.performed_services.select_related(
            "branch_service__service"
        ))
        lines = [
            InvoiceLine(
                invoice=invoice,
                service=item.branch_service.service,
                service_code_snapshot=item.service_code_snapshot,
                description=item.service_name_snapshot,
                quantity=item.quantity,
                unit_price=item.unit_price_snapshot,
                line_total=item.unit_price_snapshot * item.quantity,
            )
            for item in performed
        ]
        if not lines:
            raise CommandError(f"Lượt {appointment.public_code} thiếu dịch vụ thực hiện, không thể lập hóa đơn.")
        InvoiceLine.objects.bulk_create(lines)
        invoice.subtotal = sum((line.line_total for line in lines), Decimal("0"))
        invoice.total = invoice.subtotal
        invoice.save(update_fields=["subtotal", "total", "updated_at"])
        if status == "VOID":
            invoice.status = Invoice.Status.VOID
            invoice.voided_by = manager
            invoice.voided_at = appointment.ends_at + timedelta(hours=2)
            invoice.void_reason = "Điều chỉnh dữ liệu minh họa; giữ lịch sử hóa đơn."
            invoice.save(update_fields=["status", "voided_by", "voided_at", "void_reason", "updated_at"])
            return invoice
        if status in {"ISSUED", "PAID"}:
            invoice.status = Invoice.Status.ISSUED
            invoice.issued_by = manager
            invoice.issued_at = appointment.ends_at + timedelta(hours=1)
            invoice.save(update_fields=["status", "issued_by", "issued_at", "updated_at"])
        if status == "PAID":
            paid_at = appointment.ends_at + timedelta(hours=2)
            Payment.objects.create(
                invoice=invoice,
                payment_number=f"DEMO-PAY-{appointment.public_code.rsplit('-', 1)[-1]}",
                method=Payment.Method.CASH,
                amount=invoice.total,
                status=Payment.Status.POSTED,
                external_reference="DEMO-CASH-RECEIPT",
                idempotency_key=f"demo-cash:{invoice_number}",
                posted_by=manager,
                posted_at=paid_at,
            )
            invoice.status = Invoice.Status.PAID
            invoice.paid_at = paid_at
            invoice.save(update_fields=["status", "paid_at", "updated_at"])
        return invoice

    @staticmethod
    def _ensure_notifications():
        appointment_types = {
            Appointment.Status.PENDING: (Notification.Type.APPOINTMENT_PENDING_REVIEW, "Lịch hẹn đang chờ xác nhận"),
            Appointment.Status.CONFIRMED: (Notification.Type.APPOINTMENT_CONFIRMED, "Lịch hẹn đã được xác nhận"),
            Appointment.Status.CANCELLED: (Notification.Type.APPOINTMENT_CANCELLED, "Lịch hẹn đã hủy"),
            Appointment.Status.NO_SHOW: (Notification.Type.APPOINTMENT_NO_SHOW, "Cập nhật trạng thái lịch hẹn"),
        }
        for appointment in Appointment.objects.filter(public_code__startswith="DV-DEMO-").select_related("patient_profile__user", "branch"):
            event = (
                (Notification.Type.APPOINTMENT_RESCHEDULED, "Lịch hẹn đã được dời")
                if appointment.rescheduled_from_id
                else appointment_types.get(appointment.status)
            )
            if event:
                notification_type, title = event
                Notification.objects.get_or_create(
                    event_key=f"demo:appointment:{appointment.public_code}:{appointment.status.lower()}",
                    defaults={
                        "recipient": appointment.patient_profile.user,
                        "type": notification_type,
                        "title": title,
                        "body": f"{appointment.branch.name} · {appointment.service_name_snapshot}",
                        "payload": {"appointment_code": appointment.public_code},
                        "resource_type": "Appointment",
                        "resource_id": appointment.public_code,
                    },
                )
        for invoice in Invoice.objects.filter(appointment__public_code__startswith="DV-DEMO-").exclude(status=Invoice.Status.VOID).select_related("patient_profile__user"):
            if invoice.status not in {Invoice.Status.ISSUED, Invoice.Status.PAID}:
                continue
            notification_type = Notification.Type.INVOICE_PAID if invoice.status == Invoice.Status.PAID else Notification.Type.INVOICE_ISSUED
            title = "Hóa đơn demo đã thanh toán" if invoice.status == Invoice.Status.PAID else "Hóa đơn demo đã phát hành"
            Notification.objects.get_or_create(
                event_key=f"demo:invoice:{invoice.invoice_number}:{invoice.status.lower()}",
                defaults={
                    "recipient": invoice.patient_profile.user,
                    "type": notification_type,
                    "title": title,
                    "body": f"Hóa đơn {invoice.invoice_number} · {invoice.total:,.0f} ₫",
                    "payload": {"invoice_id": invoice.pk},
                    "resource_type": "Invoice",
                    "resource_id": str(invoice.pk),
                },
            )
