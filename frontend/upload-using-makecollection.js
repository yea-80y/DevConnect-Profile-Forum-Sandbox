#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Swarm Feed Uploader - Using makeCollectionFromFS
 *
 * This script uses the official bee-js makeCollectionFromFS utility
 * which is specifically designed for Node.js filesystem operations.
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const { makeCollectionFromFS } = require('@ethersphere/bee-js/dist/cjs/utils/collection.node');
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

(async () => {
  console.log('\n🚀 Starting Swarm Upload (using makeCollectionFromFS)...\n');

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

    // 1) Create collection using official utility
    console.log(`📦 Creating collection from: ${UPLOAD_DIR}...`);
    const collection = await makeCollectionFromFS(UPLOAD_DIR);

    console.log(`   Found ${collection.length} files\n`);

    // Log first few files to verify paths
    console.log('Sample file paths (first 10):');
    collection.slice(0, 10).forEach(f => console.log(`   ${f.path} (${f.size} bytes)`));
    console.log('');

    // 2) Load file data into collection (makeCollectionFromFS doesn't load data)
    console.log('📤 Loading file data...');
    const collectionWithData = collection.map(entry => {
      const data = fs.readFileSync(entry.fsPath);
      return {
        path: entry.path.split(path.sep).join('/'),  // Convert to Unix paths
        size: entry.size,
        data: new Uint8Array(data)  // Convert Buffer to Uint8Array
      };
    });

    console.log('✅ Data loaded\n');

    // 3) Upload collection
    console.log('📤 Uploading collection to Swarm...');
    const uploadResult = await bee.uploadCollection(
      POSTAGE_BATCH_ID,
      collectionWithData,
      {
        indexDocument: 'index.html',
        errorDocument: 'index.html'
      }
    );

    const siteRef = uploadResult.reference.toString();
    console.log(`✅ Collection uploaded. Reference: ${siteRef}`);

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
