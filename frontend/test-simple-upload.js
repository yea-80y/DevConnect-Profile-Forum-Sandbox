#!/usr/bin/env node

/**
 * Simple test script to upload website WITHOUT feeds
 * Just to test if the website displays properly
 */

const { Bee } = require('@ethersphere/bee-js');

const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b';
const UPLOAD_DIR = './out';

(async () => {
  console.log('\n🧪 Simple Upload Test (No Feeds)\n');

  try {
    const bee = new Bee(BEE_URL);

    console.log(`📦 Uploading directory: ${UPLOAD_DIR}`);
    // CRITICAL: Use collection=mantaray (not tar) to serve as website
    const result = await bee.uploadFilesFromDirectory(
      POSTAGE_BATCH_ID,
      UPLOAD_DIR,
      {
        indexDocument: 'index.html',
        errorDocument: 'index.html',
        collection: 'mantaray'  // This creates a proper website manifest!
      }
    );

    const ref = result.reference.toString();
    console.log(`✅ Upload complete!`);
    console.log(`\n🌐 Test URLs:`);
    console.log(`   ${BEE_URL}/bzz/${ref}/`);
    console.log(`   ${BEE_URL}/bzz/${ref}/index.html`);
    console.log(`\nTry opening these URLs in your browser.`);
    console.log(`If they download instead of displaying, the issue is with Bee's website serving.\n`);

  } catch (err) {
    console.error('❌ Upload failed:', err?.message ?? err);
    process.exit(1);
  }
})();
