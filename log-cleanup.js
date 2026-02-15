const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const DAYS_TO_KEEP = 7;

function cleanup() {
  if (!fs.existsSync(LOG_DIR)) return;
  
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;
  const cutoff = now - (DAYS_TO_KEEP * msPerDay);
  
  const files = fs.readdirSync(LOG_DIR);
  let removed = 0;
  
  for (const file of files) {
    const filePath = path.join(LOG_DIR, file);
    const stat = fs.statSync(filePath);
    
    if (stat.mtimeMs < cutoff) {
      fs.unlinkSync(filePath);
      removed++;
      console.log(`[log-cleanup] removed: ${file}`);
    }
  }
  
  console.log(`[log-cleanup] done, removed ${removed} files`);
}

if (require.main === module) {
  cleanup();
}

module.exports = { cleanup, DAYS_TO_KEEP };
