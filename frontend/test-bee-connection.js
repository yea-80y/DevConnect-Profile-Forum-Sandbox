#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Test Bee Connection
 *
 * Quick test to verify your bee gateway is accessible and working
 * before attempting a full upload.
 */

const https = require('https');
const fs = require('fs');

const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';
const OUT_DIR = './out';

console.log('\n🔍 Testing Bee Gateway Connection...\n');

// Test 1: Check if bee gateway is accessible
console.log(`📡 Test 1: Checking ${BEE_URL}...`);

https.get(BEE_URL + '/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Gateway is accessible!\n');

      // Test 2: Check postage batch
      console.log(`📮 Test 2: Checking postage batch...`);
      https.get(`${BEE_URL}/stamps/${POSTAGE_BATCH_ID}`, (res2) => {
        let data2 = '';
        res2.on('data', chunk => data2 += chunk);
        res2.on('end', () => {
          if (res2.statusCode === 200) {
            const batch = JSON.parse(data2);
            console.log('✅ Postage batch is valid!');
            console.log(`   Batch ID: ${batch.batchID.slice(0, 20)}...`);
            console.log(`   Utilization: ${batch.utilization}%`);
            console.log(`   Usable: ${batch.usable}\n`);

            // Test 3: Check build directory
            console.log(`📁 Test 3: Checking build output...`);
            if (fs.existsSync(OUT_DIR)) {
              const files = fs.readdirSync(OUT_DIR);
              const hasIndex = files.includes('index.html');
              console.log(`✅ Build directory exists: ${OUT_DIR}`);
              console.log(`   Files found: ${files.length}`);
              console.log(`   Has index.html: ${hasIndex ? '✅' : '❌'}\n`);

              if (!hasIndex) {
                console.log('⚠️  WARNING: index.html not found. Run "npm run build" first!\n');
              } else {
                console.log('🎉 All checks passed! Ready to upload.\n');
                console.log('Run: node upload-to-swarm-feed.js\n');
              }
            } else {
              console.log(`❌ Build directory not found: ${OUT_DIR}`);
              console.log('   Run "npm run build" first!\n');
            }

          } else {
            console.log(`❌ Postage batch check failed (${res2.statusCode})`);
            console.log(`   Response: ${data2}\n`);
          }
        });
      }).on('error', err => {
        console.log('❌ Failed to check postage batch:', err.message, '\n');
      });

    } else {
      console.log(`❌ Gateway returned status ${res.statusCode}`);
      console.log(`   Response: ${data}\n`);
    }
  });
}).on('error', err => {
  console.log('❌ Cannot connect to gateway:', err.message);
  console.log('   Make sure the gateway URL is correct and accessible.\n');
});
