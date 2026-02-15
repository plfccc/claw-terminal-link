const { WebSocketServer } = require('ws');
const pty = require('node-pty');
const net = require('net');
const crypto = require('crypto');
const logger = require('./logger');

const PORT = Number(process.env.PORT || 17878);
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 30 * 60 * 1000);
const MAX_BUFFER = Number(process.env.MAX_BUFFER || 2000);

function checkPortAvailable(host, port) {
  return new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', reject);
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, host);
  });
}

async function preflight() {
  const checks = [];
  checks.push({ name: 'node-version', ok: Number(process.versions.node.split('.')[0]) >= 18, detail: process.versions.node });
  checks.push({ name: 'node-pty', ok: !!pty.spawn, detail: 'loaded' });
  checks.push({ name: 'bind-host', ok: HOST === '127.0.0.1' || HOST === 'localhost', detail: HOST });
  try {
    await checkPortAvailable(HOST, PORT);
    checks.push({ name: 'port-available', ok: true, detail: `${HOST}:${PORT}` });
  } catch (e) {
    checks.push({ name: 'port-available', ok: false, detail: e.message });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

if (process.argv.includes('--check')) {
  preflight().then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
  });
  return;
}

const sessions = new Map();

function summarizeSession(s) {
  return {
    sessionId: s.sessionId,
    clients: s.clients.size,
    seq: s.seq,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    detachedAt: s.detachedAt,
    ttlMs: SESSION_TTL_MS,
  };
}

function runGc() {
  const now = Date.now();
  const removed = [];
  for (const [sid, session] of sessions.entries()) {
    if (!session.closed && session.clients.size === 0 && session.detachedAt && now - session.detachedAt > SESSION_TTL_MS) {
      try { session.term.kill(); } catch {}
      sessions.delete(sid);
      logger.info('session expired', { sessionId: sid });
    }
  }
  return removed;
}

function createSession() {
  const sessionId = crypto.randomUUID();
  const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
  const term = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  const session = {
    sessionId,
    term,
    clients: new Set(),
    seq: 0,
    buffer: [],
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    detachedAt: null,
    closed: false,
  };

  term.onData((data) => {
    session.seq += 1;
    session.lastActiveAt = Date.now();
    const payload = { type: 'data', sessionId, seq: session.seq, data };
    session.buffer.push(payload);
    if (session.buffer.length > MAX_BUFFER) session.buffer.shift();

    for (const client of session.clients) {
      if (client.readyState === client.OPEN) client.send(JSON.stringify(payload));
    }
  });

  term.onExit(({ exitCode }) => {
    session.closed = true;
    const payload = { type: 'exit', sessionId, exitCode };
    for (const client of session.clients) {
      if (client.readyState === client.OPEN) client.send(JSON.stringify(payload));
    }
    sessions.delete(sessionId);
  });

  sessions.set(sessionId, session);
  logger.info('session created', { sessionId, shell });
  return session;
}

function attachClient(session, ws) {
  session.clients.add(ws);
  session.detachedAt = null;
  session.lastActiveAt = Date.now();
  ws._sessionId = session.sessionId;
  logger.info('client attached', { sessionId: session.sessionId, clients: session.clients.size });
}

function detachClient(ws) {
  const session = sessions.get(ws._sessionId);
  if (!session) return;
  session.clients.delete(ws);
  if (session.clients.size === 0) session.detachedAt = Date.now();
  logger.info('client detached', { sessionId: session.sessionId, clients: session.clients.size });
}

setInterval(runGc, 5000);

(async () => {
  const pf = await preflight();
  if (!pf.ok) {
    console.error('preflight failed');
    console.error(JSON.stringify(pf, null, 2));
    process.exit(1);
  }

  const wss = new WebSocketServer({ host: HOST, port: PORT });

  wss.on('connection', (ws) => {
    let heartbeatTimer;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      // Admin protocol
      if (msg.type === 'admin') {
        if (msg.action === 'list') {
          ws.send(JSON.stringify({ type: 'admin_result', action: 'list', sessions: [...sessions.values()].map(summarizeSession) }));
        } else if (msg.action === 'kill' && typeof msg.sessionId === 'string') {
          const s = sessions.get(msg.sessionId);
          let killed = false;
          if (s) {
            try { s.term.kill(); } catch {}
            sessions.delete(msg.sessionId);
            killed = true;
          }
          ws.send(JSON.stringify({ type: 'admin_result', action: 'kill', sessionId: msg.sessionId, killed }));
        } else if (msg.action === 'gc') {
          const removed = runGc();
          ws.send(JSON.stringify({ type: 'admin_result', action: 'gc', removed }));
        }
        return;
      }

      if (msg.type === 'hello') {
        let session;
        if (msg.sessionId && sessions.has(msg.sessionId)) {
          session = sessions.get(msg.sessionId);
        } else {
          session = createSession();
        }
        attachClient(session, ws);

        if (msg.cols && msg.rows) {
          try { session.term.resize(msg.cols, msg.rows); } catch {}
        }

        ws.send(JSON.stringify({ type: 'hello_ack', sessionId: session.sessionId, resumed: !!msg.sessionId && msg.sessionId === session.sessionId }));

        const lastSeq = Number(msg.lastSeq || 0);
        for (const item of session.buffer) {
          if (item.seq > lastSeq && ws.readyState === ws.OPEN) ws.send(JSON.stringify(item));
        }

        clearInterval(heartbeatTimer);
        heartbeatTimer = setInterval(() => {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
        }, 10000);
        return;
      }

      const session = sessions.get(ws._sessionId);
      if (!session) return;

      if (msg.type === 'input' && typeof msg.data === 'string') {
        session.lastActiveAt = Date.now();
        session.term.write(msg.data);
      } else if (msg.type === 'resize') {
        try { session.term.resize(msg.cols || 120, msg.rows || 30); } catch {}
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeatTimer);
      detachClient(ws);
    });
  });

  console.log(`corp-server listening on ws://${HOST}:${PORT}`);
  logger.info('server started', { host: HOST, port: PORT });
})();
