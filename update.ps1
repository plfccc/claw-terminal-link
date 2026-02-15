param(
  [string]$RepoDir = "$PSScriptRoot",
  [string]$Branch = "main",
  [string]$Remote = "origin",
  [switch]$InstallDeps = $true
)

$ErrorActionPreference = "Stop"
Set-Location $RepoDir

if (-not (Test-Path ".git")) {
  throw "Not a git repo: $RepoDir"
}

Write-Host "[update] repo=$RepoDir branch=$Branch remote=$Remote"

git fetch $Remote $Branch --prune | Out-Host

$local = (git rev-parse HEAD).Trim()
$remoteRef = "$Remote/$Branch"
$remote = (git rev-parse $remoteRef).Trim()

if ($local -eq $remote) {
  Write-Host "[update] already up to date ($local)"
  exit 0
}

Write-Host "[update] new commit found: $local -> $remote"
git checkout $Branch | Out-Host
git pull --ff-only $Remote $Branch | Out-Host

if ($InstallDeps) {
  if (Test-Path "package-lock.json") {
    Write-Host "[update] npm ci"
    npm ci | Out-Host
  } else {
    Write-Host "[update] npm install"
    npm install | Out-Host
  }
}

Write-Host "[update] done"
