# Plan backend cho Organization Admin, Branch Admin và Dentist

## 1. Mục tiêu và phạm vi

Hoàn thiện backend Django REST Framework cho ba vai trò còn lại của hệ thống chuỗi phòng khám nha khoa:

- `ORGANIZATION_ADMIN`: quản trị toàn chuỗi.
- `BRANCH_ADMIN`: quản lý một hoặc nhiều chi nhánh qua nhiều `Membership`.
- `DENTIST`: quản lý lịch cá nhân và hồ sơ điều trị.

Plan này chạy theo **direct mode** vì workspace hiện không có Git repository và máy chưa có GitHub CLI. Mỗi bước phải hoàn thành migration, API, OpenAPI và test trước khi sang bước phụ thuộc tiếp theo.

### Quyết định nghiệp vụ đã khóa

- Không có đặt hộ, đặt nhờ, walk-in hoặc tạo bệnh nhân tại quầy.
- Không có hồ sơ người thân; một tài khoản bệnh nhân có đúng một `PatientProfile`.
- Chỉ có thông báo trên web và email; SMS, Zalo, push nằm ngoài phạm vi.
- Branch Admin có thể quản lý nhiều chi nhánh bằng nhiều `Membership`.
- Thời gian lưu UTC, hiển thị theo `Asia/Ho_Chi_Minh` hoặc timezone của organization.
- Hóa đơn từ `ISSUED` trở đi bất biến; sai thì `VOID` và lập hóa đơn mới.
- Payment chỉ `POSTED` hoặc `VOID`; không sửa trực tiếp.
- MVP không đặt cọc, hoàn tiền, công nợ hoặc trả góp.
- Branch Admin không được tự tạo lịch cho bệnh nhân; chỉ điều phối lịch đã tồn tại.

## 2. Hiện trạng code

### Đã có

- `Organization`, `Membership` và bốn role.
- Chi nhánh, giờ mở cửa, ngày nghỉ, ghế/phòng.
- Dịch vụ chung, dịch vụ/giá chi nhánh, nha sĩ ↔ dịch vụ.
- Ca làm, nghỉ phép, Appointment, lịch sử trạng thái và chống trùng nha sĩ/ghế.
- API auth, hồ sơ bệnh nhân, chi nhánh/dịch vụ/nha sĩ công khai, slot, giữ và xác nhận lịch.
- React cho luồng bệnh nhân: chi nhánh → dịch vụ → slot → đặt lịch.

### Chưa có

- Permission/query scope dùng chung cho ba role quản trị.
- API quản trị organization, branch, nhân sự, catalog, lịch và ghế.
- API calendar, check-in, no-show, hủy/dời lịch cho Branch Admin.
- API lịch cá nhân và quy trình khám cho Dentist.
- Model/API `clinical`, `billing`, `notifications`, `audit`.
- Báo cáo tổng hợp và báo cáo chi nhánh.

## 3. Ma trận quyền mục tiêu

| Tài nguyên/hành động | Organization Admin | Branch Admin | Dentist |
| --- | --- | --- | --- |
| Cấu hình organization | Đọc/cập nhật; CRUD branch | Không | Không |
| Chi nhánh/giờ mở cửa/ngày nghỉ | Mọi chi nhánh trong organization | Chỉ đọc chi nhánh được gán | Đọc qua API `dentist/me`, không gọi management API |
| Ghế/phòng | Mọi chi nhánh | CRUD chi nhánh được gán | Chỉ đọc |
| Danh mục dịch vụ chung | CRUD | Chỉ đọc | Chỉ đọc dịch vụ được cấp |
| Giá/dịch vụ tại chi nhánh | CRUD | CRUD chi nhánh được gán | Chỉ đọc |
| Nhân sự/membership | CRUD | Chỉ đọc nhân sự chi nhánh | Không |
| Ca làm/nghỉ phép | Mọi chi nhánh | CRUD chi nhánh được gán | Đọc lịch bản thân |
| Calendar lịch hẹn | Mọi chi nhánh | Chi nhánh được gán | Chỉ lịch bản thân |
| Xác nhận/hủy/dời/no-show | Mọi chi nhánh | Chi nhánh được gán | Không, trừ luồng khám |
| Check-in | Mọi chi nhánh | Chi nhánh được gán | Chỉ đọc |
| Bắt đầu/hoàn thành khám | Không thao tác chuyên môn | Không | Chỉ lịch được phân công |
| Bệnh án/đơn thuốc | Audit/read khi có thẩm quyền | Không sửa; đọc tối thiểu phục vụ vận hành | CRUD bản nháp của lượt khám được phân công |
| Hóa đơn/thanh toán | Mọi chi nhánh | Chi nhánh được gán | Chỉ đọc trạng thái |
| Báo cáo | Toàn organization | Chi nhánh được gán | Thống kê cá nhân cơ bản |

Mọi quyền đều yêu cầu `Membership.is_active=True`, `Organization.is_active=True`; quyền theo chi nhánh yêu cầu `Membership.branch_id` khớp tài nguyên.

## 4. Dependency graph

```text
Bước 0 Baseline + backup/restore
 └── Bước 1 RBAC + scope + audit/outbox nền
 ├── Bước 2 Organization/Branch configuration
 ├── Bước 3 Catalog + nhân sự
 └── Bước 4 Điều phối lịch Branch Admin
      ├── Bước 5a Dentist schedule/start
      │    └── Bước 6 Clinical/finalize
      │         └── Bước 5b Complete appointment
      │              └── Bước 7 Billing
      └────────────────────┘
                ├── Bước 8 Notifications
                └── Bước 9 Reports

Bước 2..9 ──> Bước 10 hardening + OpenAPI + integration tests
```

