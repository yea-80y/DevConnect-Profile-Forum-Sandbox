#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * ENS-Specific Swarm Feed Uploader
 *
 * This script uploads a basePath-free build to your existing Swarm feed.
 * Use this for ENS deployment via eth.limo to avoid double-nested paths.
 *
 * SETUP:
 * 1. npm run build:ens (builds without basePath)
 * 2. node upload-to-swarm-ens.js
 *
 * This updates your existing feed manifest (9ebcea...) with new content.
 * Your ENS content hash stays the same: bzz://9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const axios = require('axios');

// ===== CONFIG (matches your main upload script) =====
const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';

// Same feed credentials as main script
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

(async () => {
  console.log('\n🚀 Starting ENS-Specific Swarm Upload...\n');
  console.log('ℹ️  This uploads a basePath-free build to your existing feed for eth.limo compatibility.\n');

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`❌ ERROR: Directory ${UPLOAD_DIR} does not exist.`);
    console.error('   Run "npm run build:ens" first to create a basePath-free build.');
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(FEED_PRIVATE_KEY)) {
    console.error('❌ ERROR: FEED_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.');
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

    // 1) Create tar file with Unix paths
    console.log(`📦 Creating tar from: ${UPLOAD_DIR} (basePath-free build)...`);

    const tarPath = './site-ens.tar';

    function getAllFilesRecursive(dir, baseDir = dir, fileList = []) {
      const files = fs.readdirSync(dir);
      files.forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
          getAllFilesRecursive(filePath, baseDir, fileList);
        } else {
          const relativePath = path.relative(baseDir, filePath).split(path.sep).join('/');
          fileList.push(relativePath);
        }
      });
      return fileList;
    }

    const filesToInclude = getAllFilesRecursive(UPLOAD_DIR);

    // Create tar
    await tar.create(
      {
        file: tarPath,
        cwd: UPLOAD_DIR,
        portable: true,
        gzip: false
      },
      filesToInclude
    );

    console.log(`✅ Tar created: ${tarPath}`);

    // 2) Upload tar to Swarm
    const tarData = fs.readFileSync(tarPath);
    console.log(`📤 Uploading tar (${tarData.length} bytes)...`);

    const uploadResponse = await axios.post(`${BEE_URL}/bzz`, tarData, {
      headers: {
        'Content-Type': 'application/x-tar',
        'Swarm-Postage-Batch-Id': POSTAGE_BATCH_ID,
        'Swarm-Index-Document': 'index.html',
        'Swarm-Error-Document': 'index.html',
        'Swarm-Collection': 'true'
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    const siteRef = uploadResponse.data.reference;
    console.log(`✅ Tar uploaded. Reference: ${siteRef}`);

    // Keep tar for debugging
    console.log(`📝 Tar file preserved at: ${tarPath}`);

    // 3) Load existing feed manifest (should already exist from main script)
    await ensureDir(STATE_DIR);
    const manifestState = await readJsonIfExists(MANIFEST_STATE);

    if (!manifestState || !manifestState.manifestRef) {
      console.error('\n❌ ERROR: No existing feed manifest found.');
      console.error('   Run "node upload-to-swarm-feed.js" first to create the feed.');
      console.error('   This script only updates an existing feed.\n');
      process.exit(1);
    }

    const manifestRef = manifestState.manifestRef;
    console.log(`🔁 Using existing feed manifest: ${manifestRef}`);

    // 4) Update the feed to point at the new basePath-free content
    console.log('🔄 Updating feed to new basePath-free reference...');
    const writer = bee.makeFeedWriter(topic, signer);
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

    // 5) Save/update info
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
      ensNote: 'Built without basePath for eth.limo compatibility'
    };
    await fs.promises.writeFile(INFO_STATE, JSON.stringify(info, null, 2));

    // 6) Output the URLs
    console.log('\n======================================================================');
    console.log('✅ ENS UPLOAD COMPLETE!');
    console.log('======================================================================\n');

    console.log('📍 FEED ACCESS INFO');
    console.log(`   Owner:    ${ownerHex}`);
    console.log(`   Topic:    ${FEED_TOPIC}`);
    console.log(`   Manifest: ${manifestRef}`);

    console.log('\n🌐 ACCESS URLs:');
    console.log(`   Direct Gateway: ${BEE_URL}/bzz/${manifestRef}/`);
    console.log(`   ENS (eth.limo): https://woco.eth.limo/`);
    console.log(`   ENS (eth.link): https://woco.eth.link/`);

    console.log('\n📝 ENS SETUP:');
    console.log(`   Your ENS content hash is already set to: bzz://${manifestRef}`);
    console.log(`   No need to update ENS - the feed now points to basePath-free content!`);
    console.log(`   Wait ~5-10 minutes for eth.limo cache to refresh, then test.`);

    console.log('\n🔄 NEXT UPDATES:');
    console.log('   For content updates: npm run build:ens && npm run upload:ens');
    console.log('   The manifest reference stays the same - ENS always shows latest!\n');

    console.log('💾 Saved: ' + INFO_STATE + '\n');

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    if (err.response?.data) {
      console.error('Response:', err.response.data);
    }
    process.exit(1);
  }
})();
