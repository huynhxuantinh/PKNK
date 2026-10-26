# PKNK - Dental Clinic Chain

Frontend đặt lịch React chạy tại `http://127.0.0.1:5173/` với luồng chi nhánh → dịch vụ → slot → giữ và xác nhận lịch.

## API danh sách chi nhánh

- `GET /api/v1/branches/`
- `GET /api/v1/branches/{id_branch}/services/`: dịch vụ và bảng giá chi nhánh.
- `GET /api/v1/branches/{id_branch}/dentists/?service_id=1`: nha sĩ theo dịch vụ.
- Lọc bằng: `q`, `province_code`, `ward_code`, `service_id`, `dentist_id`, `open_now`.
- Tìm gần bằng: `latitude`, `longitude`, `radius_km` (tối đa 100 km).
- Phân trang bằng: `page`, `page_size` (tối đa 100 dòng).

Backend Django 6 + Django REST Framework + PostgreSQL/PostGIS cho hệ thống quản lý và đặt lịch chuỗi phòng khám nha khoa.

## Chạy bằng Docker

Yêu cầu: Docker Desktop đang chạy.

```powershell
cd C:\Users\ASUS\OneDrive\Documents\PKNK
Copy-Item .env.example .env   # bỏ qua nếu đã có .env
# Sửa DJANGO_SECRET_KEY, DB_PASSWORD và các secret dịch vụ trong .env
docker compose up --build -d
docker compose ps
docker compose exec web python manage.py createsuperuser
```

Khi triển khai production, đặt `DJANGO_SETTINGS_MODULE=config.settings.production`,
`REDIS_CACHE_URL` trỏ tới Redis dùng chung và `DRF_NUM_PROXIES` đúng bằng số reverse
proxy tin cậy phía trước Django. Không commit `.env`; file này chứa khóa Django, mật khẩu
database, SMTP và object storage.

Image backend mặc định chạy Gunicorn và tự chạy `collectstatic` trước khi khởi động.
WhiteNoise phục vụ `/static/`; reverse proxy phía trước chịu trách nhiệm TLS và chuyển
tiếp request. `compose.yaml` chỉ dành cho local/dev nên ghi đè về Django `runserver`.

Tạo dữ liệu demo (có thể chạy lại, không nhân bản dữ liệu):

```powershell
docker compose exec web python manage.py seed_demo
```

## Tài khoản demo

Chạy `seed_demo` trước khi đăng nhập. Tất cả tài khoản dưới đây dùng chung mật
khẩu **`Demo123!`** (chỉ dùng cho môi trường demo/local).

| Vai trò | Họ tên | Email |
| --- | --- | --- |
| Bệnh nhân | Nguyễn Minh Anh | `patient@demo.pknk.vn` |
| Quản trị toàn hệ thống | Quản trị PKNK Dental | `admin@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Sài Gòn | `branch.admin.q1@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental An Khánh | `branch.admin.td@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Cầu Kiệu | `branch.admin.pn@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Bàn Cờ | `branch.admin.q3@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental An Đông | `branch.admin.q5@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Tân Thuận | `branch.admin.q7@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Thạnh Mỹ Tây | `branch.admin.bt@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Thông Tây Hội | `branch.admin.gv@demo.pknk.vn` |
| Quản lý chi nhánh | Quản lý PKNK Dental Bảy Hiền | `branch.admin.tb@demo.pknk.vn` |
| Nha sĩ | BS. Nguyễn Hoàng Minh | `minh.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Trần Ngọc Lan | `lan.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Lê Quốc Huy | `huy.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Phạm Thùy An | `an.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Đặng Minh Thảo | `thao.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Vũ Anh Khoa | `khoa.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Nguyễn Quỳnh Như | `nhu.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Trương Quốc Phong | `phong.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Lê Thanh Mai | `mai.dentist@demo.pknk.vn` |
| Nha sĩ | BS. Phan Hoàng Sơn | `son.dentist@demo.pknk.vn` |

Sau đăng nhập, bệnh nhân vào trang chủ; nha sĩ vào màn hình chọn chi nhánh làm
việc; quản trị và quản lý chi nhánh vào khu vực quản lý.

- API health: `http://127.0.0.1:8000/api/health/`
- React đặt lịch: `http://127.0.0.1:5173/`
- Swagger: `http://127.0.0.1:8000/api/docs/`
- Admin: `http://127.0.0.1:8000/admin/`
- MinIO console: `http://127.0.0.1:9001/`
- PostgreSQL từ máy host: `127.0.0.1:5433`

Xem log và dừng hệ thống:

```powershell
docker compose logs -f web
docker compose down
```

`docker compose down` giữ lại dữ liệu. Chỉ dùng `docker compose down -v` khi muốn xóa cả database Docker.

## Backup và kiểm tra restore database

```powershell
$backup = .\scripts\backup_database.ps1
.\scripts\restore_verify_database.ps1 -BackupPath $backup.BackupPath
```

Backup dùng PostgreSQL custom format và SHA-256. Restore chỉ được phép vào database kiểm thử có tiền tố `pknk_restore_`; script đối chiếu số bản ghi, schema, migration và PostGIS extension với database nguồn.

## Các dịch vụ

- `frontend`: React/Vite, proxy API sang Django trong Docker.

## Deploy frontend

Frontend production được phục vụ bằng Nginx và đã có CSP, chống nhúng trang,
`nosniff`, `Referrer-Policy` và `Permissions-Policy`. Build image bằng:

```bash
docker build -f frontend/Dockerfile -t dentavie-frontend frontend
```

