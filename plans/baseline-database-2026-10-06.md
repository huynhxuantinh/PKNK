# Baseline database — 2026-10-06

## Kết quả kiểm tra

- Backend Django: 79/79 tests passed.
- Frontend React: 2/2 tests passed.
- Frontend TypeScript/Vite production build: passed.
- Django system check trên database restore: passed.
- Django migration check trên database restore: không có migration chưa áp dụng.

## Backup

- Format: PostgreSQL custom format (`pg_dump -Fc`).
- File local: `backups/pknk-backup-20261006-152913.dump`.
- Size: 145831 bytes.
- SHA-256: `06A59C3D87EA4E257EA6030B3BA439D5CF8EA77E9D33F385062C7C72229148DF`.
- File dump bị Git bỏ qua vì có thể chứa dữ liệu nhạy cảm.

## Restore verification

- Source database: `pknk`.
- Restore database: `pknk_restore_test`.
- Restore tool: `pg_restore --exit-on-error --no-owner --no-privileges`.
- Public tables: 35 ở cả nguồn và bản restore.
- Migration signature: `9c7c4dee5acc3d691f92136b626b4bf0`.
- Extension signature: `0adea35812a62ad4a10b87ff6ed44ce4`.
- PostGIS: 3.4.3.
- btree_gist: 1.7.

### Row-count fingerprint

| Table | Count |
| --- | ---: |
| appointments | 0 |
| branches | 0 |
| branch_services | 0 |
| dentists | 0 |
| organizations | 0 |
| patient_profiles | 1 |
| services | 0 |
| users | 1 |

## Chạy lại

```powershell
$backup = .\scripts\backup_database.ps1
.\scripts\restore_verify_database.ps1 -BackupPath $backup.BackupPath
```

Script restore chỉ chấp nhận database có tiền tố `pknk_restore_`, từ chối database nguồn và đối chiếu fingerprint sau restore.
