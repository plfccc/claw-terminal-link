# Robust restart script for corp-server
# Goals:
# 1) Kill only corp-server related processes
# 2) Update + install deps
# 3) Start in background with logs/pid
# 4) Health-check port 17878
# 5) Fallback to foreground start if background health-check fails

$ErrorActionPreference = 'Stop'

function Invoke-Step($name, [scriptblock]$action) {
  Write-Host $name -ForegroundColor Yellow
  & $action
}

function Invoke-External([string]$cmd) {
  Invoke-Expression $cmd
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $cmd"
  }
}

function Test-CorpPortListening {
  try {
    $listen = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 17878 -State Listen -ErrorAction Stop
    return [bool]$listen
  } catch {
    return $false
  }
}

Invoke-Step "Stopping old corp-server process only..." {
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

  # Fallback: free 127.0.0.1:17878
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
}

Invoke-Step "Cleaning up conflicting files..." {
  Remove-Item -Recurse -Force node_modules\node-pty\prebuilds\win32-x64 -ErrorAction SilentlyContinue
}

Invoke-Step "Pulling latest code..." {
  Invoke-External "git fetch origin"
  Invoke-External "git checkout -- ."
  Invoke-External "git clean -fdx"
  Invoke-External "git pull"
}

Invoke-Step "Installing dependencies..." {
  Invoke-External "npm install"
}

$logDir = Join-Path $PSScriptRoot "logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$stdoutLog = Join-Path $logDir "corp-server.out.log"
$stderrLog = Join-Path $logDir "corp-server.err.log"
$pidFile = Join-Path $PSScriptRoot "corp-server.pid"

Invoke-Step "Starting corp-server in background..." {
  $proc = Start-Process -FilePath "node" -ArgumentList "corp-server.js" -WorkingDirectory $PSScriptRoot -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog -PassThru
  $proc.Id | Set-Content -Path $pidFile -Encoding ascii
  Write-Host "Started corp-server PID $($proc.Id)" -ForegroundColor Green
}

# Health check (up to 25s)
$ok = $false
for ($i = 0; $i -lt 25; $i++) {
  Start-Sleep -Seconds 1
  if (Test-CorpPortListening) { $ok = $true; break }
}

if ($ok) {
  Write-Host "corp-server is healthy: 127.0.0.1:17878 listening" -ForegroundColor Green
  exit 0
}

Write-Host "Background start failed health check. Falling back to foreground start..." -ForegroundColor Red
Write-Host "Logs:" -ForegroundColor DarkYellow
Write-Host "  $stdoutLog"
Write-Host "  $stderrLog"

# Fallback: run foreground so operator can see immediate error/output.
node corp-server.js
