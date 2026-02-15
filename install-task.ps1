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

schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
schtasks /Create /TN $TaskName /SC ONLOGON /RL HIGHEST /TR $action /F | Out-Host

Write-Host "[task] installed: $TaskName"
Write-Host "[task] run now: schtasks /Run /TN $TaskName"
