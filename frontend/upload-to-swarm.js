#!/usr/bin/env node
/**
 * Upload the static website to Swarm and optionally publish to a feed
 *
 * Usage:
 *   node upload-to-swarm.js
 *
 * Environment variables:
 *   BEE_URL - Bee node URL (default: http://localhost:3323)
 *   POSTAGE_BATCH_ID - Your postage batch ID (required)
 *   FEED_PRIVATE_KEY - Optional: private key to publish to feed for updates
 */

const { Bee, Utils } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');

// Configuration
const BEE_URL = process.env.BEE_URL || 'http://localhost:3323';
const POSTAGE_BATCH_ID = process.env.POSTAGE_BATCH_ID;
const FEED_PRIVATE_KEY = process.env.FEED_PRIVATE_KEY;

if (!POSTAGE_BATCH_ID) {
  console.error('❌ Error: POSTAGE_BATCH_ID environment variable is required');
  console.error('Usage: POSTAGE_BATCH_ID=your-batch-id node upload-to-swarm.js');
  process.exit(1);
}

async function uploadWebsite() {
  console.log('🐝 Connecting to Bee node:', BEE_URL);
  const bee = new Bee(BEE_URL);

  const outDir = path.join(__dirname, 'out');

  if (!fs.existsSync(outDir)) {
    console.error('❌ Error: out/ directory not found. Run "npm run build" first.');
    process.exit(1);
  }

  // Check if index.html exists
  const indexPath = path.join(outDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.error('❌ Error: out/index.html not found. Website must have an index.html');
    process.exit(1);
  }

  console.log('📦 Uploading website from out/ directory...');
  console.log('   Using postage batch:', POSTAGE_BATCH_ID);

  try {
    // Upload directory
    const result = await bee.uploadFilesFromDirectory(POSTAGE_BATCH_ID, outDir, {
      indexDocument: 'index.html',
      errorDocument: '404.html'
    });

    console.log('✅ Upload successful!');
    console.log('');
    console.log('📍 Website Reference:', result.reference);
    console.log('🌐 Access your website at:');
    console.log(`   ${BEE_URL}/bzz/${result.reference}/`);
    console.log('');

    // If feed private key is provided, publish to feed
    if (FEED_PRIVATE_KEY) {
      console.log('📝 Publishing to feed...');

      const topic = 'woco-forum-website';
      const signer = Utils.makePrivateKeySigner(FEED_PRIVATE_KEY);

      // Create feed writer
      const writer = bee.makeFeedWriter('sequence', topic, signer);

      // Upload reference to feed
      await writer.upload(POSTAGE_BATCH_ID, result.reference);

      // Get feed manifest reference
      const feedManifest = await writer.getManifest();

      console.log('✅ Published to feed!');
      console.log('');
      console.log('📍 Feed Manifest Reference:', feedManifest);
      console.log('🌐 Access via feed at:');
      console.log(`   ${BEE_URL}/bzz/${feedManifest}/`);
      console.log('');
      console.log('ℹ️  You can update the website by running this script again.');
      console.log('   The feed URL will always point to the latest version.');
    } else {
      console.log('ℹ️  To enable automatic updates via feed:');
      console.log('   Set FEED_PRIVATE_KEY environment variable');
    }

    console.log('');
    console.log('🎉 Deployment complete!');

  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.statusText);
    }
    process.exit(1);
  }
}

uploadWebsite();
