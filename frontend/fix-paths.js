#!/usr/bin/env node

/**
 * Post-build script to fix asset paths for Swarm hosting
 * Converts absolute paths (/_next/) to relative paths (./_next/)
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = './out';

function fixPaths(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Replace absolute paths with relative paths
  const replacements = [
    // Handle both /_next/ and _next/ (webpack outputs _next/ without leading slash)
    [/href="\/_next\//g, 'href="./_next/'],
    [/src="\/_next\//g, 'src="./_next/'],
    [/href="_next\//g, 'href="./_next/'],
    [/src="_next\//g, 'src="./_next/'],
    [/href="\/favicon\.ico"/g, 'href="./favicon.ico"'],
    [/href="\/([^"\/]+\.(?:css|js|svg|png|ico|jpg|jpeg|gif|webp))"/g, 'href="./$1"'],
    [/src="\/([^"\/]+\.(?:js|svg|png|ico|jpg|jpeg|gif|webp))"/g, 'src="./$1"'],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed paths in: ${filePath}`);
  }
}

function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      fixPaths(fullPath);
    }
  }
}

console.log('🔧 Fixing asset paths for Swarm hosting...\n');
processDirectory(OUT_DIR);
console.log('\n✅ All HTML files updated!');
