const WebSocket = require('ws');

const RELAY = process.env.RELAY || 'ws://127.0.0.1:8787';
const TOKEN = process.env.AUTH_TOKEN || 'change-me';
const TARGET = process.env.TARGET || 'corp-win-01';

const ws = new WebSocket(`${RELAY}?role=client&token=${encodeURIComponent(TOKEN)}&target=${encodeURIComponent(TARGET)}`);

ws.on('open', () => {
  console.log(`connected to agent: ${TARGET}`);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.on('data', (chunk) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data: chunk.toString('utf8') }));
    }
  });

  if (process.stdout.isTTY) {
    ws.send(JSON.stringify({
      type: 'resize',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 30,
    }));
  }
});

ws.on('message', (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  if (msg.type === 'data') {
    process.stdout.write(msg.data);
  } else if (msg.type === 'exit') {
    console.log(`\n[remote shell exit: ${msg.exitCode}]`);
    process.exit(msg.exitCode || 0);
  } else if (msg.type === 'error') {
    console.error(`error: ${msg.message}`);
    process.exit(1);
  }
});

ws.on('close', () => {
  console.log('\nconnection closed');
  process.exit(0);
});

ws.on('error', (e) => {
  console.error('ws error:', e.message);
  process.exit(1);
});
