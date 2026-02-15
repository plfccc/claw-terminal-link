const WebSocket = require('ws');
const { SocksProxyAgent } = require('socks-proxy-agent');

const SOCKS_PROXY = process.env.SOCKS_PROXY || 'socks5h://127.0.0.1:1080';
const TARGET = process.env.TARGET || '127.0.0.1:17878';
const ACTION = process.argv[2] || 'list';
const SESSION_ID = process.argv[3] || '';

const ws = new WebSocket(`ws://${TARGET}`, { agent: new SocksProxyAgent(SOCKS_PROXY) });

ws.on('open', () => {
  const msg = { type: 'admin', action: ACTION };
  if (ACTION === 'kill') msg.sessionId = SESSION_ID;
  ws.send(JSON.stringify(msg));
});

ws.on('message', (raw) => {
  try {
    console.log(JSON.stringify(JSON.parse(raw.toString()), null, 2));
  } catch {
    console.log(raw.toString());
  }
  ws.close();
});

ws.on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
