#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Swarm Feed Uploader - Direct HTTP API
 *
 * This script uploads files one-by-one to create a proper Mantaray manifest
 * using the Swarm HTTP API directly, bypassing bee-js.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');

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

function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      const relativePath = path.relative(baseDir, fullPath);
      const unixPath = relativePath.split(path.sep).join('/');
      files.push({
        path: unixPath,
        fullPath: fullPath
      });
    }
  }

  return files;
}

(async () => {
  console.log('\n🚀 Starting Swarm Upload (Direct HTTP API)...\n');

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

    // 1) Get all files
    console.log(`📦 Scanning directory: ${UPLOAD_DIR}...`);
    const files = getAllFiles(UPLOAD_DIR);
    console.log(`   Found ${files.length} files\n`);

    // 2) Upload using direct HTTP API with proper Swarm headers
    console.log('📤 Uploading directory using HTTP API...');

    // Create a FormData-like multipart request
    // According to Bee API spec, all files should be in 'file' field with filepath option
    const FormData = require('form-data');
    const form = new FormData();

    for (const file of files) {
      const data = fs.readFileSync(file.fullPath);
      form.append('file', data, {
        filename: file.path,  // Use filename option for the path
        contentType: getContentType(file.path)
      });
    }

    const uploadResponse = await axios.post(`${BEE_URL}/bzz`, form, {
      headers: {
        ...form.getHeaders(),
        'Swarm-Postage-Batch-Id': POSTAGE_BATCH_ID,
        'Swarm-Index-Document': 'index.html',
        'Swarm-Error-Document': 'index.html',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const siteRef = uploadResponse.data.reference;
    console.log(`✅ Directory uploaded. Reference: ${siteRef}`);

    // Create/reuse feed manifest
    await ensureDir(STATE_DIR);
    let manifestRef;
    const manifestState = await readJsonIfExists(MANIFEST_STATE);

    if (manifestState?.manifestRef) {
      manifestRef = manifestState.manifestRef;
      console.log(`🔁 Using existing feed manifest: ${manifestRef}`);
    } else {
      console.log('🧭 Creating feed manifest (one-time) ...');
      manifestRef = await bee.createFeedManifest(
        POSTAGE_BATCH_ID,
        topic,
        ownerObj
      );
      console.log(`✅ Feed manifest created: ${manifestRef}`);
      await fs.promises.writeFile(
        MANIFEST_STATE,
        JSON.stringify({ manifestRef, owner: ownerHex, topic: topic.toString() }, null, 2)
      );
    }

    // Update feed
    console.log('🔄 Updating feed to new reference ...');
    const writer = bee.makeFeedWriter(topic, signer);
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

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
    console.log('   1) Test both URLs in your browser');
    console.log('   2) Check browser console for any errors');
    console.log('   3) If working, use bzz://' + manifestRef + ' for ENS\n');

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

function getContentType(filepath) {
  const ext = path.extname(filepath).toLowerCase();
  const types = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };
  return types[ext] || 'application/octet-stream';
}
