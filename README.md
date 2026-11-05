# DentaVie — Quản lý chuỗi phòng khám nha khoa

DentaVie là ứng dụng quản lý phòng khám và đặt lịch khám trực tuyến. Backend dùng Django REST Framework, PostgreSQL/PostGIS, Redis và Celery; frontend dùng React, TypeScript và Vite.

## Mục lục

- [Cấu trúc repository](#cấu-trúc-repository)
- [Chạy local bằng Docker](#chạy-local-bằng-docker)
- [Tài khoản và dữ liệu demo](#tài-khoản-và-dữ-liệu-demo)
- [Frontend](#chạy-riêng-frontend)
- [API và kiểm tra](#kiểm-tra-và-tài-liệu-api)
- [Production](#production)
- [Backup](#backup-và-khôi-phục-kiểm-thử)
- [Email và PayOS](#tích-hợp-thanh-toán-và-email)

## Cấu trúc repository

| Thư mục / file | Nội dung |
| --- | --- |
| `backend/` | Django API, nghiệp vụ và test |
| `frontend/` | Ứng dụng React/Vite |
| `docker/` | Cấu hình container và Caddy |
| `scripts/` | Sao lưu, kiểm tra khôi phục và kiểm tra container |
| `plans/` | Tài liệu kế hoạch và baseline dữ liệu |
| `backups/` | Database dump local; không được Git theo dõi |
| `openapi.yml` | Đặc tả API OpenAPI |
| `compose*.yaml` | Cấu hình Docker Compose cho local và production |

## Chạy local bằng Docker

Cần cài Docker Desktop. Tại thư mục repository:

```powershell
Copy-Item .env.example .env # bỏ qua nếu đã có .env
# Điền các secret và cấu hình cần thiết trong .env
docker compose up --build -d
docker compose ps
```

Compose local khởi chạy frontend, Django, PostgreSQL/PostGIS, Redis, MinIO và Celery. Frontend chạy tại `http://127.0.0.1:5173`; API tại `http://127.0.0.1:8000`.

```powershell
docker compose logs -f web
docker compose exec web python manage.py createsuperuser
docker compose exec web python manage.py seed_demo
```

`docker compose down` giữ dữ liệu trong volume. Chỉ dùng `docker compose down -v` khi chủ động muốn xóa database, Redis, MinIO và các volume local. Không commit `.env` hoặc `.env.production`.

Muốn dừng ứng dụng:

```powershell
docker compose down
```

### Chạy riêng frontend

```powershell
cd frontend
npm ci
npm run dev
```

Các lệnh frontend: `npm run build`, `npm run lint`, `npm test` và `npm run preview`.

## Tài khoản và dữ liệu demo

Chạy `seed_demo` để tạo tài khoản cơ bản; chạy thêm `seed_full_demo` để tạo đủ nha sĩ theo dịch vụ và chi nhánh trước khi đăng nhập. Mật khẩu chung: **`Demo123!`** (chỉ dùng local/demo).

Danh sách trên dành cho database local được tạo bằng lệnh seed. Tài khoản trên Neon có mật khẩu riêng; sau khi cấu hình Django trỏ đúng database Neon, đổi mật khẩu bằng `python manage.py changepassword <email>`. Không lưu mật khẩu Neon hoặc thông tin đăng nhập đang hoạt động trong README hay Git.

- **Bệnh nhân:** `patient@demo.pknk.vn`, `patient2@demo.pknk.vn`
- **Quản trị toàn hệ thống:** `admin@demo.pknk.vn`
- **Quản lý chi nhánh:**

  | Chi nhánh | Email đăng nhập |
  | --- | --- |
  | DentaVie Sài Gòn | `branch.admin.q1@demo.pknk.vn` |
  | DentaVie An Khánh | `branch.admin.td@demo.pknk.vn` |
  | DentaVie Cầu Kiệu | `branch.admin.pn@demo.pknk.vn` |
  | DentaVie Bàn Cờ | `branch.admin.q3@demo.pknk.vn` |
  | DentaVie An Đông | `branch.admin.q5@demo.pknk.vn` |
  | DentaVie Tân Thuận | `branch.admin.q7@demo.pknk.vn` |
  | DentaVie Thạnh Mỹ Tây | `branch.admin.bt@demo.pknk.vn` |
  | DentaVie Thông Tây Hội | `branch.admin.gv@demo.pknk.vn` |
  | DentaVie Bảy Hiền | `branch.admin.tb@demo.pknk.vn` |
`seed_full_demo` tạo tổng cộng 31 tài khoản nha sĩ: 10 nha sĩ nền và 21 nha sĩ bổ sung theo chi nhánh/chuyên môn để phủ các dịch vụ. Tài khoản demo dùng chung mật khẩu `Demo123!` trên database local. Danh sách:

| STT | Họ tên | Email | Nhóm |
| ---: | --- | --- | --- |
| 1 | BS. Nguyễn Hoàng Minh | `minh.dentist@demo.pknk.vn` | Nền |
| 2 | BS. Trần Ngọc Lan | `lan.dentist@demo.pknk.vn` | Nền |
| 3 | BS. Lê Quốc Huy | `huy.dentist@demo.pknk.vn` | Nền |
| 4 | BS. Phạm Thùy An | `an.dentist@demo.pknk.vn` | Nền |
| 5 | BS. Đặng Minh Thảo | `thao.dentist@demo.pknk.vn` | Nền |
| 6 | BS. Vũ Anh Khoa | `khoa.dentist@demo.pknk.vn` | Nền |
| 7 | BS. Nguyễn Quỳnh Như | `nhu.dentist@demo.pknk.vn` | Nền |
| 8 | BS. Trương Quốc Phong | `phong.dentist@demo.pknk.vn` | Nền |
| 9 | BS. Lê Thanh Mai | `mai.dentist@demo.pknk.vn` | Nền |
| 10 | BS. Phan Hoàng Sơn | `son.dentist@demo.pknk.vn` | Nền |
| 11 | BS. Nguyễn Minh Anh | `staff.bt.implant@demo.pknk.vn` | Bổ sung |
| 12 | BS. Trần Quốc Bảo | `staff.bt.orthodontics@demo.pknk.vn` | Bổ sung |
| 13 | BS. Lê Ngọc Hân | `staff.bt.root_canal@demo.pknk.vn` | Bổ sung |
| 14 | BS. Phạm Hoàng Nam | `staff.gv.cosmetic@demo.pknk.vn` | Bổ sung |
| 15 | BS. Võ Thị Thanh Trúc | `staff.gv.implant@demo.pknk.vn` | Bổ sung |
| 16 | BS. Huỳnh Gia Huy | `staff.gv.orthodontics@demo.pknk.vn` | Bổ sung |
| 17 | BS. Đặng Thảo Nguyên | `staff.pn.cosmetic@demo.pknk.vn` | Bổ sung |
| 18 | BS. Bùi Đức Anh | `staff.pn.orthodontics@demo.pknk.vn` | Bổ sung |
| 19 | BS. Nguyễn Khánh Linh | `staff.q1.implant@demo.pknk.vn` | Bổ sung |
| 20 | BS. Trương Minh Khang | `staff.q3.implant@demo.pknk.vn` | Bổ sung |
| 21 | BS. Phan Bảo Ngọc | `staff.q3.orthodontics@demo.pknk.vn` | Bổ sung |
| 22 | BS. Lý Thành Đạt | `staff.q3.pediatric@demo.pknk.vn` | Bổ sung |
| 23 | BS. Đỗ Phương Thảo | `staff.q5.cosmetic@demo.pknk.vn` | Bổ sung |
| 24 | BS. Nguyễn Anh Tuấn | `staff.q5.orthodontics@demo.pknk.vn` | Bổ sung |
| 25 | BS. Trần Mỹ Duyên | `staff.q5.pediatric@demo.pknk.vn` | Bổ sung |
| 26 | BS. Lê Hoàng Phúc | `staff.q7.cosmetic@demo.pknk.vn` | Bổ sung |
| 27 | BS. Phạm Quỳnh Như | `staff.q7.implant@demo.pknk.vn` | Bổ sung |
| 28 | BS. Võ Nhật Minh | `staff.q7.root_canal@demo.pknk.vn` | Bổ sung |
| 29 | BS. Huỳnh Ngọc Diệp | `staff.tb.implant@demo.pknk.vn` | Bổ sung |
| 30 | BS. Đặng Quốc Hưng | `staff.tb.pediatric@demo.pknk.vn` | Bổ sung |
| 31 | BS. Bùi Thanh Hằng | `staff.tb.root_canal@demo.pknk.vn` | Bổ sung |

### Tạo bộ dữ liệu demo đầy đủ

`seed_full_demo` bổ sung dữ liệu bệnh nhân, lịch hẹn, bệnh án, kế hoạch điều trị, hóa đơn và ảnh chi nhánh minh họa. Tên chi nhánh theo mẫu `DentaVie + tên phường`, ví dụ `DentaVie Cầu Kiệu`. Lệnh chạy được nhiều lần mà không tạo bản ghi trùng. Mặc định tạo 40 bệnh nhân và 100 lịch hẹn; có thể điều chỉnh trong khoảng 30–50 bệnh nhân và 80–150 lịch hẹn.

```powershell
$env:DJANGO_SETTINGS_MODULE = 'config.settings.development'
$env:PYTHONIOENCODING = 'utf-8'
.\.venv\Scripts\python.exe backend\manage.py seed_full_demo --dry-run --media-dir .\media\img
.\.venv\Scripts\python.exe backend\manage.py seed_full_demo --patients 40 --appointments 100 --seed 42 --media-dir .\media\img
```

Chạy từ repository root trên database local đã cấu hình; kiểm tra `--dry-run` trước. `--dry-run` không ghi database hoặc file. Ảnh nguồn giữ nguyên; ảnh cơ sở/tư vấn phù hợp được tối ưu vào `frontend/public/images/demo/branches/`, kèm ghi công nguồn. Ảnh stock không được gắn vào bệnh án. Lệnh không tạo giao dịch PayOS và không gửi email. `--reset-demo` hiện bị từ chối vì lịch sử lịch hẹn, bệnh án và hóa đơn có ràng buộc append-only/immutable; hãy dựng database local/test mới nếu cần bộ dữ liệu sạch.

### Snapshot dữ liệu local

Database Docker local `pknk` hiện đã được làm mới và seed:

- 9 chi nhánh và 11 dịch vụ.
- 31 nha sĩ, gồm 21 tài khoản bổ sung để phủ dịch vụ theo chi nhánh.
- 40 bệnh nhân, 100 lịch hẹn, 61 bệnh án và 12 kế hoạch điều trị.
- 32 hóa đơn và 20 khoản thanh toán tiền mặt.
- Cả 99 cặp dịch vụ–chi nhánh đang hoạt động đều có nha sĩ đủ chuyên môn, phân công và ca trực.

Có 9 ảnh chi nhánh minh họa trong `frontend/public/images/demo/branches/` cùng nguồn ảnh tại `ATTRIBUTION.md`. Không có giao dịch PayOS hoặc file đính kèm bệnh án demo vì thư mục nguồn không có ảnh X-quang phù hợp.

> **Lưu ý dữ liệu:** Không chạy seed lên Neon production. Nếu cần xóa database local, xác minh đúng container và kiểm tra backup PostgreSQL trước. `flush` không xóa object MinIO; chỉ dọn MinIO local sau khi sao lưu. Không xóa ảnh nguồn trong `media/img`.

Muốn dùng Neon cho demo, tạo database riêng có tên chứa `demo` hoặc `seed`, xác minh không có dữ liệu ngoài demo rồi mới dùng `--allow-remote-demo-seed`. Ảnh công khai cần được đưa vào build Cloudflare Pages; file bệnh án riêng tư lưu ở R2, không thay bằng ảnh stock.

## Kiểm tra và tài liệu API

```powershell
docker compose exec web python manage.py test apps
docker compose exec web python manage.py makemigrations --check --dry-run
```

Tài liệu API tương tác trong development: `http://127.0.0.1:8000/api/docs/`. Đặc tả đầy đủ nằm ở [`openapi.yml`](openapi.yml). API health: `http://127.0.0.1:8000/api/health/`; Django Admin: `http://127.0.0.1:8000/admin/`; MinIO console: `http://127.0.0.1:9001/`.

Các nhóm API chính gồm xác thực, chi nhánh/dịch vụ, đặt và quản lý lịch, hồ sơ bệnh nhân, bệnh án và tệp đính kèm, hóa đơn và thanh toán. API yêu cầu đăng nhập dùng `Authorization: Bearer <access_token>`. Quyền truy cập hồ sơ được giới hạn theo bệnh nhân, nha sĩ và phạm vi chi nhánh.

## Production

Sao chép `.env.production.example` thành `.env.production`, thay toàn bộ giá trị mẫu và cấu hình tên miền/DNS trước khi chạy. Cổng 80 và 443 cần truy cập được để Caddy cấp HTTPS.

```bash
docker compose --env-file .env.production -f compose.production.yaml up -d --build
docker compose --env-file .env.production -f compose.production.yaml ps
```

Production dùng Caddy, Nginx, Gunicorn, Celery worker/beat, PostgreSQL/PostGIS, Redis và MinIO. Chỉ Caddy mở cổng ra host; dữ liệu database và MinIO nằm trong Docker volumes. Sao lưu định kỳ và giữ các khóa Django, database, SMTP, MinIO và PayOS trong secret/environment của máy chủ. Không dùng tài khoản demo hoặc secret mẫu ở production. API docs chỉ bật trong development.

## Backup và khôi phục kiểm thử

```powershell
$backup = .\scripts\backup_database.ps1
.\scripts\restore_verify_database.ps1 -BackupPath $backup.BackupPath
```

Script khôi phục chỉ chấp nhận database kiểm thử có tiền tố `pknk_restore_`. Các file dump trong `backups/` chứa dữ liệu và được Git bỏ qua; không xóa nếu chưa xác nhận bản sao lưu khác đã an toàn.

## Tích hợp thanh toán và email

Local mặc định ghi email vào console. Muốn gửi email thật, cấu hình SMTP trong `.env`. Chỉ cấu hình thông tin PayOS thật trong secret của môi trường chạy; dùng URL HTTPS cho `PAYOS_RETURN_URL`, `PAYOS_CANCEL_URL` và webhook. Webhook công khai là `POST /api/v1/payments/payos/webhook/`. Chỉ webhook hợp lệ hoặc quy trình đối soát mới xác nhận thanh toán; không dựa vào URL redirect để đánh dấu hóa đơn đã thanh toán.
