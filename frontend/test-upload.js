#!/usr/bin/env node
const { Bee } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');

const BEE_URL = 'https://gateway.woco-net.com';
const POSTAGE_BATCH_ID = '58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756';

async function test() {
  const bee = new Bee(BEE_URL);

  console.log('Testing upload with indexDocument...\n');

  const result = await bee.uploadFilesFromDirectory(
    POSTAGE_BATCH_ID,
    './out',
    {
      indexDocument: 'index.html',
      errorDocument: 'index.html'
    }
  );

  console.log('Upload result:', result);
  console.log('\nTesting download...');

  // Test downloading the collection
  const downloaded = await bee.downloadFile(result.reference);
  console.log('Content-Type:', downloaded.contentType);
  console.log('Name:', downloaded.name);

  if (downloaded.contentType === 'application/x-tar') {
    console.log('\n❌ Problem: Content is tar, not a website!');
    console.log('This means indexDocument is not creating a manifest.');
  } else {
    console.log('\n✅ Content-Type looks good!');
  }
}

test().catch(console.error);
