const WebSocket = require('ws');
const net = require('net');
const { SocksProxyAgent } = require('socks-proxy-agent');
const logger = require('./logger');

const SOCKS_PROXY = process.env.SOCKS_PROXY || 'socks5h://127.0.0.1:1080';
const TARGET = process.env.TARGET || '127.0.0.1:17878';
const RETRY_MAX_MS = Number(process.env.RETRY_MAX_MS || 30000);

let sessionId = process.env.SESSION_ID || null;
let lastSeq = 0;
let retryMs = 1000;
let ws;
let pingTimeout;
let closing = false;

function parseHostPort(v) {
  const [host, p] = v.split(':');
  return { host, port: Number(p) };
}

function checkSocksOpen(socksUrl) {
  const u = new URL(socksUrl);
  const port = Number(u.port || 1080);
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: u.hostname, port, timeout: 3000 }, () => {
      s.end();
      resolve(true);
    });
    s.on('error', reject);
    s.on('timeout', () => {
      s.destroy(new Error('timeout')); reject(new Error('timeout'));
    });
  });
}

function start() {
  const agent = new SocksProxyAgent(SOCKS_PROXY);
  ws = new WebSocket(`ws://${TARGET}`, { agent });

  ws.on('open', () => {
    retryMs = 1000;
    logger.info('connected to server', { proxy: SOCKS_PROXY, target: TARGET });
    console.log(`connected via ${SOCKS_PROXY} -> ${TARGET}`);

    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();

    ws.send(JSON.stringify({
      type: 'hello',
      sessionId,
      lastSeq,
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 30,
    }));
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'hello_ack') {
      sessionId = msg.sessionId;
      logger.info('session established', { sessionId, resumed: msg.resumed });
      console.log(`[session] ${sessionId} ${msg.resumed ? '(resumed)' : '(new)'}`);
      return;
    }

    if (msg.type === 'data') {
      lastSeq = Math.max(lastSeq, Number(msg.seq || 0));
      process.stdout.write(msg.data);
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      clearTimeout(pingTimeout);
      pingTimeout = setTimeout(() => {
        try { ws.close(); } catch {}
      }, 25000);
      return;
    }

    if (msg.type === 'exit') {
      console.log(`\n[remote shell exit: ${msg.exitCode}]`);
      closing = true;
      process.exit(msg.exitCode || 0);
    }
  });

  ws.on('close', () => {
    clearTimeout(pingTimeout);
    if (closing) return;
    logger.warn('disconnected, retrying', { retryMs });
    console.log(`\n[disconnected] retry in ${Math.round(retryMs / 1000)}s...`);
    setTimeout(start, retryMs);
    retryMs = Math.min(Math.floor(retryMs * 1.8), RETRY_MAX_MS);
  });

  ws.on('error', (e) => {
    console.log(`\n[ws error] ${e.message}`);
  });
}

(async () => {
  try {
    await checkSocksOpen(SOCKS_PROXY);
  } catch (e) {
    logger.error('preflight failed: SOCKS proxy unavailable', { proxy: SOCKS_PROXY, error: e.message });
    console.error(`[preflight] SOCKS unavailable: ${SOCKS_PROXY} (${e.message})`);
    process.exit(1);
  }

  process.stdin.on('data', (chunk) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: chunk.toString('utf8') }));
    }
  });

  if (process.stdout.isTTY) {
    process.stdout.on('resize', () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: process.stdout.columns || 120, rows: process.stdout.rows || 30 }));
      }
    });
  }

  const t = parseHostPort(TARGET);
  logger.info('client starting', { proxy: SOCKS_PROXY, target: `${t.host}:${t.port}` });
  console.log(`[preflight] socks ok. target=${t.host}:${t.port}`);
  start();
})();
