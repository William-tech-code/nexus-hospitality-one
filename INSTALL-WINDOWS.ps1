$ErrorActionPreference="Stop"
$Project=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Project
Write-Host "============================================================" -ForegroundColor DarkYellow
Write-Host " NEXUS HOSPITALITY ONE - INSTALACAO" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor DarkYellow
if(!(Get-Command node -ErrorAction SilentlyContinue)){throw "Node.js nao encontrado."}
Write-Host "`n=== NPM INSTALL ===" -ForegroundColor Cyan
npm install
Write-Host "`n=== BUILD ===" -ForegroundColor Cyan
npm run build
Write-Host "`n=== CONCLUIDO ===" -ForegroundColor Green
Write-Host "Janela 1: npm run server"
Write-Host "Janela 2: npm run dev"
Write-Host "Frontend: http://localhost:5180"
Write-Host "API: http://127.0.0.1:8989/api/health"
