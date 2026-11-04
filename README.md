# DentaVie — Quản lý chuỗi phòng khám nha khoa

DentaVie là ứng dụng quản lý phòng khám và đặt lịch khám trực tuyến. Backend dùng Django REST Framework, PostgreSQL/PostGIS, Redis và Celery; frontend dùng React, TypeScript và Vite.

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
docker compose down
```

`docker compose down` giữ dữ liệu trong volume. Chỉ dùng `docker compose down -v` khi chủ động muốn xóa database, Redis, MinIO và các volume local. Không commit `.env` hoặc `.env.production`.

### Chạy riêng frontend

```powershell
cd frontend
npm ci
npm run dev
```

Các lệnh frontend: `npm run build`, `npm run lint`, `npm test` và `npm run preview`.

## Tài khoản demo

Chạy `seed_demo` để tạo tài khoản cơ bản; chạy thêm `seed_full_demo` để tạo đủ nha sĩ theo dịch vụ và chi nhánh trước khi đăng nhập. Mật khẩu chung: **`Demo123!`** (chỉ dùng local/demo).

| Vai trò | Email |
| --- | --- |
| Bệnh nhân | `patient@demo.pknk.vn`, `patient2@demo.pknk.vn` |
| Quản trị toàn hệ thống | `admin@demo.pknk.vn` |
| Quản lý chi nhánh | `branch.admin.q1@demo.pknk.vn`, `branch.admin.td@demo.pknk.vn`, `branch.admin.pn@demo.pknk.vn`, `branch.admin.q3@demo.pknk.vn`, `branch.admin.q5@demo.pknk.vn`, `branch.admin.q7@demo.pknk.vn`, `branch.admin.bt@demo.pknk.vn`, `branch.admin.gv@demo.pknk.vn`, `branch.admin.tb@demo.pknk.vn` |
| Nha sĩ | `minh.dentist@demo.pknk.vn`, `lan.dentist@demo.pknk.vn`, `huy.dentist@demo.pknk.vn`, `an.dentist@demo.pknk.vn`, `thao.dentist@demo.pknk.vn`, `khoa.dentist@demo.pknk.vn`, `nhu.dentist@demo.pknk.vn`, `phong.dentist@demo.pknk.vn`, `mai.dentist@demo.pknk.vn`, `son.dentist@demo.pknk.vn` |

`seed_full_demo` bổ sung nha sĩ theo chi nhánh và chuyên môn khi thiếu người phụ trách dịch vụ. Email có dạng `staff.<mã-chi-nhánh>.<mã-chuyên-môn>@demo.pknk.vn` (ví dụ: `staff.q5.pediatric@demo.pknk.vn`); các tài khoản demo dùng chung mật khẩu `Demo123!`.

Danh sách 21 nha sĩ được bổ sung trong database local:

| Họ tên | Email |
| --- | --- |
| BS. Nguyễn Minh Anh | `staff.bt.implant@demo.pknk.vn` |
| BS. Trần Quốc Bảo | `staff.bt.orthodontics@demo.pknk.vn` |
| BS. Lê Ngọc Hân | `staff.bt.root_canal@demo.pknk.vn` |
| BS. Phạm Hoàng Nam | `staff.gv.cosmetic@demo.pknk.vn` |
| BS. Võ Thị Thanh Trúc | `staff.gv.implant@demo.pknk.vn` |
| BS. Huỳnh Gia Huy | `staff.gv.orthodontics@demo.pknk.vn` |
| BS. Đặng Thảo Nguyên | `staff.pn.cosmetic@demo.pknk.vn` |
| BS. Bùi Đức Anh | `staff.pn.orthodontics@demo.pknk.vn` |
| BS. Nguyễn Khánh Linh | `staff.q1.implant@demo.pknk.vn` |
| BS. Trương Minh Khang | `staff.q3.implant@demo.pknk.vn` |
| BS. Phan Bảo Ngọc | `staff.q3.orthodontics@demo.pknk.vn` |
| BS. Lý Thành Đạt | `staff.q3.pediatric@demo.pknk.vn` |
| BS. Đỗ Phương Thảo | `staff.q5.cosmetic@demo.pknk.vn` |
| BS. Nguyễn Anh Tuấn | `staff.q5.orthodontics@demo.pknk.vn` |
| BS. Trần Mỹ Duyên | `staff.q5.pediatric@demo.pknk.vn` |
| BS. Lê Hoàng Phúc | `staff.q7.cosmetic@demo.pknk.vn` |
| BS. Phạm Quỳnh Như | `staff.q7.implant@demo.pknk.vn` |
| BS. Võ Nhật Minh | `staff.q7.root_canal@demo.pknk.vn` |
| BS. Huỳnh Ngọc Diệp | `staff.tb.implant@demo.pknk.vn` |
| BS. Đặng Quốc Hưng | `staff.tb.pediatric@demo.pknk.vn` |
| BS. Bùi Thanh Hằng | `staff.tb.root_canal@demo.pknk.vn` |

### Tạo bộ dữ liệu demo đầy đủ

`seed_full_demo` bổ sung dữ liệu bệnh nhân, lịch hẹn, bệnh án, kế hoạch điều trị, hóa đơn và ảnh chi nhánh minh họa. Tên chi nhánh theo mẫu `DentaVie + tên phường`, ví dụ `DentaVie Cầu Kiệu`. Lệnh chạy được nhiều lần mà không tạo bản ghi trùng. Mặc định tạo 40 bệnh nhân và 100 lịch hẹn; có thể điều chỉnh trong khoảng 30–50 bệnh nhân và 80–150 lịch hẹn.

```powershell
$env:DJANGO_SETTINGS_MODULE = 'config.settings.development'
$env:PYTHONIOENCODING = 'utf-8'
.\.venv\Scripts\python.exe backend\manage.py seed_full_demo --dry-run --media-dir .\media\img
.\.venv\Scripts\python.exe backend\manage.py seed_full_demo --patients 40 --appointments 100 --seed 42 --media-dir .\media\img
```

Chạy từ repository root trên database local đã cấu hình; kiểm tra `--dry-run` trước. `--dry-run` không ghi database hoặc file. Ảnh nguồn giữ nguyên; ảnh cơ sở/tư vấn phù hợp được tối ưu vào `frontend/public/images/demo/branches/`, kèm ghi công nguồn. Ảnh stock không được gắn vào bệnh án. Lệnh không tạo giao dịch PayOS và không gửi email. `--reset-demo` hiện bị từ chối vì lịch sử lịch hẹn, bệnh án và hóa đơn có ràng buộc append-only/immutable; hãy dựng database local/test mới nếu cần bộ dữ liệu sạch.

Database Docker local `pknk` hiện đã được làm mới và seed: 9 chi nhánh, 11 dịch vụ, 31 nha sĩ (gồm 21 tài khoản bổ sung theo chi nhánh), 40 bệnh nhân, 100 lịch hẹn đủ trạng thái, 61 bệnh án, 12 kế hoạch điều trị, 32 hóa đơn và 20 payment tiền mặt. Không có giao dịch PayOS hoặc file đính kèm bệnh án demo vì thư mục nguồn không có ảnh X-quang phù hợp. Có 9 ảnh chi nhánh được tạo trong `frontend/public/images/demo/branches/` cùng `ATTRIBUTION.md`. Cả 99 cặp dịch vụ-chi nhánh hoạt động đều có nha sĩ đủ chuyên môn, được phân công và có ca trực.

Muốn xóa toàn bộ database local trước khi seed lại, trước tiên xác minh đúng container/database Docker local và tạo rồi kiểm tra backup PostgreSQL. `flush` xóa mọi bản ghi trong database, gồm tài khoản, hóa đơn và lịch sử; không dùng trên Neon/production. `flush` không xóa object MinIO: nếu cần dọn file cũ, hãy sao lưu riêng và chỉ thao tác trên MinIO local đã xác minh. Không xóa file nguồn trong `media/img`.

Không chạy lệnh seed lên Neon production. Để chuẩn bị dữ liệu cho Neon demo, dùng database riêng mới có tên chứa `demo` hoặc `seed`, xác minh database không có tài khoản/lịch/hóa đơn ngoài demo, rồi mới cấp quyền remote bằng `--allow-remote-demo-seed`. Ảnh công khai cần được đưa vào build Cloudflare Pages; tệp đính kèm bệnh án riêng tư thuộc storage backend R2 và không được thay bằng ảnh stock.

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
