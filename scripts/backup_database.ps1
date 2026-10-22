param(
    [string]$BackupDirectory = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackupDirectory) {
    $BackupDirectory = Join-Path $repoRoot "backups"
}

New-Item -ItemType Directory -Force -Path $BackupDirectory | Out-Null
$resolvedBackupDirectory = (Resolve-Path -LiteralPath $BackupDirectory).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "pknk-backup-$timestamp.dump"
$hostPath = Join-Path $resolvedBackupDirectory $fileName
$containerPath = "/tmp/$fileName"

Push-Location $repoRoot
try {
    & docker compose exec -T -e "BACKUP_FILE=$containerPath" db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$BACKUP_FILE" && pg_restore --list "$BACKUP_FILE" >/dev/null'
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump or pg_restore validation failed."
    }

    & docker compose cp "db:$containerPath" $hostPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $hostPath)) {
        throw "Cannot copy the backup from the container."
    }

    if (-not $containerPath.StartsWith("/tmp/pknk-backup-")) {
        throw "Refusing to remove a temporary file outside the allowed backup path."
    }
    & docker compose exec -T db rm -f -- $containerPath
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot remove the temporary backup file from the container."
    }

    $file = Get-Item -LiteralPath $hostPath
    if ($file.Length -le 0) {
        throw "Backup is empty."
    }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $hostPath).Hash

    [pscustomobject]@{
        BackupPath = $hostPath
        SizeBytes = $file.Length
        Sha256 = $hash
    }
}
finally {
    Pop-Location
}
