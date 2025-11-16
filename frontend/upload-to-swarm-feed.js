#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Swarm Feed Uploader
 *
 * This script uploads your built Next.js site to a Swarm feed.
 * A feed gives you a permanent address that you set once in ENS,
 * then you can update the content anytime while keeping the same address.
 *
 * SETUP:
 * 1. npm install @ethersphere/bee-js
 * 2. Update the variables below
 * 3. Build your site: npm run build
 * 4. Run: node upload-to-swarm-feed.js
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');
const tar = require('tar');
const axios = require('axios');

// ===== CONFIG YOU CAN EDIT =====
const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';

// Use a dedicated feed key for the website (not your wallet key)
const FEED_PRIVATE_KEY = 'YOUR_FEED_PRIVATE_KEY_HERE';
const FEED_TOPIC = 'woco-website';
const UPLOAD_DIR = './out';

// Persisted local files so we reuse the same manifest every time
const STATE_DIR = '.swarm';
const MANIFEST_STATE = path.join(STATE_DIR, 'feed-manifest.json');
const INFO_STATE = path.join(STATE_DIR, 'swarm-feed-info.json');

// ========== helpers ==========
async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }
async function readJsonIfExists(p) { try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return null; } }

(async () => {
  console.log('\n🚀 Starting Swarm Feed Upload...\n');

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`❌ ERROR: Directory ${UPLOAD_DIR} does not exist. Run 'npm run build' first.`);
    process.exit(1);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(FEED_PRIVATE_KEY)) {
    console.error('❌ ERROR: FEED_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.');
    process.exit(1);
  }

  try {
    const bee = new Bee(BEE_URL);
    const signer = new PrivateKey(FEED_PRIVATE_KEY);
    const ownerObj = signer.publicKey().address();      // EthAddress object
    const ownerHex = ownerObj.toHex();                  // hex for display
    const topic = Topic.fromString(FEED_TOPIC);

    console.log(`📡 Bee: ${BEE_URL}`);
    console.log(`📝 Feed Topic: ${FEED_TOPIC}`);
    console.log(`👤 Feed Owner: ${ownerHex}\n`);

    // 1) Create tar file manually with Unix paths to fix Windows backslash issue
    console.log(`📦 Creating tar from: ${UPLOAD_DIR} ...`);

    const tarPath = './site.tar';

    // Get all files in out directory
    const fs_local = require('fs');
    const path_local = require('path');

    function getAllFilesRecursive(dir, baseDir = dir, fileList = []) {
      const files = fs_local.readdirSync(dir);
      files.forEach(file => {
        const filePath = path_local.join(dir, file);
        if (fs_local.statSync(filePath).isDirectory()) {
          getAllFilesRecursive(filePath, baseDir, fileList);
        } else {
          // Get relative path without leading './' using Unix forward slashes
          const relativePath = path_local.relative(baseDir, filePath).split(path_local.sep).join('/');
          fileList.push(relativePath);
        }
      });
      return fileList;
    }

    const filesToInclude = getAllFilesRecursive(UPLOAD_DIR);

    // Create tar with explicit file list (no leading ./)
    await tar.create(
      {
        file: tarPath,
        cwd: UPLOAD_DIR,
        portable: true,  // Use Unix-style paths
        gzip: false
      },
      filesToInclude
    );

    console.log(`✅ Tar created: ${tarPath}`);

    // Read tar file
    const tarData = fs.readFileSync(tarPath);
    console.log(`📤 Uploading tar (${tarData.length} bytes)...`);

    // Upload tar directly to proxy with Swarm collection headers
    // Headers must be capitalized per Swarm docs
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

    // Keep tar file for debugging (comment out cleanup)
    // fs.unlinkSync(tarPath);
    console.log(`📝 Tar file preserved at: ${tarPath}`);

    // 2) Create feed manifest once and reuse it
    await ensureDir(STATE_DIR);
    let manifestRef;
    const manifestState = await readJsonIfExists(MANIFEST_STATE);

    if (manifestState?.manifestRef) {
      manifestRef = manifestState.manifestRef;
      console.log(`🔁 Using existing feed manifest: ${manifestRef}`);
    } else {
      console.log('🧭 Creating feed manifest (one-time) ...');
      // Correct signature: (batchId, topic, owner)
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

    // 3) Update the feed to point at the latest site reference
    console.log('🔄 Updating feed to new reference ...');
    const writer = bee.makeFeedWriter(topic, signer);
    // Use uploadPayload with the reference as hex bytes (like the forum app does)
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

    // 4) Save/update info
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

    // 5) Output the correct URLs
    console.log('\n======================================================================');
    console.log('✅ UPLOAD COMPLETE!');
    console.log('======================================================================\n');

    console.log('📍 FEED ACCESS INFO');
    console.log(`   Owner:    ${ownerHex}`);
    console.log(`   Topic:    ${FEED_TOPIC}`);
    console.log(`   TopicHex: ${topic.toString()}`);
    console.log(`   Feed URL: /feeds/${ownerHex}/${topic.toString()}`);

    console.log('\n🌐 OPEN THESE IN A BROWSER:');
    console.log(`   Website (STABLE feed address): ${BEE_URL}/bzz/${manifestRef}/`);
    console.log(`   Website (direct content ref):  ${BEE_URL}/bzz/${siteRef}/`);

    console.log('\n📝 NEXT STEPS:');
    console.log('   1) Test the website by opening the STABLE feed address above');
    console.log('   2) For ENS content hash, use: bzz://' + manifestRef);
    console.log('   3) To update the site: edit, rebuild, run this script again');
    console.log('      The manifest reference stays the same - ENS always shows latest!');

    console.log('\n💾 Saved: ' + INFO_STATE + ' and ' + MANIFEST_STATE + '\n');

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    if (err.response?.data) {
      console.error('Response:', err.response.data);
    }
    process.exit(1);
  }
})();
