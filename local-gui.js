// Simple GUI Launcher for Claw Terminal
const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 17880;
const TERM_PORT = 17881;

// Simple HTTP server for GUI
const HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Claw Terminal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: #eee;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    h1 { 
      font-size: 32px; 
      margin-bottom: 10px; 
      color: #e94560; 
    }
    .subtitle { color: #888; margin-bottom: 30px; }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    .status {
      margin-bottom: 20px;
      padding: 15px;
      border-radius: 8px;
      font-size: 18px;
    }
    .connected { background: rgba(0,210,106,0.2); color: #00d26a; }
    .disconnected { background: rgba(233,69,96,0.2); color: #e94560; }
    .connecting { background: rgba(252,213,63,0.2); color: #fcd53f; }
    
    .btn {
      background: #e94560;
      color: white;
      border: none;
      padding: 15px 50px;
      border-radius: 8px;
      font-size: 18px;
      cursor: pointer;
      margin: 5px;
      transition: all 0.2s;
    }
    .btn:hover { transform: scale(1.05); background: #ff6b8a; }
    .btn:disabled { background: #444; cursor: not-allowed; transform: none; }
    .btn-secondary { background: #4dabf7; }
    .btn-secondary:hover { background: #74c0fc; }
    
    .info { margin-top: 20px; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <h1>🖥️ Claw Terminal</h1>
  <div class="subtitle">Remote Terminal via SOCKS Over RDP</div>
  
  <div class="card">
    <div class="status" id="status">
      <span id="statusText">Checking...</span>
    </div>
    
    <button class="btn" id="connectBtn" onclick="connect()">Connect</button>
    <button class="btn btn-secondary" id="openTermBtn" onclick="openTerminal()" disabled>Open Terminal</button>
    
    <div class="info">
      SOCKS: 127.0.0.1:1080 | Server: 127.0.0.1:17878
    </div>
  </div>

  <script>
    const status = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const openTermBtn = document.getElementById('openTermBtn');
    
    function setStatus(s, t) {
      status.className = 'status ' + s;
      statusText.textContent = t;
    }
    
    function connect() {
      setStatus('connecting', 'Connecting...');
      connectBtn.disabled = true;
      
      fetch('/connect').then(r => r.json()).then(d => {
        if (d.ok) {
          setStatus('connected', 'Connected to Corp!');
          openTermBtn.disabled = false;
        } else {
          setStatus('disconnected', d.error || 'Connection failed');
          connectBtn.disabled = false;
        }
      }).catch(e => {
        setStatus('disconnected', 'Error: ' + e.message);
        connectBtn.disabled = false;
      });
    }
    
    function openTerminal() {
      window.open('/terminal', '_blank');
    }
    
    // Check status
    fetch('/status').then(r => r.json()).then(d => {
      if (d.connected) {
        setStatus('connected', 'Connected to Corp!');
        openTermBtn.disabled = false;
      } else {
        setStatus('disconnected', 'Not connected');
      }
    }).catch(() => {
      setStatus('disconnected', 'Not connected');
    });
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connected: isConnected }));
  } else if (req.url === '/connect') {
    if (isConnected) {
      res.end(JSON.stringify({ ok: true }));
    } else {
      startClient((err) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: !err, error: err ? err.message : null }));
      });
    }
  } else if (req.url === '/terminal') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Terminal</title>
  <style>
    body { background: #000; margin: 0; }
    iframe { width: 100vw; height: 100vh; border: none; }
  </style>
</head>
<body>
  <iframe src="http://127.0.0.1:17878"></iframe>
</body>
</html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

let isConnected = false;
let clientProc = null;

function startClient(cb) {
  if (clientProc) {
    cb(null);
    return;
  }
  
  clientProc = spawn('node', ['local-client-socks.js'], {
    cwd: __dirname,
    env: { ...process.env, SOCKS_PROXY: 'socks5h://127.0.0.1:1080', TARGET: '127.0.0.1:17878' },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  
  clientProc.stdout.on('data', (d) => {
    console.log(d.toString());
    if (d.toString().includes('connected to server')) {
      isConnected = true;
      cb(null);
    }
  });
  
  clientProc.stderr.on('data', (d) => {
    console.error(d.toString());
  });
  
  clientProc.on('close', () => {
    isConnected = false;
    clientProc = null;
  });
  
  // Check after 5 seconds
  setTimeout(() => {
    if (!isConnected) {
      cb(new Error('Connection timeout'));
    }
  }, 5000);
}

server.listen(PORT, () => {
  console.log(`Claw GUI: http://127.0.0.1:${PORT}`);
  console.log(`Terminal: http://127.0.0.1:${PORT}/terminal`);
});
