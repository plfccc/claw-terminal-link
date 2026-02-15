const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const logger = require('./logger');

const HTTP_PORT = Number(process.env.DASHBOARD_PORT || 17879);
const CORP_SERVER = process.env.CORP_SERVER || '127.0.0.1:17878';

const HTML_FILE = path.join(__dirname, 'dashboard.html');

let sessionId = null;
let isConnected = false;

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
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// WebSocket for dashboard clients
const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

wss.on('connection', (ws) => {
  logger.info('dashboard client connected');
  
  // Send current status immediately
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

// Connect to corp-server to get status updates
function connectToCorpServer() {
  const ws = new WebSocket(`ws://${CORP_SERVER}`);
  
  ws.on('open', () => {
    isConnected = true;
    logger.info('connected to corp-server for dashboard');
    
    // Send hello without session to just get connection status
    ws.send(JSON.stringify({ type: 'hello', sessionId: null, lastSeq: 0 }));
  });
  
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      
      if (msg.type === 'hello_ack') {
        sessionId = msg.sessionId;
        broadcastStatus();
        logger.info('got session from corp-server', { sessionId });
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

// Start HTTP server
httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  logger.info('dashboard server started', { httpPort: HTTP_PORT, corpServer: CORP_SERVER });
  console.log(`Dashboard: http://127.0.0.1:${HTTP_PORT}`);
  connectToCorpServer();
});
