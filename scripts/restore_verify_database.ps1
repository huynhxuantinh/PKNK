param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$RestoreDatabase = "pknk_restore_test"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$fingerprintSqlPath = Join-Path $PSScriptRoot "database_fingerprint.sql"
$containerFingerprintSql = "/tmp/pknk-database-fingerprint.sql"

if ($RestoreDatabase -notmatch '^pknk_restore_[a-z0-9_]+$') {
    throw "Restore database name must start with pknk_restore_ and contain only lowercase letters, numbers, and underscores."
}

function Get-DatabaseFingerprint {
    param([string]$DatabaseName)

    $output = & docker compose exec -T -e "TARGET_DB=$DatabaseName" db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$TARGET_DB" -At -f /tmp/pknk-database-fingerprint.sql'
    if ($LASTEXITCODE -ne 0 -or -not $output) {
        throw "Cannot read fingerprint for database $DatabaseName."
    }
    return (($output | ForEach-Object { $_.Trim() }) -join "`n").Trim()
}

$containerPath = "/tmp/pknk-restore-$([guid]::NewGuid().ToString('N')).dump"

Push-Location $repoRoot
try {
    $sourceDatabase = (& docker compose exec -T db sh -c 'printf "%s" "$POSTGRES_DB"').Trim()
    if ($LASTEXITCODE -ne 0 -or -not $sourceDatabase) {
        throw "Cannot read the source database name from the container."
    }
    if ($RestoreDatabase -eq $sourceDatabase) {
        throw "Refusing to overwrite source database $sourceDatabase."
    }

    & docker compose cp $fingerprintSqlPath "db:$containerFingerprintSql"
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot copy the fingerprint SQL into the container."
    }

    $sourceFingerprint = Get-DatabaseFingerprint -DatabaseName $sourceDatabase

    & docker compose cp $resolvedBackup "db:$containerPath"
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot copy the backup into the container."
    }

    & docker compose exec -T -e "RESTORE_DB=$RestoreDatabase" -e "DUMP_FILE=$containerPath" db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists "$RESTORE_DB" && createdb -U "$POSTGRES_USER" "$RESTORE_DB" && pg_restore --exit-on-error --no-owner --no-privileges -U "$POSTGRES_USER" -d "$RESTORE_DB" "$DUMP_FILE"'
    if ($LASTEXITCODE -ne 0) {
        throw "Restore failed. The source database was not modified."
    }

    $restoreFingerprint = Get-DatabaseFingerprint -DatabaseName $RestoreDatabase
    if ($sourceFingerprint -ne $restoreFingerprint) {
        throw "Restored database fingerprint does not match the source.`nSOURCE:`n$sourceFingerprint`nRESTORE:`n$restoreFingerprint"
    }

    if (-not $containerPath.StartsWith("/tmp/pknk-restore-")) {
        throw "Refusing to remove a temporary file outside the allowed restore path."
    }
    & docker compose exec -T db rm -f -- $containerPath
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot remove the temporary restore file from the container."
    }
    & docker compose exec -T db rm -f -- $containerFingerprintSql
    if ($LASTEXITCODE -ne 0) {
        throw "Cannot remove the temporary fingerprint SQL from the container."
    }

    [pscustomobject]@{
        SourceDatabase = $sourceDatabase
        RestoreDatabase = $RestoreDatabase
        Verified = $true
        Fingerprint = $restoreFingerprint
    }
}
finally {
    Pop-Location
}
