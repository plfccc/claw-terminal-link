const WebSocket = require('ws');
const pty = require('node-pty');

const RELAY = process.env.RELAY || 'ws://127.0.0.1:8787';
const TOKEN = process.env.AUTH_TOKEN || 'change-me';
const AGENT_ID = process.env.AGENT_ID || 'corp-win-01';

const ws = new WebSocket(`${RELAY}?role=agent&token=${encodeURIComponent(TOKEN)}&id=${encodeURIComponent(AGENT_ID)}`);

const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
const term = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 120,
  rows: 30,
  cwd: process.cwd(),
  env: process.env,
});

ws.on('open', () => {
  console.log(`agent connected: ${AGENT_ID}`);
});

term.onData((data) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'data', data }));
  }
});

term.onExit(({ exitCode }) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'exit', exitCode }));
  }
  process.exit(exitCode || 0);
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (msg.type === 'input' && typeof msg.data === 'string') {
    term.write(msg.data);
  } else if (msg.type === 'resize') {
    term.resize(msg.cols || 120, msg.rows || 30);
  }
});

ws.on('close', () => {
  console.log('relay disconnected');
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('ws error:', e.message);
});
