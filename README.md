# Claw Terminal Link（中文说明）

一个基于 **SocksOverRDP** 的远程终端方案：
- 不走 SSH
- 通过公司机本地 SOCKS5（通常 `127.0.0.1:1080`）建立链路
- 提供：CLI 终端、会话恢复、管理命令、Web Dashboard、本地 GUI（xterm.js）

---

## 1. 项目目标

在公司内网受限、无法开 SSH 的场景下，仍能从本机稳定访问公司机终端。

核心思路：
1. 公司机运行 `corp-server.js`（WebSocket + node-pty）
2. 本机通过 SOCKS5 连接到公司机 `127.0.0.1:17878`
3. 本机可用 CLI 或 GUI 进行交互

---

## 2. 当前架构

### 公司机
- `corp-server.js`
  - 监听 `127.0.0.1:17878`
  - 创建 PowerShell PTY
  - 支持 session 断线恢复（sessionId/seq）
  - 支持心跳与 GC

### 本机
- `local-client-socks.js`
  - 通过 `socks5h://127.0.0.1:1080` 连接公司机
  - 自动重连（指数退避）
  - 会话恢复
- `local-gui.js`
  - GUI 入口（`http://127.0.0.1:17880`）
  - xterm.js 终端页（`/terminal`）
  - 本地 WS 桥接（17881）

### 运维脚本
- `restart-corp.ps1`：稳健重启（精确杀进程 + 更新 + 安装 + 后台启动 + 健康检查 + 前台兜底）
- `restart-corp-detached.ps1`：脱离当前会话触发重启（适合“远程会话执行重启”）
- `run-server.ps1`、`update.ps1`、`install-task.ps1`

---

## 3. 运行条件（必备）

1. 公司机已可用 SocksOverRDP，本机可访问 `127.0.0.1:1080`
2. Node.js >= 18（已实测 24.x）
3. 公司机和本机均有项目目录
4. 公司机允许本地监听 `127.0.0.1:17878`

---

## 4. 快速开始

## 4.1 公司机首次

```powershell
cd D:\app\FEISHU\download\claw-deploy
npm install
npm run corp-check
npm run corp-server
```

看到 `corp-server listening on ws://127.0.0.1:17878` 即正常。

## 4.2 本机 CLI 连接

```powershell
cd D:\project\claw
$env:SOCKS_PROXY='socks5h://127.0.0.1:1080'
$env:TARGET='127.0.0.1:17878'
npm run local-client-socks
```

## 4.3 本机 GUI 连接

```powershell
cd D:\project\claw
npm run gui
```

浏览器打开：
- `http://127.0.0.1:17880`
- 点击 `Connect`
- 点击 `Open Terminal`

---

## 5. 常用命令

```powershell
# 公司端检查
npm run corp-check

# 公司端前台启动（排错首选）
npm run corp-server

# 公司端重启（本机控制台执行可用）
npm run corp-restart

# 公司端重启（远程会话执行推荐，不依赖当前会话）
npm run corp-restart-detached

# 本机 CLI
npm run local-client-socks

# 本机管理
npm run admin-client-socks -- list
npm run admin-client-socks -- gc
npm run admin-client-socks -- kill <sessionId>

# 本机 GUI
npm run gui

# Dashboard
npm run dashboard
```

---

## 6. 重要说明：为什么远程执行重启容易“看起来失败”

如果你是在“由 corp-server 提供的远程终端里”执行重启：
- 重启会先停掉 corp-server
- 当前远程会话本身会断
- 客户端会看到 `ConnectionRefused`

这不一定代表命令没执行，而是执行环境被中断。

**解决办法：**使用 `npm run corp-restart-detached`。

---

## 7. 故障排查

## 7.1 `ConnectionRefused 127.0.0.1:17878`

优先检查公司机：
```powershell
cd D:\app\FEISHU\download\claw-deploy
npm run corp-server
```

如果仍失败，再看：
```powershell
type .\logs\corp-server.out.log
type .\logs\corp-server.err.log
netstat -ano | findstr 17878
```

## 7.2 `EADDRINUSE: 17878`

说明已存在实例在监听，非异常；
此时不要再重复启动第二个 `corp-server`。

## 7.3 node-pty 相关问题

先重启并重装依赖：
```powershell
npm run corp-restart
```

---

## 8. 安全边界

当前版本设计为内网快速迭代：
- 无 TLS/签名鉴权（默认）
- 强制监听 localhost

请勿直接暴露公网端口。

---

## 9. 本次精简与清理说明

已清理/优化：
1. 删除旧实验文件：`relay.js` / `agent.js` / `client.js`
2. 删除无关快照文档：`usage.html` / `usage-snapshot.png`
3. `.gitignore` 增加日志与运行产物忽略：
   - `logs/`
   - `*.pid`
   - `*.out.log`
   - `*.err.log`
4. 移除 package 里旧脚本入口，保留当前实际使用链路

保留文件均为当前链路所需。
