param(
  [string]$TaskName = "ClawCorpServer",
  [string]$RepoDir = "$PSScriptRoot"
)

$ErrorActionPreference = "Stop"

$script = Join-Path $RepoDir "run-server.ps1"
if (-not (Test-Path $script)) {
  throw "run-server.ps1 not found at $script"
}

$action = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`""

# Delete only if task exists (avoid hard-fail when missing)
& schtasks /Query /TN $TaskName 1>$null 2>$null
if ($LASTEXITCODE -eq 0) {
  & schtasks /Delete /TN $TaskName /F | Out-Null
}

& schtasks /Create /TN $TaskName /SC ONLOGON /RL HIGHEST /TR $action /F | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create task: $TaskName"
}

Write-Host "[task] installed: $TaskName"
Write-Host "[task] run now: schtasks /Run /TN $TaskName"
