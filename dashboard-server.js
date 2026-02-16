const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const logger = require('./logger');

const HTTP_PORT = Number(process.env.DASHBOARD_PORT || 17879);
const CORP_SERVER = process.env.CORP_SERVER || '127.0.0.1:17878';
const LOG_DIR = path.join(__dirname, 'logs');

const HTML_FILE = path.join(__dirname, 'dashboard.html');

let sessionId = null;
let isConnected = false;
let startTime = Date.now();

// HTTP server for dashboard
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(HTML_FILE, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading dashboard');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else if (req.url === '/api/status') {
    const mem = process.memoryUsage();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      sessionId,
      connected: isConnected,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
      },
      system: {
        totalMem: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
        freeMem: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
        cpuCount: os.cpus().length,
      }
    }));
  } else if (req.url === '/api/logs') {
    const logs = [];
    if (fs.existsSync(LOG_DIR)) {
      const files = fs.readdirSync(LOG_DIR).sort().reverse().slice(0, 3);
      for (const file of files) {
        const content = fs.readFileSync(path.join(LOG_DIR, file), 'utf8');
        const lines = content.trim().split('\n').slice(-20);
        logs.push({ file, lines });
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logs));
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket for dashboard clients
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('dashboard client connected');
  
  ws.send(JSON.stringify({
    type: 'status',
    sessionId,
    connected: isConnected,
  }));
  
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'getStatus') {
        ws.send(JSON.stringify({
          type: 'status',
          sessionId,
          connected: isConnected,
        }));
      }
    } catch (e) {}
  });
  
  ws.on('close', () => {
    logger.info('dashboard client disconnected');
  });
});

function connectToCorpServer() {
  const ws = new WebSocket(`ws://${CORP_SERVER}`);
  
  ws.on('open', () => {
    isConnected = true;
    logger.info('connected to corp-server for dashboard');
    // Monitor mode - don't create sessions
    ws.send(JSON.stringify({ type: 'hello', sessionId: null, lastSeq: 0, monitor: true }));
  });
  
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hello_ack' && msg.monitor) {
        // Monitor mode - just confirm connection
        isConnected = true;
        broadcastStatus();
        logger.info('dashboard connected in monitor mode');
      } else if (msg.type === 'session_list') {
        // Received session list from corp-server
        broadcastSessions(msg.sessions);
      }
    } catch (e) {}
  });
  
  ws.on('close', () => {
    isConnected = false;
    sessionId = null;
    broadcastStatus();
    logger.warn('disconnected from corp-server, retrying in 5s');
    setTimeout(connectToCorpServer, 5000);
  });
  
  ws.on('error', (e) => {
    logger.error('corp-server connection error', { error: e.message });
  });
}

function broadcastStatus() {
  const status = JSON.stringify({
    type: 'status',
    sessionId,
    connected: isConnected,
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(status);
    }
  });
}

let cachedSessions = [];
function broadcastSessions(sessions) {
  cachedSessions = sessions;
  const data = JSON.stringify({
    type: 'sessions',
    sessions,
  });
  
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  logger.info('dashboard server started', { httpPort: HTTP_PORT, corpServer: CORP_SERVER });
  console.log(`Dashboard: http://127.0.0.1:${HTTP_PORT}`);
  console.log(`API: http://127.0.0.1:${HTTP_PORT}/api/status`);
  connectToCorpServer();
});
