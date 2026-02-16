// Simple GUI with Terminal - CodeX version
const { spawn } = require('child_process');
const http = require('http');
const { WebSocketServer } = require('ws');
const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');

const PORT = 17880;
const TERM_PORT = 17881;

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
    h1 { font-size: 32px; margin-bottom: 10px; color: #e94560; }
    .subtitle { color: #888; margin-bottom: 30px; }
    .card {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      text-align: center;
      backdrop-filter: blur(10px);
    }
    .status { margin-bottom: 20px; padding: 15px; border-radius: 8px; font-size: 18px; }
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
    }
    .btn:hover { transform: scale(1.05); background: #ff6b8a; }
    .btn:disabled { background: #444; cursor: not-allowed; transform: none; }
    .btn-secondary { background: #4dabf7; }
    .btn-secondary:hover { background: #74c0fc; }
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

const TERM_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Terminal</title>
  <link rel="stylesheet" href="https://unpkg.com/xterm/css/xterm.css" />
  <style>
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #111;
      overflow: hidden;
    }
    #terminal {
      width: 100%;
      height: 100%;
      padding: 8px;
      box-sizing: border-box;
    }
  </style>
</head>
<body>
  <div id="terminal"></div>

  <script src="https://unpkg.com/xterm/lib/xterm.js"></script>
  <script src="https://unpkg.com/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <script>
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Consolas, Menlo, monospace',
      fontSize: 14,
      theme: { background: '#111111' },
      convertEol: true,
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal'));
    fitAddon.fit();

    const ws = new WebSocket('ws://127.0.0.1:17881/');

    ws.onopen = () => {
      term.writeln('[connected]');
      sendResize();
    };

    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === 'data' && m.data) term.write(m.data);
        else if (m.type === 'hello_ack') term.writeln('[session: ' + m.sessionId + ']');
        else if (m.type === 'raw' && m.data) term.write(m.data);
        else if (m.type === 'error' && m.data) term.writeln('\r\n[error] ' + m.data);
      } catch {
        term.write(e.data);
      }
    };

    ws.onclose = () => term.writeln('\r\n[disconnected]');
    ws.onerror = () => term.writeln('\r\n[ws error]');

    term.onData((data) => {
      if (ws.readyState === 1) ws.send(data);
    });

    function sendResize() {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }

    window.addEventListener('resize', () => {
      fitAddon.fit();
      sendResize();
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
  } else if (req.url.startsWith('/terminal')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(TERM_HTML);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

let isConnected = false;
let clientProc = null;

const wss = new WebSocketServer({ port: TERM_PORT });

wss.on('connection', (ws) => {
  console.log('Terminal client connected');
  
  const agent = new SocksProxyAgent('socks5h://127.0.0.1:1080');
  const corpWs = new WebSocket('ws://127.0.0.1:17878', { agent });
  
  corpWs.on('open', () => {
    console.log('Connected to corp-server via SOCKS');
    ws.send(JSON.stringify({ type: 'raw', data: '[Connected to corp-server]\\n' }));
    corpWs.send(JSON.stringify({ type: 'hello', cols: 80, rows: 24 }));
  });
  
  corpWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      ws.send(data.toString());
    } catch {
      ws.send(data.toString());
    }
  });
  
  corpWs.on('close', () => ws.close());
  corpWs.on('error', (e) => ws.send(JSON.stringify({ type: 'error', data: e.message })));
  
  ws.on('message', (msg) => {
    if (corpWs.readyState !== WebSocket.OPEN) return;

    let text = msg.toString();
    // Browser sends raw command text; corp-server expects JSON protocol.
    // Accept both raw text and already-structured protocol JSON.
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && parsed.type) {
        corpWs.send(JSON.stringify(parsed));
        return;
      }
    } catch {}

    // PTY on Windows expects CR for Enter.
    text = text.replace(/\n/g, '\r');
    corpWs.send(JSON.stringify({ type: 'input', data: text }));
  });
  
  ws.on('close', () => corpWs.close());
});

function startClient(cb) {
  if (clientProc) { cb(null); return; }
  
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
  
  clientProc.stderr.on('data', (d) => console.error(d.toString()));
  clientProc.on('close', () => { isConnected = false; clientProc = null; });
  
  setTimeout(() => { if (!isConnected) cb(new Error('Connection timeout')); }, 5000);
}

server.listen(PORT, () => {
  console.log(`Claw GUI: http://127.0.0.1:${PORT}`);
  console.log(`Terminal: http://127.0.0.1:${PORT}/terminal`);
});
