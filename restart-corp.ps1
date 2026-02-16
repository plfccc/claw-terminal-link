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
    Write-Host "Failed to free port from PID $pid: $($_.Exception.Message)" -ForegroundColor Red
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

Write-Host "Starting corp-server..." -ForegroundColor Green
node corp-server.js
