const http = require('http');
const { WebSocketServer } = require('ws');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'change-me';

const agents = new Map(); // agentId -> ws

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ ok: true, agents: [...agents.keys()] }));
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const role = url.searchParams.get('role');
  const token = url.searchParams.get('token');

  if (token !== AUTH_TOKEN) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    ws._meta = { role, url };
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  const { role, url } = ws._meta;

  if (role === 'agent') {
    const agentId = url.searchParams.get('id') || `agent-${Date.now()}`;
    agents.set(agentId, ws);
    ws._agentId = agentId;
    ws.send(JSON.stringify({ type: 'registered', agentId }));

    ws.on('close', () => agents.delete(agentId));
    ws.on('message', () => {});
    return;
  }

  if (role === 'client') {
    const target = url.searchParams.get('target');
    const agent = agents.get(target);
    if (!agent || agent.readyState !== 1) {
      ws.send(JSON.stringify({ type: 'error', message: `agent ${target} not online` }));
      ws.close();
      return;
    }

    // client -> agent
    ws.on('message', (msg) => {
      if (agent.readyState === 1) agent.send(msg);
    });

    // agent -> client
    const onAgentMessage = (msg) => {
      if (ws.readyState === 1) ws.send(msg);
    };
    agent.on('message', onAgentMessage);

    const cleanup = () => {
      try { agent.off('message', onAgentMessage); } catch {}
    };

    ws.on('close', cleanup);
    agent.on('close', () => {
      if (ws.readyState === 1) ws.close();
      cleanup();
    });

    return;
  }

  ws.send(JSON.stringify({ type: 'error', message: 'invalid role' }));
  ws.close();
});

server.listen(PORT, () => {
  console.log(`relay listening on :${PORT}`);
});
