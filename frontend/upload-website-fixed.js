#!/usr/bin/env node

/**
 * Fixed website uploader with feed support - creates proper tar with forward slashes
 */

const { Bee, PrivateKey, Topic } = require('@ethersphere/bee-js');
const tar = require('tar');
const fs = require('fs');
const path = require('path');

const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';
const FEED_PRIVATE_KEY = 'YOUR_FEED_PRIVATE_KEY_HERE';
const FEED_TOPIC = 'woco-website';
const UPLOAD_DIR = './out';
const TAR_FILE = './website.tar';

const STATE_DIR = '.swarm';
const MANIFEST_STATE = path.join(STATE_DIR, 'feed-manifest.json');

async function ensureDir(p) { await fs.promises.mkdir(p, { recursive: true }); }
async function readJsonIfExists(p) { try { return JSON.parse(await fs.promises.readFile(p, 'utf-8')); } catch { return null; } }

(async () => {
  console.log('\n🔧 Fixed Website Upload with Feed (proper tar paths)\n');

  try {
    const bee = new Bee(BEE_URL);
    const signer = new PrivateKey(FEED_PRIVATE_KEY);
    const ownerObj = signer.publicKey().address();
    const ownerHex = ownerObj.toHex();
    const topic = Topic.fromString(FEED_TOPIC);

    console.log(`📡 Bee: ${BEE_URL}`);
    console.log(`📝 Feed Topic: ${FEED_TOPIC}`);
    console.log(`👤 Feed Owner: ${ownerHex}\n`);

    // Step 1: Create a proper tar file with forward slashes
    console.log('📦 Creating tar archive with Unix paths...');
    await tar.create(
      {
        file: TAR_FILE,
        cwd: UPLOAD_DIR,
        portable: true,  // Ensures Unix-style paths
        gzip: false
      },
      ['.']
    );
    console.log('✅ Tar created with proper paths');

    // Step 2: Upload the tar file to Swarm
    console.log('📤 Uploading website to Swarm...');
    const tarData = await fs.promises.readFile(TAR_FILE);

    const result = await bee.uploadFile(
      POSTAGE_BATCH_ID,
      tarData,
      'website.tar',
      {
        contentType: 'application/x-tar',
        headers: {
          'swarm-index-document': 'index.html',
          'swarm-error-document': 'index.html'
        }
      }
    );

    const siteRef = result.reference.toString();
    console.log(`✅ Website uploaded. Reference: ${siteRef}`);

    // Clean up tar file
    await fs.promises.unlink(TAR_FILE);

    // Step 3: Create feed manifest (one-time)
    await ensureDir(STATE_DIR);
    let manifestRef;
    const manifestState = await readJsonIfExists(MANIFEST_STATE);

    if (manifestState?.manifestRef) {
      manifestRef = manifestState.manifestRef;
      console.log(`🔁 Using existing feed manifest: ${manifestRef}`);
    } else {
      console.log('🧭 Creating feed manifest (one-time) ...');
      manifestRef = await bee.createFeedManifest(POSTAGE_BATCH_ID, topic, ownerObj);
      console.log(`✅ Feed manifest created: ${manifestRef}`);
      await fs.promises.writeFile(
        MANIFEST_STATE,
        JSON.stringify({ manifestRef, owner: ownerHex, topic: topic.toString() }, null, 2)
      );
    }

    // Step 4: Update feed to point to the website
    console.log('🔄 Updating feed to new reference ...');
    const writer = bee.makeFeedWriter(topic, signer);
    await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
    console.log('✅ Feed updated.');

    console.log('\n======================================================================');
    console.log('✅ UPLOAD COMPLETE!');
    console.log('======================================================================\n');

    console.log('🌐 WEBSITE URLs:');
    console.log(`   Direct content: ${BEE_URL}/bzz/${siteRef}/`);
    console.log(`   Feed (stable):  ${BEE_URL}/bzz/${manifestRef}/`);

    console.log('\n📝 FOR ENS:');
    console.log(`   Content hash: bzz://${manifestRef}`);
    console.log('\n💾 State saved to: ' + MANIFEST_STATE + '\n');

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    // Clean up on error
    try { await fs.promises.unlink(TAR_FILE); } catch {}
    process.exit(1);
  }
})();
