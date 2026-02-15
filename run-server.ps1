param(
  [string]$RepoDir = "$PSScriptRoot",
  [string]$Branch = "main",
  [string]$Remote = "origin"
)

$ErrorActionPreference = "Stop"
Set-Location $RepoDir

Write-Host "[run] updating..."
& "$PSScriptRoot\update.ps1" -RepoDir $RepoDir -Branch $Branch -Remote $Remote -InstallDeps

Write-Host "[run] cleaning old logs..."
node "$RepoDir\log-cleanup.js" | Out-Host

Write-Host "[run] starting corp-server"
node "$RepoDir\corp-server.js"
