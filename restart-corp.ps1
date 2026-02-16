# Restart script for corp-server
# Kills old processes and starts fresh

Write-Host "Stopping old node processes..." -ForegroundColor Yellow
taskkill /F /IM node.exe 2>$null

Start-Sleep -Seconds 1

Write-Host "Pulling latest code..." -ForegroundColor Yellow
git pull

Write-Host "Starting corp-server..." -ForegroundColor Green
node corp-server.js
