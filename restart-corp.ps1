# Restart script for corp-server
# Kills old processes and starts fresh

Write-Host "Stopping old node processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null

Start-Sleep -Seconds 1

Write-Host "Cleaning up conflicting files..." -ForegroundColor Yellow
Remove-Item -Recurse -Force node_modules\node-pty\prebuilds\win32-x64 -ErrorAction SilentlyContinue

Write-Host "Pulling latest code..." -ForegroundColor Yellow
git fetch origin
git checkout -- .
git clean -fd
git pull

# Force remove conflicting node_modules
if (Test-Path "node_modules\node-pty\prebuilds\win32-x64") {
    Remove-Item -Recurse -Force "node_modules\node-pty\prebuilds\win32-x64" -ErrorAction SilentlyContinue
}

Write-Host "Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host "Starting corp-server..." -ForegroundColor Green
node corp-server.js
