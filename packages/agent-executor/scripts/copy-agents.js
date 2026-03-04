const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../../../agents');
const dest = path.resolve(__dirname, '../dist/agents');

function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    console.log(`[copy-agents] Source not found: ${from} — skipping`);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from)) {
    const fromPath = path.join(from, entry);
    const toPath = path.join(to, entry);
    const stat = fs.statSync(fromPath);
    if (stat.isDirectory()) {
      copyDir(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  }
}

copyDir(src, dest);
console.log(`[copy-agents] Copied ${src} → ${dest}`);