- Sau Bước 1, Bước 2 và Bước 3 có thể triển khai độc lập; Bước 4 cần cả Bước 2 và 3.
- Bước 4 cần scope/permission và dữ liệu từ Bước 2–3.
- Bước 5a chỉ mở lịch và bắt đầu khám; Bước 6 bổ sung/finalize bệnh án; Bước 5b mới cho `IN_PROGRESS → COMPLETED`.
- Bước 7 chỉ nhận appointment đã completed sau Bước 5b.
- Bước 8 và Bước 9 có thể làm song song sau khi các event/trạng thái chính ổn định.

## 5. Các bước triển khai

### Execution contract áp dụng cho mọi bước

- Đọc lại model/service hiện tại của app liên quan và file plan này trước khi sửa.
- Tạo migration bằng `makemigrations <app>`, review SQL bằng `sqlmigrate`, chạy trên database restore, sau đó mới chạy `migrate` development.
- Mỗi endpoint phải có serializer validation, scoped queryset, service transaction, audit/outbox nếu cần, throttle cho mutation và OpenAPI schema.
- Mỗi bước phải có test success + permission-negative + tenant/branch escape + state conflict; test service trực tiếp ngoài test API.
- Gate chung của từng bước:

```powershell
docker compose exec web python manage.py migrate
docker compose exec web python manage.py test <apps-của-bước> --settings=config.settings.test --noinput
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py spectacular --file /tmp/schema.yml --validate
```

- Expected result: exit code 0, không warning OpenAPI collision, không migration ngoài dự kiến và data-count/invariant sau migrate khớp snapshot.

### Bước 0 — Baseline, môi trường và backup/restore

**Mục tiêu:** mỗi migration được thử trên bản sao dữ liệu và luôn có đường phục hồi tiến về phía trước.

**Context thực thi:** cwd `C:\Users\ASUS\OneDrive\Documents\PKNK`; Docker Desktop phải chạy; `.env` được tạo từ `.env.example`; không dùng database production để chạy test.

**Công việc:**

1. Chạy baseline 79 backend tests và frontend test/build hiện tại.
2. Tạo PostgreSQL dump từ database development, restore vào database kiểm thử riêng và ghi lại lệnh trong README vận hành.
3. Ghi schema/migration hiện tại và số lượng bản ghi chính để so sánh sau migrate.
4. Quy ước mọi bước sau phải chạy `migrate` trên bản restore trước, kiểm tra dữ liệu rồi mới áp dụng môi trường chính.
5. Rollback production ưu tiên disable endpoint + forward migration; không reverse migration đã chứa clinical, billing hoặc audit data.

**Kiểm tra:**

```powershell
docker compose up -d
docker compose exec web python manage.py test --settings=config.settings.test --noinput
npm --prefix frontend test
npm --prefix frontend run build
New-Item -ItemType Directory -Force -Path .\backups
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/pknk-baseline.dump'
docker compose cp db:/tmp/pknk-baseline.dump .\backups\pknk-baseline.dump
docker compose exec db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists pknk_restore_test && createdb -U "$POSTGRES_USER" pknk_restore_test'
docker compose cp .\backups\pknk-baseline.dump db:/tmp/pknk-restore.dump
docker compose exec db sh -c 'pg_restore -U "$POSTGRES_USER" -d pknk_restore_test --clean --if-exists /tmp/pknk-restore.dump'
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d pknk_restore_test -c "SELECT COUNT(*) FROM appointments;"'
```

Không redirect custom-format dump qua PowerShell terminal. Tên `pknk_restore_test` là database kiểm thử riêng, tuyệt đối không thay bằng database development/production trong lệnh drop/restore.

**Exit criteria:** baseline xanh; thao tác dump/restore đã được chạy thử; có snapshot schema/data count.

**Rollback:** không thay schema ở bước này; xóa database restore dùng riêng cho kiểm thử nếu không còn cần.

---

### Bước 1 — RBAC, query scope và audit nền

**Mục tiêu:** mọi API quản trị có một cách kiểm tra quyền thống nhất, không lọt dữ liệu chéo organization/branch.

**Công việc:**

1. Tạo `apps/access_control/` hoặc module permissions dùng chung:
   - `HasOrganizationRole`.
   - `HasBranchRole`.
   - `organization_ids_for(user, role)`.
   - `branch_ids_for(user, roles)`.
   - helper kiểm tra organization admin được kế thừa quyền branch admin trong cùng organization.
2. Không dùng `user.role`; role chỉ lấy từ `Membership` đang hoạt động.
3. Mọi queryset phải scope từ request user trước, sau đó mới lookup object; tài nguyên ngoài scope trả `404` để tránh lộ tồn tại.
4. Tạo `AuditEvent`:
   - `id_audit_event`, actor user nullable, organization/branch nullable.
   - `action`, `resource_type`, `resource_id`, `access_type=READ|WRITE`.
   - `before_data`, `after_data`, IP, user agent, request/correlation ID, `created_at`.
