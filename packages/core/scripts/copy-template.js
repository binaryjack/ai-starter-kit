#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const files = fs.readdirSync(src);
  files.forEach(file => {
    const srcPath = path.join(src, file);
    const destPath = path.join(dest, file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  });
}

const src = path.join(__dirname, '..', 'template');
const dest = path.join(__dirname, '..', 'dist', 'template');

if (fs.existsSync(src)) {
  copyDir(src, dest);
  console.log(`Copied template from ${src} to ${dest}`);
} else {
  console.warn(`Template directory not found at ${src}`);
}
