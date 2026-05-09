# Перезапуск бэкенда на порту 8000 (останавливает процесс, который слушает этот порт, затем uvicorn).
$ErrorActionPreference = "Stop"
# Если 8000 занят «зависшими» процессами, используйте $port = 8010 и прокси Vite (см. vite.config.ts).
$port = if ($env:CRM_BACKEND_PORT) { [int]$env:CRM_BACKEND_PORT } else { 8010 }
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
foreach ($row in $listeners) {
    $listenPid = $row.OwningProcess
    if ($listenPid -and $listenPid -ne $PID) {
        Write-Host "Stopping PID $listenPid on port $port"
        Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
    }
}
Start-Sleep -Seconds 1

Write-Host "Starting uvicorn (reload) http://127.0.0.1:$port"
python -m uvicorn main:app --reload --host 0.0.0.0 --port $port