5. Audit là append-only; thêm PostgreSQL trigger chặn `UPDATE/DELETE`.
6. Tạo `AuditService.record_read()` và `record_write()`; không ghi mật khẩu, token, nội dung file hoặc dữ liệu bí mật vào JSON.
7. Ghi audit cho đăng nhập thất bại/thành công, đọc hồ sơ sức khỏe, thay đổi lịch, hóa đơn và thanh toán.
8. Login audit cho phép actor/organization null; write audit được ghi trong cùng transaction nghiệp vụ, read audit chỉ lưu metadata allowlist.
9. Tạo outbox contract nền ngay bước này (`event_type`, aggregate ID, payload tối thiểu, unique idempotency key, occurred/processed timestamps); producer ở Bước 4–7 và worker delivery ở Bước 8.
10. Bổ sung scope check vào service hiện hữu, đặc biệt `AppointmentService` và các mutation scheduling; kiểm tra lại membership/user/organization sau khi khóa resource, không chỉ dựa vào check ở view.
11. Chỉ Organization Admin được đọc audit của organization qua endpoint phân trang/lọc; payload clinical/billing nhạy cảm phải redact. Branch Admin chỉ thấy audit vận hành thuộc branch nếu có endpoint riêng; Dentist không có audit-list API.

**Test bắt buộc:**

- Organization Admin A không đọc/sửa organization B.
- Branch Admin chi nhánh A không đọc/sửa chi nhánh B.
- Branch Admin nhiều chi nhánh truy cập được đúng tập hợp membership.
- Membership inactive bị từ chối ngay.
- Dentist không gọi được endpoint quản trị.
- Audit không update/delete được ở cả ORM và SQL.
- Test trực tiếp service để chứng minh không bypass RBAC khi không đi qua API; role tại tenant A không cấp quyền tenant B.

**Kiểm tra:**

```powershell
docker compose exec web python manage.py test apps.access_control apps.audit --settings=config.settings.test
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py spectacular --validate
```

**Exit criteria:** có test ma trận quyền và helper scope được mọi API mới sử dụng; không view nào tự viết kiểm tra role theo cách riêng.

**Rollback:** disable URL/API và dùng forward migration khi cần; không reverse/xóa `AuditEvent` hoặc outbox đã có dữ liệu; không thay cấu trúc `Membership` hiện tại.

---

### Bước 2 — Organization và cấu hình chi nhánh

**Mục tiêu:** Organization Admin quản lý cấu hình toàn chuỗi; Branch Admin xem cấu hình trong scope.

**Endpoint:**

- `GET/PATCH /api/v1/management/organizations/{id_organization}/`
- `GET/POST /api/v1/management/organizations/{id_organization}/branches/`
- `GET/PATCH /api/v1/management/branches/{id_branch}/`
- `GET/PUT /api/v1/management/branches/{id_branch}/opening-hours/`
- `GET/POST /api/v1/management/organizations/{id_organization}/holidays/`
- `PATCH/DELETE /api/v1/management/holidays/{id_holiday}/`
- `GET/POST /api/v1/management/branches/{id_branch}/chairs/`
- `PATCH /api/v1/management/chairs/{id_chair}/`

**Quy tắc:**

