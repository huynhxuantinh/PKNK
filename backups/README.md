# Database backups

Thư mục này chỉ giữ hướng dẫn. File `*.dump` là dữ liệu nhạy cảm và bị Git bỏ qua.

```powershell
$backup = .\scripts\backup_database.ps1
.\scripts\restore_verify_database.ps1 -BackupPath $backup.BackupPath
```

Script restore chỉ cho phép database đích có tiền tố `pknk_restore_` và từ chối ghi đè database nguồn.
