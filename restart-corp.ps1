# Robust restart script for corp-server
# Runs in detached mode - safe to execute from remote session
# This is the ONLY restart script you need

$ErrorActionPreference = 'Stop'

function Test-CorpPortListening {
  try {
    $listen = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17878 -State Listen -ErrorAction Stop
    return [bool]$listen
  } catch {
    return $false
  }
}

Write-Host "=== Corp Server Restart (Detached Mode) ===" -ForegroundColor Cyan
Write-Host "[1/6] Stopping old corp-server process..." -ForegroundColor Yellow

# Kill node process running corp-server.js (do NOT kill all node.exe)
$corpProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'corp-server\.js' }

foreach ($p in $corpProcs) {
  try {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
    Write-Host "  Stopped corp-server PID $($p.ProcessId)" -ForegroundColor DarkYellow
  } catch {
    Write-Host "  Failed to stop PID $($p.ProcessId): $($_.Exception.Message)" -ForegroundColor Red
  }
}

# Fallback: free 127.0.0.1:17878
$portOwners = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17878 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($pid in $portOwners) {
  $pidStr = [string]$pid
  try {
    Stop-Process -Id $pidStr -Force -ErrorAction Stop
    Write-Host "  Freed port 17878 by stopping PID $pidStr" -ForegroundColor DarkYellow
  } catch {
    $pidErrStr = [string]$pid
    Write-Host "  Failed to free port from PID $pidErrStr: $($_.Exception.Message)" -ForegroundColor Red
  }
}

Start-Sleep -Seconds 1

Write-Host "[2/6] Cleaning conflicting files..." -ForegroundColor Yellow
Remove-Item -Recurse -Force node_modules\node-pty\prebuilds\win32-x64 -ErrorAction SilentlyContinue

Write-Host "[3/6] Pulling latest code..." -ForegroundColor Yellow
git fetch origin
git checkout -- .
git clean -fdx
git pull

Write-Host "[4/6] Installing dependencies..." -ForegroundColor Yellow
npm install

$logDir = Join-Path $PSScriptRoot "logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$stdoutLog = Join-Path $logDir "corp-server.out.log"
$stderrLog = Join-Path $logDir "corp-server.err.log"
$pidFile = Join-Path $PSScriptRoot "corp-server.pid"

Write-Host "[5/6] Starting corp-server in background..." -ForegroundColor Green
$proc = Start-Process -FilePath "node" -ArgumentList "corp-server.js" -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
if ($proc) {
  $procIdStr = [string]$proc.Id
  $proc.Id | Set-Content -Path $pidFile -Encoding ascii
  Write-Host "  Started corp-server PID $procIdStr" -ForegroundColor Green
} else {
  Write-Host "  Failed to start corp-server" -ForegroundColor Red
}

# Health check (up to 25s)
$ok = $false
Write-Host "[6/6] Waiting for service to be ready..." -ForegroundColor Yellow
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  if (Test-CorpPortListening) { $ok = $true; break }
}

if ($ok) {
  Write-Host "=== SUCCESS: corp-server is healthy (127.0.0.1:17878 listening) ===" -ForegroundColor Green
  exit 0
} else {
  Write-Host "=== WARNING: Health check failed. Checking logs... ===" -ForegroundColor Red
  if (Test-Path $stdoutLog) { Get-Content $stdoutLog | Select-Object -Last 10 }
  if (Test-Path $stderrLog) { Get-Content $stderrLog | Select-Object -Last 10 }
  Write-Host "You may need to run: npm run corp-server" -ForegroundColor Yellow
  exit 1
}