Đặt TLS/HSTS ở reverse proxy hoặc nền tảng deploy phía trước container. CSP chỉ
cho phép API cùng origin, tile bản đồ HTTPS và dịch vụ định tuyến OSRM.
- `web`: Django API; tự chạy migration khi khởi động.
- `db`: PostgreSQL 16 + PostGIS 3.4.
- `redis`: broker/result backend của Celery.
- `minio`: kho S3 private cho ảnh X-quang và tài liệu bệnh án.
- `storage-init`: tự tạo bucket private và bật versioning.
- `worker`: xử lý tác vụ nền.
- `beat`: quét chỗ giữ lịch hết hạn mỗi phút.

## API đặt lịch

- `GET /api/v1/scheduling/slots/?branch_service_id=1&date=2026-10-10`
- `POST /api/v1/scheduling/appointments/holds/`
- `POST /api/v1/scheduling/appointments/{public_code}/confirm/`

## Patient appointment API

- `GET /api/v1/patients/me/appointments/?scope=UPCOMING|HISTORY`
- `GET /api/v1/patients/me/appointments/{public_code}/`
- `POST /api/v1/patients/me/appointments/{public_code}/cancel/`
- `POST /api/v1/patients/me/appointments/{public_code}/reschedule/`

Patients can only cancel or reschedule their own `PENDING` or `CONFIRMED`
appointments before the organization cutoff, which defaults to 24 hours.

Khi tạo chỗ giữ, hệ thống tự chọn nha sĩ nếu không truyền `dentist_id`, đồng thời luôn tự chọn ghế/phòng.
Hồ sơ bệnh nhân luôn được xác định bằng tài khoản đang đăng nhập; API không nhận ID hồ sơ.

## API chi nhánh

- `GET /api/v1/branches/{id_branch}/`: xem chi tiết chi nhánh công khai.

Response gồm địa chỉ, tọa độ bản đồ, giờ mở cửa, ảnh, dịch vụ/giá và nha sĩ đang hoạt động tại chi nhánh.

## API hồ sơ bệnh nhân

- `GET /api/v1/patients/me/`: xem hồ sơ cá nhân.
- `PATCH /api/v1/patients/me/`: sửa họ tên, ngày sinh, giới tính, SĐT và địa chỉ.

Mỗi tài khoản chỉ có một hồ sơ bệnh nhân và chỉ thao tác trên hồ sơ của chính mình.

## API hồ sơ khám và file bệnh án

- Nha sĩ: `GET/POST /api/v1/dentist/me/clinical-encounters/{id}/attachments/`
- Nha sĩ: `GET/PATCH/DELETE /api/v1/dentist/me/clinical-attachments/{id}/`
- Nha sĩ: `GET /api/v1/dentist/me/clinical-attachments/{id}/download/`
- Bệnh nhân: `GET /api/v1/patients/me/clinical-encounters/`
- Bệnh nhân: `GET /api/v1/patients/me/clinical-encounters/{id}/`
- Bệnh nhân: `GET /api/v1/patients/me/clinical-attachments/{id}/download/`

Chấp nhận JPG, PNG, PDF và DICOM, tối đa 15 MB. File được lưu bằng tên ngẫu nhiên trong bucket private; API không trả storage key hoặc URL MinIO. Nha sĩ chỉ sửa/xóa file khi bệnh án còn `DRAFT`; bệnh nhân chỉ xem file của lượt khám `COMPLETED` có bệnh án `FINALIZED`. Mọi lượt xem và tải xuống đều được audit.

## API xác thực cho React

- `POST /api/v1/auth/register/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/refresh/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/auth/me/`
- `POST /api/v1/auth/email-verification/confirm/`
- `POST /api/v1/auth/email-verification/resend/`
- `POST /api/v1/auth/password-reset/request/`
- `POST /api/v1/auth/password-reset/confirm/`

Các API cần đăng nhập sử dụng header `Authorization: Bearer <access_token>`.
Sau khi đăng ký, hệ thống gửi link xác minh có hiệu lực 24 giờ. Tài khoản chưa xác minh vẫn đăng nhập được nhưng không thể giữ hoặc xác nhận lịch hẹn.

Link đặt lại mật khẩu có hiệu lực 60 phút và chỉ dùng một lần. API yêu cầu đặt lại luôn trả phản hồi chung, không tiết lộ email có tồn tại trong hệ thống. Đổi mật khẩu thành công sẽ vô hiệu các JWT đã cấp trước đó.

Môi trường phát triển dùng email console. Muốn gửi email thật, đổi `EMAIL_BACKEND` sang `django.core.mail.backends.smtp.EmailBackend` và cấu hình các biến `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` trong `.env`.

## Thanh toán payOS

Chỉ đặt `PAYOS_CLIENT_ID`, `PAYOS_API_KEY` và `PAYOS_CHECKSUM_KEY` thật trong
`.env` của môi trường chạy; không commit các giá trị này. Cập nhật
`PAYOS_RETURN_URL` và `PAYOS_CANCEL_URL` sang HTTPS của frontend khi deploy.
Sequence `order_code` được khởi tạo từ `202610260000000` để tách dải mã của
PKNK khỏi các hệ thống khác có thể dùng chung tài khoản payOS.

- Bệnh nhân tạo link: `POST /api/v1/patients/me/invoices/{id}/payos/`.
- Webhook công khai: `POST /api/v1/payments/payos/webhook/`.
- URL webhook production phải là HTTPS và truy cập được từ Internet, ví dụ
  `https://api.example.com/api/v1/payments/payos/webhook/`.

Đăng ký URL đó trong kênh thanh toán payOS hoặc gọi `webhooks.confirm(...)`
bằng SDK ở môi trường đã nạp biến bí mật. Không coi query redirect là kết quả
thanh toán; hệ thống chỉ ghi nhận sau webhook hợp lệ hoặc tác vụ đối soát.
