# claw-terminal-relay (MVP -> v1)

Reverse terminal over SocksOverRDP.

> Auto-update test @ 2026-02-16 00:50

## What you have now

- `corp-server.js` (run on corp machine)
  - listens on `127.0.0.1:17878`
  - session persistence (`sessionId`)
  - detach/resume support
  - TTL cleanup for detached sessions (default 30 min)
  - startup preflight checks
- `local-client-socks.js` (run on local machine)
  - connects via `socks5h://127.0.0.1:1080`
  - auto reconnect (exponential backoff)
  - resume previous session automatically
  - SOCKS preflight check

## Install

```bash
npm install
```

## Corp machine (inside RDP)

```bash
cd <project>
node corp-server.js --check
npm run corp-server
```

Optional env:

- `PORT` (default `17878`)
- `HOST` (default `127.0.0.1`)
- `SESSION_TTL_MS` (default `1800000`)
- `MAX_BUFFER` (default `2000`)

## Local machine

```bash
cd D:\project\claw
set SOCKS_PROXY=socks5h://127.0.0.1:1080
set TARGET=127.0.0.1:17878
npm run local-client-socks
```

PowerShell version:

```powershell
$env:SOCKS_PROXY="socks5h://127.0.0.1:1080"
$env:TARGET="127.0.0.1:17878"
npm run local-client-socks
```

## Test

After connected:

```powershell
hostname
whoami
```

Disconnect network / stop SocksOverRDP briefly, then restore. Client should reconnect and resume same session.

## Session admin (new)

From local machine (through SOCKS):

```bash
npm run admin-client-socks -- list
npm run admin-client-socks -- gc
npm run admin-client-socks -- kill <sessionId>
```

## Auto update + startup (GitHub workflow)

1) Clone repo on corp machine once:

```powershell
git clone https://github.com/plfccc/claw-terminal-link.git D:\app\FEISHU\download\claw-deploy
cd D:\app\FEISHU\download\claw-deploy
npm install
```

2) Start with update-then-run:

```powershell
powershell -ExecutionPolicy Bypass -File .\run-server.ps1
```

3) Install auto-start task:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1
```

4) Manual update only:

```powershell
powershell -ExecutionPolicy Bypass -File .\update.ps1
```

## Notes

- This is still a fast-iteration build (no auth/TLS yet by design).
- Keep server bound to localhost only.
