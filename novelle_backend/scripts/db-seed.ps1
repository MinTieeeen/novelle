# Seeds (or resets) the Novelle mock data on the SQL Server in novelle\.env (the project's single settings file).
#
#   .\scripts\db-seed.ps1          run database\seed\10 ... 90 as novelle_migrator
#   .\scripts\db-seed.ps1 reset    delete ALL data (except Genre) so the seed can be run again
#
# Needs in novelle\.env: DB_HOST, MIGRATOR_PASSWORD and either DEMO_PASSWORD (a BCrypt hash is made from it with
# Node + bcryptjs in a temporary folder) or DEMO_PASSWORD_HASH (a ready-made BCrypt hash, "$2a$10$...").
param([string]$Action = "seed")
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$envFile = Join-Path (Join-Path $PSScriptRoot "..\..") ".env"
if (-not (Test-Path $envFile)) { throw "novelle\.env not found (copy novelle\.env.example to novelle\.env)" }
$envVars = @{}
Get-Content $envFile -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') {
        $value = $Matches[2].Trim()
        if ($value.Length -ge 2 -and $value[0] -eq $value[-1] -and "'`"".Contains($value[0])) {
            $value = $value.Substring(1, $value.Length - 2)      # quoted value
        }
        $envVars[$Matches[1]] = $value
    }
}
foreach ($k in "DB_HOST", "MIGRATOR_PASSWORD") { if (-not $envVars[$k]) { throw "$k missing in novelle\.env" } }
$env:SQLCMDPASSWORD = $envVars["MIGRATOR_PASSWORD"]

function Invoke-Sql([string]$File, [string[]]$Extra = @()) {
    Write-Host "=== $File ==="
    & sqlcmd -S "$($envVars['DB_HOST']),1433" -U novelle_migrator -d NovelleDB -C -b -l 30 -f 65001 -W -s "|" @Extra -i $File
    if ($LASTEXITCODE -ne 0) { throw "sqlcmd failed on $File (exit code $LASTEXITCODE)" }
}

if ($Action -eq "reset") {
    Invoke-Sql "database\seed\99_reset.sql" @("-v", "CONFIRM=YES")
    return
}

$hash = $envVars["DEMO_PASSWORD_HASH"]
if (-not $hash) {
    if (-not $envVars["DEMO_PASSWORD"]) { throw "Set DEMO_PASSWORD or DEMO_PASSWORD_HASH in novelle\.env" }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("novelle-bcrypt-" + [Guid]::NewGuid())
    New-Item -ItemType Directory $tmp | Out-Null
    try {
        Write-Host "Creating the BCrypt hash of DEMO_PASSWORD (bcryptjs, in a temporary folder)..."
        Push-Location $tmp
        & npm init -y *> $null
        & npm install bcryptjs@2.4.3 --silent --no-audit --no-fund *> $null
        $hash = (& node -e 'console.log(require("bcryptjs").hashSync(process.argv[1], 10))' $envVars["DEMO_PASSWORD"]).Trim()
        Pop-Location
    } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
}
if (-not $hash.StartsWith('$2')) { throw "DEMO_PASSWORD_HASH does not look like a BCrypt hash" }

foreach ($f in "10_corpus", "20_users", "30_catalog", "40_chapters", "50_activity", "90_finalize") {
    if ($f -eq "20_users") { Invoke-Sql "database\seed\$f.sql" @("-v", "DEMO_PASSWORD_HASH=$hash") }
    else { Invoke-Sql "database\seed\$f.sql" }
}
Write-Host "Seed finished. Next: sqlcmd as novelle_readonly -i database\queries\99_check_invariants.sql (must return no rows)."
