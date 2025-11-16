#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Swarm Feed Uploader - Manual Collection Method
 *
 * This script manually creates a Collection object with explicit Unix paths
 * to work around potential Windows path issues in bee-js uploadFilesFromDirectory.
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');

// ===== CONFIG =====
const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';
const FEED_PRIVATE_KEY = 'YOUR_FEED_PRIVATE_KEY_HERE';
const FEED_TOPIC = 'woco-website';
const UPLOAD_DIR = './out';

// State files
const STATE_DIR = '.swarm';
const MANIFEST_STATE = path.join(STATE_DIR, 'feed-manifest.json');
const INFO_STATE = path.join(STATE_DIR, 'swarm-feed-info.json');

// ========== helpers ==========
async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }
async function readJsonIfExists(p) { try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return null; } }

/**
 * Recursively get all files with Unix-style paths
 */
function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      // Convert Windows path to Unix path
      const relativePath = path.relative(baseDir, fullPath);
      const unixPath = relativePath.split(path.sep).join('/');

      const data = fs.readFileSync(fullPath);
      files.push({
        path: unixPath,
        fsPath: fullPath,  // Original file system path
        size: data.length,
        data: data
      });
    }
  }

  return files;
}

(async () => {
  console.log('\n🚀 Starting Swarm Manual Collection Upload...\n');

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`❌ ERROR: Directory ${UPLOAD_DIR} does not exist. Run 'npm run build' first.`);
    process.exit(1);
  }

  try {
    const bee = new Bee(BEE_URL);
    const signer = new PrivateKey(FEED_PRIVATE_KEY);
    const ownerObj = signer.publicKey().address();
    const ownerHex = ownerObj.toHex();
    const topic = Topic.fromString(FEED_TOPIC);

    console.log(`📡 Bee: ${BEE_URL}`);
    console.log(`📝 Feed Topic: ${FEED_TOPIC}`);
    console.log(`👤 Feed Owner: ${ownerHex}\n`);

    // 1) Get all files and create Collection
    console.log(`📦 Scanning directory: ${UPLOAD_DIR}...`);
    const files = getAllFiles(UPLOAD_DIR);
    console.log(`   Found ${files.length} files\n`);

    // Log first few files to verify paths
    console.log('Sample file paths (first 10):');
    files.slice(0, 10).forEach(f => console.log(`   ${f.path}`));
    console.log('');

    // Upload collection using uploadCollection
    console.log('📤 Uploading collection to Swarm...');

    const uploadResult = await bee.uploadCollection(
      POSTAGE_BATCH_ID,
      files,
      {
        indexDocument: 'index.html',
        errorDocument: 'index.html'
      }
    );

    const siteRef = uploadResult.reference.toString();
    console.log(`✅ Collection uploaded. Reference: ${siteRef}`);

    // Use existing feed manifest
    await ensureDir(STATE_DIR);
    const manifestRef = '9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100';
    console.log(`🔁 Using feed manifest: ${manifestRef}`);

    // Save manifest state
    await fs.promises.writeFile(
      MANIFEST_STATE,
      JSON.stringify({ manifestRef, owner: ownerHex, topic: topic.toString() }, null, 2)
    );

    // Update feed
    console.log('🔄 Updating feed to new reference ...');
    const writer = bee.makeFeedWriter(topic, signer);
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

    // Add content hash to whitelist automatically
    console.log('📋 Adding content hash to whitelist...');
    try {
      const whitelistResponse = await fetch(`${BEE_URL}/admin/whitelist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: siteRef })
      });
      const whitelistResult = await whitelistResponse.json();
      if (whitelistResult.success) {
        console.log('✅ Hash added to whitelist');
      } else {
        console.log('⚠️  Whitelist response:', whitelistResult);
      }
    } catch (whitelistErr) {
      console.log('⚠️  Could not add to whitelist (may already exist):', whitelistErr.message);
    }

    // Save info
    const info = {
      timestamp: new Date().toISOString(),
      beeUrl: BEE_URL,
      owner: ownerHex,
      topicString: FEED_TOPIC,
      topicHex: topic.toString(),
      latestSiteReference: siteRef,
      manifestRef,
      feedUrl: `/feeds/${ownerHex}/${topic.toString()}`,
      bzzManifestUrl: `${BEE_URL}/bzz/${manifestRef}/`,
      bzzContentUrl: `${BEE_URL}/bzz/${siteRef}/`,
    };
    await fs.promises.writeFile(INFO_STATE, JSON.stringify(info, null, 2));

    console.log(`📝 Feed manifest (permanent): ${manifestRef}`);
    console.log(`📝 Latest content hash: ${siteRef}`);
    console.log(`📝 basePath in .env.production uses feed manifest hash (never changes)`);

    console.log('\n======================================================================');
    console.log('✅ UPLOAD COMPLETE!');
    console.log('======================================================================\n');

    console.log('📍 FEED ACCESS INFO');
    console.log(`   Owner:    ${ownerHex}`);
    console.log(`   Topic:    ${FEED_TOPIC}`);
    console.log(`   TopicHex: ${topic.toString()}`);

    console.log('\n🌐 TEST THESE URLS:');
    console.log(`   Feed manifest: ${BEE_URL}/bzz/${manifestRef}/`);
    console.log(`   Content hash:  ${BEE_URL}/bzz/${siteRef}/`);

    console.log('\n📝 NEXT STEPS:');
    console.log('   1) Add content hash to whitelist: ' + siteRef);
    console.log('   2) Test both URLs in your browser');
    console.log('   3) Check browser console for any errors');
    console.log('   4) If working, use bzz://' + manifestRef + ' for ENS\n');

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    if (err.response?.data) {
      console.error('Response:', err.response.data);
    }
    if (err.stack) {
      console.error('\nStack trace:', err.stack);
    }
    process.exit(1);
  }
})();
