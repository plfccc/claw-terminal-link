# Restart script for corp-server
# Kills old processes and starts fresh

Write-Host "Stopping old corp-server process only..." -ForegroundColor Yellow

# Kill node process running corp-server.js (do NOT kill all node.exe)
$corpProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'corp-server\.js' }

foreach ($p in $corpProcs) {
  try {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped corp-server PID $($p.ProcessId)" -ForegroundColor DarkYellow
  } catch {
    Write-Host "Failed to stop PID $($p.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
  }
}

# Fallback: kill whoever is holding 127.0.0.1:17878
$portOwners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17878 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pid in $portOwners) {
  try {
    Stop-Process -Id $pid -Force -ErrorAction Stop
    Write-Host "Freed port 17878 by stopping PID $pid" -ForegroundColor DarkYellow
  } catch {
    Write-Host "Failed to free port from PID ${pid}: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Start-Sleep -Seconds 1

Write-Host "Cleaning up conflicting files..." -ForegroundColor Yellow
Remove-Item -Recurse -Force node_modules\node-pty\prebuilds\win32-x64 -ErrorAction SilentlyContinue

Write-Host "Pulling latest code..." -ForegroundColor Yellow
git fetch origin
git checkout -- .
git clean -fdx
git pull

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Starting corp-server in background..." -ForegroundColor Green

$logDir = Join-Path $PSScriptRoot "logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$stdoutLog = Join-Path $logDir "corp-server.out.log"
$stderrLog = Join-Path $logDir "corp-server.err.log"
$pidFile = Join-Path $PSScriptRoot "corp-server.pid"

$proc = Start-Process -FilePath "node" -ArgumentList "corp-server.js" -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
$proc.Id | Set-Content -Path $pidFile -Encoding ascii
Write-Host "Started corp-server PID $($proc.Id)" -ForegroundColor Green

# Health check: wait up to 20s for port to listen
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Seconds 1
  try {
    $listen = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17878 -State Listen -ErrorAction Stop
    if ($listen) { $ok = $true; break }
  } catch {}
}

if ($ok) {
  Write-Host "corp-server is healthy: 127.0.0.1:17878 listening" -ForegroundColor Green
} else {
  Write-Host "corp-server did not become healthy in time. Check logs:" -ForegroundColor Red
  Write-Host "  $stdoutLog"
  Write-Host "  $stderrLog"
  exit 1
}
