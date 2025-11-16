#!/usr/bin/env node

/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Swarm Feed Uploader with Unix Path Fix
 *
 * This script manually creates a tar file with Unix-style forward slashes,
 * then uploads it to Swarm. This avoids Windows backslash path issues.
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');
const tar = require('tar');

// ===== CONFIG =====
const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';
const FEED_PRIVATE_KEY = 'YOUR_FEED_PRIVATE_KEY_HERE';
const FEED_TOPIC = 'woco-website';
const UPLOAD_DIR = './out';
const TAR_FILE = './out.tar';

// State files
const STATE_DIR = '.swarm';
const MANIFEST_STATE = path.join(STATE_DIR, 'feed-manifest.json');
const INFO_STATE = path.join(STATE_DIR, 'swarm-feed-info.json');

// ========== helpers ==========
async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }
async function readJsonIfExists(p) { try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return null; } }

/**
 * Get all files recursively with Unix-style paths
 */
function getAllFiles(dir, baseDir = dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, baseDir));
    } else {
      // Convert Windows path to Unix path relative to baseDir
      const relativePath = path.relative(baseDir, fullPath);
      const unixPath = relativePath.split(path.sep).join('/');
      files.push({
        windowsPath: fullPath,
        unixPath: unixPath
      });
    }
  }

  return files;
}

(async () => {
  console.log('\n🚀 Starting Swarm Feed Upload (with Unix path fix)...\n');

  if (!fs.existsSync(UPLOAD_DIR)) {
    console.error(`❌ ERROR: Directory ${UPLOAD_DIR} does not exist. Run 'npm run build' first.`);
    process.exit(1);
  }

  try {
    // 1) Create tar with Unix paths
    console.log(`📦 Creating tar file with Unix paths from ${UPLOAD_DIR}...`);

    const files = getAllFiles(UPLOAD_DIR);
    console.log(`   Found ${files.length} files`);

    // Use tar package to create archive with explicit Unix paths
    await tar.create(
      {
        file: TAR_FILE,
        cwd: UPLOAD_DIR,
        portable: true,  // Ensures Unix-style paths
        gzip: false      // Swarm expects uncompressed tar
      },
      ['.']  // Include everything in the directory
    );

    console.log(`✅ Tar file created: ${TAR_FILE}`);

    // 2) Upload tar to Swarm
    const bee = new Bee(BEE_URL);
    const signer = new PrivateKey(FEED_PRIVATE_KEY);
    const ownerObj = signer.publicKey().address();
    const ownerHex = ownerObj.toHex();
    const topic = Topic.fromString(FEED_TOPIC);

    console.log(`📡 Bee: ${BEE_URL}`);
    console.log(`📝 Feed Topic: ${FEED_TOPIC}`);
    console.log(`👤 Feed Owner: ${ownerHex}\n`);

    console.log('📤 Uploading tar to Swarm...');

    // Read tar file
    const tarData = fs.readFileSync(TAR_FILE);

    // Upload as collection with index document
    const uploadResult = await bee.uploadFile(
      POSTAGE_BATCH_ID,
      tarData,
      'website.tar',
      {
        contentType: 'application/x-tar',
        headers: {
          'swarm-collection': 'true',
          'swarm-index-document': 'index.html'
        }
      }
    );

    const siteRef = uploadResult.reference.toString();
    console.log(`✅ Tar uploaded. Reference: ${siteRef}`);

    // Clean up tar file
    fs.unlinkSync(TAR_FILE);

    // 3) Create/reuse feed manifest
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

    // 4) Update feed
    console.log('🔄 Updating feed to new reference ...');
    const writer = bee.makeFeedWriter(topic, signer);
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

    // 5) Save info
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
    console.log('   2) Check browser console for any 404 or syntax errors');
    console.log('   3) If working, use bzz://' + manifestRef + ' for ENS\n');

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    if (err.response?.data) {
      console.error('Response:', err.response.data);
    }
    // Clean up tar file on error
    if (fs.existsSync(TAR_FILE)) {
      fs.unlinkSync(TAR_FILE);
    }
    process.exit(1);
  }
})();
