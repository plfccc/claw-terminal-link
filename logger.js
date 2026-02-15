const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile(prefix = 'app') {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `${prefix}-${date}.log`);
}

function format(level, msg, meta = {}) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...meta,
  };
  return JSON.stringify(entry) + '\n';
}

const logger = {
  info(msg, meta) {
    const line = format('INFO', msg, meta);
    fs.appendFileSync(getLogFile('info'), line);
    console.log(`[INFO] ${msg}`, meta || '');
  },
  warn(msg, meta) {
    const line = format('WARN', msg, meta);
    fs.appendFileSync(getLogFile('warn'), line);
    console.warn(`[WARN] ${msg}`, meta || '');
  },
  error(msg, meta) {
    const line = format('ERROR', msg, meta);
    fs.appendFileSync(getLogFile('error'), line);
    console.error(`[ERROR] ${msg}`, meta || '');
  },
  debug(msg, meta) {
    const line = format('DEBUG', msg, meta);
    fs.appendFileSync(getLogFile('debug'), line);
    console.log(`[DEBUG] ${msg}`, meta || '');
  },
  getLogPath(prefix) {
    return getLogFile(prefix);
  },
};

module.exports = logger;
