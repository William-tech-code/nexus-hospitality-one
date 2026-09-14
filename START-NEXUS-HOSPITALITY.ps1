$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$env:HOSPITALITY_PORT = "8989"
Remove-Item Env:PORT -ErrorAction SilentlyContinue
Write-Host "NEXUS HOSPITALITY ONE V0.6.1" -ForegroundColor Cyan
Write-Host "API esperada: http://127.0.0.1:8989/api/health" -ForegroundColor DarkGray
$busy = Get-NetTCPConnection -LocalPort 8989 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) { throw "Porta 8989 ocupada. PID: $($busy.OwningProcess)" }
npm run server
