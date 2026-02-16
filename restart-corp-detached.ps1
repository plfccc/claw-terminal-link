# Detached restart launcher for corp-server
# Use this when running from a shell that depends on corp-server itself.

$scriptPath = Join-Path $PSScriptRoot "restart-corp.ps1"

if (!(Test-Path $scriptPath)) {
  Write-Host "restart-corp.ps1 not found: $scriptPath" -ForegroundColor Red
  exit 1
}

Write-Host "Launching detached restart..." -ForegroundColor Yellow

$argList = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$scriptPath`""
)

$proc = Start-Process -FilePath "powershell" -ArgumentList $argList -WorkingDirectory $PSScriptRoot -PassThru

Write-Host "Detached restart started (PID: $($proc.Id))." -ForegroundColor Green
Write-Host "Your current session may disconnect if corp-server is restarted." -ForegroundColor DarkYellow
Write-Host "Reconnect and verify with: npm run corp-server (if needed) or check logs/*.log" -ForegroundColor DarkYellow