- Không hard-delete Branch/Chair đã được tham chiếu; dùng `is_active=false`.
- Validate `ward.province_id == province_id` và tọa độ SRID 4326.
- Opening hour cập nhật nguyên bộ 7 ngày trong transaction.
- Holiday cấp organization áp dụng toàn chuỗi; holiday cấp branch chỉ áp dụng branch đó.
- Không cho ngưng ghế đang giữ lịch active trong tương lai nếu chưa điều phối lịch.
- Đóng branch, đổi giờ mở cửa hoặc thêm holiday phải kiểm tra toàn bộ status đang chiếm slot (`HELD`, `PENDING`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`) trong tương lai và khóa cùng cơ chế booking để tránh race.
- Branch Admin chỉ đọc Branch/OpeningHour/Holiday, nhưng CRUD Chair trong branch được gán.

**Test:** scope chéo organization, tọa độ sai, ward/province sai, unique code, holiday trùng ngày, chair có appointment active.

**Exit criteria:** Organization Admin cấu hình đầy đủ dữ liệu cần cho slot engine; slot API phản ánh ngay giờ mở cửa/ngày nghỉ/ghế active.

**Verification/migration:** migration chỉ thêm constraint/index cần thiết; chạy migrate trên database restore, test `apps.locations` + management API, `makemigrations --check` và schema validation trước khi kết thúc bước.

**Rollback:** disable URL management; dữ liệu cấu hình hiện hữu vẫn tương thích API công khai.

---

### Bước 3 — Catalog, giá và nhân sự

**Mục tiêu:** quản lý dịch vụ chung, giá chi nhánh, tài khoản quản trị/nha sĩ và năng lực chuyên môn.

**Endpoint:**

- `GET/POST /api/v1/management/organizations/{id_organization}/services/`
- `GET/PATCH /api/v1/management/services/{id_service}/`
- `GET/POST /api/v1/management/branches/{id_branch}/services/`
- `PATCH /api/v1/management/branch-services/{id_branch_service}/`
- `GET/POST /api/v1/management/organizations/{id_organization}/memberships/`
- `PATCH /api/v1/management/memberships/{id_membership}/`
- `GET/POST /api/v1/management/organizations/{id_organization}/dentists/`
- `GET/PATCH /api/v1/management/dentists/{id_dentist}/`
- `PUT /api/v1/management/dentists/{id_dentist}/services/`
- `PUT /api/v1/management/dentists/{id_dentist}/branches/`

**Quy tắc:**

- Chỉ Organization Admin quản lý Service, Membership và Dentist.
- Branch Admin chỉ quản lý `BranchService` trong branch được gán; không được tự cấp role.
- Không tạo user trùng email; khi mời nhân sự, tạo user inactive/pending hoặc liên kết user hiện hữu bằng flow rõ ràng.
- Dùng invitation token một lần, có TTL và endpoint accept sau xác thực email; Org Admin không được sửa password, `is_staff`, `is_superuser` hoặc vô hiệu hóa global User đang thuộc tenant khác.
- Không cho vô hiệu hóa/hạ quyền Organization Admin cuối cùng của organization.
- Membership branch phải thuộc đúng organization.
- Dentist, Service, BranchService và Membership phải cùng organization.
- Nha sĩ chỉ xuất hiện trong slot khi đồng thời có DentistService + Membership tại branch + WorkShift active.
- Ngưng service/nha sĩ phải kiểm tra appointment active tương lai; không làm mất snapshot lịch cũ.
- Bỏ DentistService/Membership hoặc ngưng nha sĩ phải kiểm tra mọi status đang chiếm slot và dùng khóa tránh race với booking.
- MVP giữ giới hạn hiện tại `Dentist.user` one-to-one và mỗi Dentist thuộc một organization; hỗ trợ một user làm nha sĩ ở nhiều organization nằm ngoài scope và cần migration thiết kế riêng.

**Test:** mọi tổ hợp cross-organization, duplicate membership, dentist nhiều branch, Branch Admin không nâng quyền bản thân.

**Exit criteria:** API công khai dịch vụ/nha sĩ và slot engine chỉ đọc được cấu hình hợp lệ do admin tạo.

**Verification/migration:** test `apps.organizations`, `apps.catalog`, invitation/security và slot regression trên database restore; chạy migrate, `makemigrations --check` và schema validation.

**Rollback:** deactivate record thay vì xóa; migration chỉ thêm index/constraint nếu cần.

---

### Bước 4 — Branch Admin: ca làm, calendar và điều phối lịch

**Mục tiêu:** Branch Admin vận hành lịch tại các branch được cấp quyền mà không tạo lịch hộ.

**Endpoint:**

- `GET/POST /api/v1/management/branches/{id_branch}/work-shifts/`
- `PATCH /api/v1/management/work-shifts/{id_work_shift}/`
- `GET/POST /api/v1/management/branches/{id_branch}/time-offs/`
- `PATCH /api/v1/management/time-offs/{id_time_off}/`
- `GET /api/v1/management/branches/{id_branch}/appointments/?date_from=&date_to=&status=&dentist_id=`
- `GET /api/v1/management/appointments/{public_code}/`
- `POST /api/v1/management/appointments/{public_code}/confirm/`
- `POST /api/v1/management/appointments/{public_code}/check-in/`
- `POST /api/v1/management/appointments/{public_code}/cancel/`
- `POST /api/v1/management/appointments/{public_code}/no-show/`
- `POST /api/v1/management/appointments/{public_code}/reschedule/`

**Quy tắc trạng thái:**

- `PENDING → CONFIRMED`: Branch Admin hoặc Organization Admin.
- `CONFIRMED → CHECKED_IN`: Branch Admin hoặc Organization Admin.
- `CONFIRMED → NO_SHOW`: chỉ sau `starts_at + no_show_grace_minutes`.
- Hủy bắt buộc `reason`, lưu `cancelled_by` và audit.
- Dời lịch chỉ áp dụng từ `PENDING|CONFIRMED` và luôn **tạo appointment kế nhiệm**, không update thời gian lịch cũ. Vì exclusion constraint hiện không deferred, một transaction phải: khóa lịch gốc → kiểm tra slot bằng query loại trừ chính lịch gốc → chuyển lịch gốc `CANCELLED` → tạo lịch kế nhiệm/liên kết `rescheduled_from` → ghi history/audit. Lỗi bất kỳ rollback cả việc hủy lịch gốc.
- Reschedule có idempotency key để không tạo hai lịch kế nhiệm; MVP không đổi service và không đổi branch, nên giữ nguyên snapshot/service/giá booking. Đổi branch hoặc service là ngoài MVP.
- Dời lịch giữ nguyên bệnh nhân; đây không phải đặt hộ và không cho truyền `patient_id`.
- Không có endpoint `POST /appointments/` cho admin. `TimeOff.branch=null` chỉ Organization Admin được tạo/sửa; Branch Admin không thể chuyển branch thành null hoặc chuyển sang branch ngoài scope.
- Thay WorkShift/TimeOff không được làm lịch ở mọi status đang chiếm slot biến mất âm thầm; trả conflict và danh sách lịch ảnh hưởng.
- Slot engine phải loại nha sĩ đang bận ở **bất kỳ branch nào**, không chỉ branch đang tìm. Thêm test hai booking đồng thời ở hai branch cho cùng nha sĩ.
- Ma trận phải định nghĩa thêm trường hợp `CHECKED_IN` nhưng bệnh nhân rời đi: Branch Admin không dùng `NO_SHOW`; chỉ hủy có lý do hoặc Dentist tiếp tục workflow theo chính sách đã chốt.

**Calendar response:** trả khoảng UTC, timezone, patient tối thiểu, service, dentist, chair, status; hỗ trợ ngày/tuần và index hiện hữu.

**Test:** state matrix theo role, grace period, cutoff, reschedule conflict, dời 15 phút vẫn chồng khoảng lịch gốc, rollback khôi phục lịch gốc khi tạo kế nhiệm lỗi, cross-branch access, không nhận patient ID.

**Exit criteria:** Branch Admin điều phối được lịch có sẵn, check-in và no-show; toàn bộ thay đổi đi qua `AppointmentService.transition_status()` và có history/audit.

**Verification/migration:** test trực tiếp service + API + concurrency/exclusion constraint trên PostgreSQL restore; chạy migrate, `makemigrations --check`, schema validation và regression slot/booking.

**Rollback:** khóa các action URL; không rollback lịch đã chuyển trạng thái.

---

### Bước 5a — Dentist: lịch cá nhân và bắt đầu khám

**Mục tiêu:** nha sĩ chỉ xem lịch được phân công và bắt đầu lượt khám; chưa mở action hoàn thành cho tới khi Bước 6 tồn tại.

**Endpoint:**

- `GET /api/v1/dentist/me/schedule/?date_from=&date_to=&status=`
- `GET /api/v1/dentist/me/appointments/{public_code}/`
- `POST /api/v1/dentist/me/appointments/{public_code}/start/`
- `GET /api/v1/dentist/me/patients/{id_patient_profile}/summary/`

**Quy tắc:**

- Dentist profile phải active, user active và có Membership active tại branch của appointment.
- Chỉ nha sĩ được gán trong `Appointment.dentist` mới xem chi tiết và thao tác.
- `CHECKED_IN → IN_PROGRESS` khi start.
- Không có placeholder/feature flag cho phép complete thiếu bệnh án; endpoint complete chỉ được thêm ở Bước 5b sau Bước 6.
- Patient summary bắt buộc có appointment context trong URL/query; nha sĩ phải là người được phân công, membership phải còn hiệu lực và appointment phải thuộc đúng organization/branch. Trong khi appointment `CONFIRMED|CHECKED_IN|IN_PROGRESS`, nha sĩ được đọc lịch sử finalized của **cùng organization**; sau đó chỉ được đọc encounter do chính mình phụ trách. Không cấp quyền từ việc đoán `id_patient_profile` hoặc chỉ vì từng khám bệnh nhân.
- Với cùng một PatientProfile khám ở hai organization, nha sĩ tenant A không được thấy encounter/plan/prescription tenant B. Mỗi lần xem tạo audit READ; quyền bị thu hồi phải có hiệu lực ngay.
- Không trả dữ liệu tài chính không cần thiết trong patient summary.

**Test:** nha sĩ A không xem lịch nha sĩ B, membership hết hiệu lực, sai status, đọc hồ sơ có audit, cùng patient ở hai organization, đoán ID child resource.

**Exit criteria:** nha sĩ xem lịch và chuyển `CHECKED_IN → IN_PROGRESS` đúng scope; chưa tồn tại đường chuyển `IN_PROGRESS → COMPLETED`.

**Rollback:** disable dentist URL; không hoàn tác status đã ghi.

---

### Bước 6 — Clinical: bệnh án, odontogram, kế hoạch và đơn thuốc

**Mục tiêu:** lưu hồ sơ chuyên môn có lịch sử, phân quyền chặt và bất biến sau khi chốt.

**Model mới đề xuất:**

- `ClinicalEncounter`: 1–1 với Appointment, `DRAFT|FINALIZED`, chief complaint, history, diagnosis summary, notes, finalized_at/by.
- `ClinicalAmendment`: encounter gốc, nội dung bổ sung, reason, author, created_at; append-only và không ghi đè bản finalized.
- `OdontogramEntry`: encounter, tooth_number, surface, condition_code, treatment_code, note.
- `ClinicalAttachment`: encounter, storage_key, original_name, mime_type, size, checksum, uploaded_by.
- `TreatmentPlan`: organization + originating encounter bắt buộc; patient/dentist/branch được suy ra, `DRAFT|ACTIVE|COMPLETED|CANCELLED`, total estimate.
- `TreatmentPlanItem`: plan, service, tooth data, sequence, planned price, status.
- `Prescription`: encounter, status `DRAFT|ISSUED|VOID`, issued_at/by, instructions.
- `PrescriptionItem`: prescription, medicine_name, strength, dosage, frequency, duration, quantity, note.
- `ClinicalUploadSession`: object key/version duy nhất, expected checksum/size/MIME, expires_at, confirmed_at; chỉ tạo attachment sau khi server xác minh metadata object thực tế.

**Endpoint:**

- `GET/POST /api/v1/dentist/me/appointments/{public_code}/clinical-encounter/`
- `PATCH /api/v1/dentist/me/clinical-encounters/{id}/`
- `POST /api/v1/dentist/me/clinical-encounters/{id}/finalize/`
- CRUD odontogram/attachments khi encounter còn `DRAFT`.
- CRUD treatment plan/item cho patient đã từng được nha sĩ khám hợp lệ.
- CRUD prescription/item khi `DRAFT`; action `issue` và `void` riêng.
- Patient chỉ có endpoint read-only cho hồ sơ đã finalized/issued của chính mình.

**Quy tắc:**

- Chỉ dentist của appointment sửa encounter.
- Encounter/plan/prescription luôn suy ra organization/branch/patient từ appointment; mọi parent/child lookup được scope tenant trước khi lookup ID. Org Admin không mặc nhiên đọc nội dung lâm sàng; Branch Admin chỉ nhận các trường vận hành tối thiểu đã allowlist.
- State matrix Encounter chỉ có `DRAFT → FINALIZED`; encounter finalized không VOID và không có encounter thay thế vì quan hệ 1–1 với Appointment.
- `FINALIZED` bất biến; sửa sai trước hoặc sau Appointment COMPLETED đều bằng `ClinicalAmendment` append-only có reason/author/timestamp. Completion tiếp tục kiểm tra encounter gốc đã `FINALIZED`; amendment không làm mất hiệu lực encounter.
- State matrix Prescription: `DRAFT → ISSUED`; `ISSUED → VOID`; bản VOID không sửa/xóa và đơn thay thế liên kết bản gốc.
- Khi sửa child hoặc finalize, khóa parent bằng `select_for_update()`. PostgreSQL trigger chặn `INSERT/UPDATE/DELETE` Odontogram/PrescriptionItem và ghi đè attachment khi parent đã finalized/issued; header chỉ cho phép whitelist status/void metadata.
- Attachment lưu S3/MinIO bằng presigned upload session; DB lưu immutable object key/version + metadata/checksum, không lưu binary và không cấp URL PUT có thể ghi đè object cũ.
- Validate MIME, kích thước và tên file; tải file cần URL ngắn hạn và audit READ.
- Completion của appointment yêu cầu encounter đã finalized; nếu có prescription thì prescription phải issued/void.

**Test:** ownership, tenant isolation cho cùng patient ở hai organization, append-only/finalized tại ORM và SQL, correction bằng amendment trước/sau complete, concurrent finalize/child write, attachment checksum/version/authorization, audit mọi lần xem, patient chỉ xem hồ sơ của mình.

**Exit criteria:** một lượt khám hoàn chỉnh có chẩn đoán, odontogram, kế hoạch/đơn thuốc tùy chọn và không thể sửa lịch sử đã chốt.

**Verification/migration:** migrate trên database restore; test `apps.clinical`, direct SQL trigger tests, permission-negative tests, storage mock và OpenAPI validation.

**Rollback:** disable write endpoints; giữ nguyên dữ liệu y tế, tuyệt đối không xóa migration/dữ liệu production.

---

### Bước 5b — Dentist: hoàn thành lượt khám

**Mục tiêu:** mở transition cuối của workflow sau khi clinical đã có đầy đủ invariant.

**Endpoint:** `POST /api/v1/dentist/me/appointments/{public_code}/complete/`.

**Quy tắc:** chỉ Dentist được phân công; appointment đang `IN_PROGRESS`; encounter cùng appointment đã `FINALIZED`; prescription nếu tồn tại phải `ISSUED|VOID`; mutation khóa appointment + encounter và gọi duy nhất `AppointmentService.transition_status()`.

**Test:** thiếu encounter, encounter draft, prescription draft, dentist khác, membership bị thu hồi, double-submit/idempotency và concurrent complete.

**Exit criteria:** `IN_PROGRESS → COMPLETED` không có đường bypass bằng API hoặc gọi service trực tiếp; history/audit được ghi cùng transaction.

**Verification/rollback:** chạy scheduling + clinical integration tests và schema validation; khi rollback chỉ disable action complete, không đảo status đã hoàn thành.

---

### Bước 7 — Billing: hóa đơn và thanh toán tại quầy

**Mục tiêu:** Branch Admin lập hóa đơn bất biến và ghi nhận thanh toán tại quầy.

**Model mới:**

- `Invoice`: branch, patient và appointment **bắt buộc**, replacement_for nullable, invoice_number, `DRAFT|ISSUED|PAID|VOID`, subtotal, discount, total, issued/paid/void metadata.
- `InvoiceLine`: invoice, service snapshot, description, quantity, unit_price, line_total.
- `Payment`: invoice, payment_number, method `CASH|BANK_TRANSFER|CARD`, amount, `POSTED|VOID`, posted/void metadata, external_reference.

**Endpoint:**

- `GET/POST /api/v1/management/branches/{id_branch}/invoices/`
- `GET/PATCH /api/v1/management/invoices/{id_invoice}/` — PATCH chỉ khi `DRAFT`.
- `POST /api/v1/management/invoices/{id_invoice}/issue/`
- `POST /api/v1/management/invoices/{id_invoice}/void/`
- `POST /api/v1/management/invoices/{id_invoice}/payments/`
- `POST /api/v1/management/payments/{id_payment}/void/`
- Patient có read-only invoice `ISSUED|PAID` của chính mình.

**Quy tắc:**

- Chỉ tạo invoice từ Appointment `COMPLETED`; server suy ra branch/patient, không nhận patient tùy ý. Hóa đơn ngoài lượt khám nằm ngoài MVP.
- Thêm `Appointment.service_price_snapshot` tại thời điểm hold/booking; invoice mặc định lấy snapshot đó. Migration dữ liệu cũ phải có chiến lược backfill được audit, không âm thầm coi giá hiện tại là giá lịch sử.
- Một appointment chỉ có tối đa một invoice chưa VOID; invoice thay thế phải liên kết invoice VOID trước đó.
- DRAFT sửa tự do; ISSUE snapshot toàn bộ dòng và tổng tiền.
- Từ ISSUED trở đi không sửa invoice line/amount trực tiếp.
- Tiền tệ MVP là VND; mọi amount dùng Decimal, yêu cầu phần lẻ bằng 0, rounding `ROUND_HALF_UP`; discount từ 0 đến subtotal và invoice total phải lớn hơn 0.
- MVP một payment phải bằng đúng số tiền invoice; không partial payment. Unique condition bảo đảm tối đa một Payment `POSTED` trên invoice.
- Tạo Payment POSTED trong transaction khóa invoice → invoice `PAID`; POST và void đều có idempotency key.
- Void Payment đã POSTED chỉ thay `status`, `voided_at/by/reason`; giữ nguyên invoice, method, amount và external reference. Đây là sửa ghi nhận sai, **không phải hoàn tiền**. Sau void, invoice quay về `ISSUED`.
- Cấm VOID invoice khi còn Payment POSTED; phải void payment trước. Invoice `VOID` yêu cầu reason/actor và không nhận payment mới.
- Báo cáo doanh thu chỉ tính Invoice `PAID` và Payment `POSTED`.
- Mọi issue/post/void dùng `select_for_update()` trên invoice. PostgreSQL trigger bảo vệ Invoice header bằng whitelist status metadata, chặn `InvoiceLine INSERT/UPDATE/DELETE` sau ISSUE và cấm update Payment ngoài transition `POSTED → VOID` đúng whitelist.

**Test:** money precision/rounding, invoice zero, concurrent/duplicate payment, idempotency, cấm void invoice còn payment, void reconciliation, immutable header/line/payment trigger bằng ORM và SQL, branch scope, invoice number/conditional unique.

**Exit criteria:** mọi thay đổi tài chính có transaction, audit và test concurrent; không có endpoint sửa Payment.

**Verification/migration:** migrate bản restore, backfill price snapshot có report đối chiếu, chạy billing + scheduling integration/concurrency tests, direct SQL trigger tests và OpenAPI validation.

**Rollback:** disable payment endpoint; không xóa/rollback dữ liệu tài chính đã phát sinh.

---

### Bước 8 — Notification web + email

**Mục tiêu:** phát thông báo nhất quán từ event nghiệp vụ, không gửi trùng.

**Model mới:**

- `Notification`: recipient, type, title, body, payload JSON, read_at, created_at.
- `NotificationDelivery`: notification, channel `IN_APP|EMAIL`, status, attempts, last_error, sent_at, idempotency_key.

**Event:** appointment confirmed/pending/rescheduled/cancelled, reminder 24h/2h, clinical record available, invoice issued/paid.

**Endpoint:**

- `GET /api/v1/notifications/?unread=`
- `POST /api/v1/notifications/{id}/read/`
- `POST /api/v1/notifications/read-all/`

**Quy tắc:**

- Transaction ghi nghiệp vụ và outbox/delivery cùng nhau; Celery gửi email sau commit.
- Unique `(event, recipient, channel)` và `idempotency_key` ngăn tạo delivery trùng; worker dùng claim/lease, retry exponential backoff và job quét outbox tồn đọng.
- Kiểm tra lại trạng thái Appointment ngay trước reminder để không nhắc lịch đã hủy/dời.
- Nếu SMTP/provider không hỗ trợ idempotency, hệ thống chỉ đạt at-least-once: vẫn có xác suất email trùng nếu worker crash sau khi provider đã nhận nhưng trước khi DB ghi `sent_at`; phải ghi rõ giới hạn này, không tuyên bố exactly-once.
- Reminder query UTC nhưng tính mốc theo organization timezone.
- Không SMS, Zalo hoặc browser push.
- Không đưa chi tiết y tế nhạy cảm vào subject/body email; email dẫn vào trang đăng nhập.

**Test:** Celery eager cho logic thường, worker crash boundary/lease, retry/idempotency DB, timezone, trạng thái đổi trước reminder, authorization notification, không lộ clinical detail.

**Exit criteria:** in-app/email phản ánh đúng event, DB không tạo delivery trùng khi retry và tài liệu nêu rõ crash boundary của SMTP.

**Verification/migration:** test outbox/delivery với worker concurrency và failure injection, Celery schedule, schema validation và migrate trên database restore.

**Rollback:** dừng Celery schedule/delivery; dữ liệu nghiệp vụ chính không phụ thuộc gửi email thành công.

---

### Bước 9 — Báo cáo theo scope role

**Mục tiêu:** báo cáo đọc-only, số liệu có định nghĩa thống nhất và không quét dữ liệu vô hạn.

**Endpoint:**

- `GET /api/v1/management/organizations/{id}/reports/overview/?date_from=&date_to=`
- `GET /api/v1/management/organizations/{id}/reports/revenue/?group_by=branch|service|day|month`
- `GET /api/v1/management/organizations/{id}/reports/appointments/`
- `GET /api/v1/management/organizations/{id}/reports/chair-utilization/`
- `GET /api/v1/management/organizations/{id}/reports/patient-areas/`
- Các endpoint tương tự dưới branch, luôn cố định `id_branch` từ URL.
- `GET /api/v1/dentist/me/reports/activity/?date_from=&date_to=`

**Định nghĩa:**

- Revenue: Invoice `PAID` có Payment `POSTED` trong kỳ; thống nhất dùng `paid_at`. Discount được phân bổ theo tỷ trọng `InvoiceLine.line_total` khi group theo service.
- Visit: Appointment `COMPLETED`.
- Cancellation rate = `CANCELLED / (PENDING + CONFIRMED + CHECKED_IN + IN_PROGRESS + COMPLETED + CANCELLED + NO_SHOW)` trong cohort theo `starts_at`; no-show rate dùng cùng denominator nhưng numerator `NO_SHOW`. Loại `HELD|EXPIRED`.
- New/returning patient: lần completed appointment đầu tiên trong organization.
- Chair utilization MVP = tổng phút `starts_at→ends_at` của `CHECKED_IN|IN_PROGRESS|COMPLETED` / capacity snapshot theo giờ mở cửa và số ghế. Muốn báo cáo lịch sử chính xác phải lưu daily capacity snapshot; không dùng cấu hình giờ mở cửa hiện tại để tính ngược quá khứ.
- Patient areas: aggregate theo ward/province; không trả thông tin định danh bệnh nhân.

**Bảo vệ hiệu năng:** bắt buộc date range, giới hạn tối đa 366 ngày, index theo branch/status/time/payment time; query aggregation tại PostgreSQL; cache ngắn hạn nếu cần.

**Test:** fixture số liệu đóng, timezone boundary, void payment không tính revenue, scope branch/org, query count/performance.

**Exit criteria:** báo cáo khớp fixture tài chính/lịch và có mô tả metric trong OpenAPI.

**Verification/migration:** fixture đóng qua ranh giới timezone, EXPLAIN/query-count checks, branch/org scope tests, migrate restore và schema validation.

**Rollback:** tắt endpoint/cache; không ảnh hưởng giao dịch gốc.

---

### Bước 10 — Hardening, integration và bàn giao API

**Mục tiêu:** chứng minh ba role hoạt động end-to-end và không phá luồng bệnh nhân.

**Công việc:**

1. Tạo management command `seed_demo` idempotent:
   - một organization, hai branch.
   - Organization Admin, Branch Admin nhiều branch, hai Dentist, Patient đã xác minh.
   - service, branch price, chair, opening hour, work shift.
2. Integration scenario:
   - Org Admin cấu hình branch/service/staff.
   - Patient đặt lịch.
   - Branch Admin xác nhận/check-in.
   - Dentist start, finalizes encounter, completes appointment.
   - Branch Admin issues invoice và posts payment.
   - Notification và report phản ánh đúng dữ liệu.
3. Chạy toàn bộ permission-negative tests cho dữ liệu chéo tenant/branch.
4. Rate limit riêng cho mutation nhạy cảm.
5. OpenAPI có operation ID duy nhất, request/response/error schema đầy đủ.
6. Kiểm tra migration từ database hiện tại trên bản sao dữ liệu.
7. Kiểm tra N+1 bằng query assertions cho calendar/report/list.
8. Cập nhật README và API examples cho React.

**Lệnh gate cuối:**

```powershell
docker compose exec web python manage.py test --settings=config.settings.test --noinput
docker compose exec web python manage.py check --deploy
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py spectacular --file /tmp/schema.yml --validate
npm --prefix frontend test
npm --prefix frontend run build
```

**Exit criteria:** toàn bộ test pass; seed chạy lặp không nhân đôi dữ liệu; ba role chỉ thấy đúng scope; audit đầy đủ; OpenAPI hợp lệ; React cũ vẫn đặt lịch được.

## 6. Cấu trúc code đề xuất

```text
backend/apps/
├── access_control/
│   ├── permissions.py
│   ├── scopes.py
│   └── tests/
├── organizations/
│   ├── management_views.py
│   ├── management_serializers.py
│   └── management_urls.py
├── locations/
│   └── management_*.py
├── catalog/
│   └── management_*.py
├── scheduling/
│   ├── management_*.py
│   ├── dentist_*.py
│   └── services.py
├── clinical/
│   ├── models.py
│   ├── services.py
│   ├── dentist_*.py
│   └── patient_*.py
├── billing/
│   ├── models.py
│   ├── services.py
│   └── management_*.py
├── notifications/
│   ├── models.py
│   ├── services.py
│   └── tasks.py
└── audit/
    ├── models.py
    └── services.py
```

Views chỉ làm: validate → permission/scope → gọi service → serialize. Transaction và state transition nằm trong service; constraint quan trọng nằm ở database.

## 7. Anti-pattern phải tránh

- Chỉ kiểm tra role nhưng quên kiểm tra organization/branch của object.
- Nhận `organization_id` hoặc `branch_id` từ body rồi tin trực tiếp.
- Viết logic transition status trong nhiều view khác nhau.
- Hard-delete dữ liệu lịch sử, clinical hoặc billing.
- Cho Branch Admin tạo appointment hoặc truyền `patient_id`.
- Cho sửa bệnh án finalized, invoice issued hoặc payment posted bằng PATCH thường.
- Gửi email trực tiếp trước khi transaction database commit.
- Báo cáo revenue từ Appointment thay vì Invoice/Payment hợp lệ.
- Trả stack trace, storage key nhạy cảm hoặc clinical detail trong notification.
- Dùng signal cho logic tài chính/state phức tạp khó kiểm soát; dùng service rõ ràng.

## 8. Protocol thay đổi plan

- **Split:** bước nào vượt quá một migration/API slice có thể tách nhỏ, nhưng không đổi exit criteria.
- **Insert:** yêu cầu mới phải ghi dependency và migration impact trước khi chèn.
- **Reorder:** chỉ đổi thứ tự khi dependency graph vẫn hợp lệ.
- **Skip:** chỉ skip khi feature được ghi rõ ngoài MVP; RBAC, audit clinical read và billing immutability không được skip.
- **Abandon:** không xóa migration/dữ liệu đã chạy; disable endpoint và lập migration bù nếu cần.

## 9. Thứ tự thực hiện đề xuất

Triển khai: **Bước 0 → Bước 1 → Bước 2 và 3 → Bước 4 → Bước 5a → Bước 6 → Bước 5b → Bước 7**, sau đó làm song song **Bước 8/9**, cuối cùng **Bước 10**.

Bước bắt đầu ngay: chạy **Bước 0 baseline/backup**, sau đó **RBAC + scope + AuditEvent/outbox** vì mọi endpoint của ba role đều phụ thuộc lớp này.
