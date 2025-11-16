# Deploying Next.js Apps to Swarm: Complete Guide

This guide documents everything we learned about deploying a Next.js application to Swarm with feed manifests, based on real-world issues and solutions.

## Table of Contents
1. [Overview](#overview)
2. [Next.js Configuration](#nextjs-configuration)
3. [Environment Variables](#environment-variables)
4. [Build Process](#build-process)
5. [Upload Script](#upload-script)
6. [Proxy Configuration](#proxy-configuration)
7. [Common Issues & Solutions](#common-issues--solutions)
8. [Testing & Verification](#testing--verification)

---

## Overview

### What We're Building
- **Static Next.js site** hosted on Swarm
- **Permanent feed manifest** that never changes
- **Transparent proxy** that resolves feed manifest to latest content
- **Auto-whitelist** system for uploaded content

### Key Concepts
- **Feed Manifest Hash**: Permanent hash (never changes) - used in URLs and ENS
- **Content Hash**: Changes with each deployment - actual site content
- **Transparent Proxy**: Server rewrites feed manifest → content hash without browser knowing
- **basePath**: All routes include `/bzz/{feed-manifest-hash}` prefix

---

## Next.js Configuration

### next.config.ts

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for Swarm hosting
  output: 'export',

  // Base path for Swarm deployment - reads from environment variable
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Asset prefix must match basePath for client-side navigation to work
  assetPrefix: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },

  // Use trailing slash to ensure .html files are loaded correctly
  trailingSlash: true,

  // Ignore ESLint errors during build (optional)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Fix warning about multiple lockfiles (Next.js 15+)
  outputFileTracingRoot: require('path').join(__dirname, '../'),

  // Configure webpack to include basePath in chunk loading
  webpack: (config) => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    config.output.publicPath = basePath ? `${basePath}/_next/` : '/_next/';
    return config;
  },
};

export default nextConfig;
```

### Critical Configuration Points

1. **`output: 'export'`** - Generates static HTML/JS files
2. **`trailingSlash: true`** - Creates `page/index.html` structure
3. **`basePath` + `assetPrefix`** - Both must match for routing to work
4. **webpack `publicPath`** - Ensures JS chunks load from correct path

---

## Environment Variables

### .env.production

```bash
# Production API URL - points to your server
NEXT_PUBLIC_API_URL=https://api.woco-net.com
NEXT_PUBLIC_BEE_URL=https://gateway.woco-net.com
NEXT_PUBLIC_POSTAGE_BATCH_ID=10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b

# IMPORTANT: Also set non-NEXT_PUBLIC version for upload scripts
POSTAGE_BATCH_ID=10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b

# Base path for Swarm deployment - uses permanent feed manifest hash
# This hash never changes, allowing navigation to work across all deployments
NEXT_PUBLIC_BASE_PATH=/bzz/9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100
```

### Important Notes

- **Feed manifest hash in basePath**: This is permanent, never changes
- **Both forms of POSTAGE_BATCH_ID**: Next.js needs `NEXT_PUBLIC_`, scripts need non-prefixed
- **All variables must be NEXT_PUBLIC_**: Client-side code can only access these

---

## Build Process

### Standard Build Command

```bash
# Clean previous builds
rm -rf .next out

# Build with production environment variables
npm run build
```

### Post-Build: Create Redirect Files

**Why needed**: Next.js static export with `trailingSlash: true` creates `dashboard/index.html`, but mobile browsers often navigate to `/dashboard` (no trailing slash). Without redirects, you get "Cannot GET /dashboard".

**create-redirects.js**:

```javascript
// Create redirect HTML files for routes without trailing slashes
const fs = require('fs');
const path = require('path');

const outDir = './out';

// Routes that need redirect files (directories with index.html)
const routes = ['dashboard', 'account', 'forum', 'profile'];

console.log('Creating redirect files for routes without trailing slashes...');

routes.forEach(route => {
  const redirectHtmlPath = path.join(outDir, `${route}.html`);
  // Use relative path to preserve the full URL including basePath
  const targetPath = `./${route}/`;

  const redirectHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Redirecting...</title>
  <meta http-equiv="refresh" content="0; url=${targetPath}">
  <script>window.location.href = "${targetPath}";</script>
</head>
<body>
  <p>Redirecting to <a href="${targetPath}">${route}/</a>...</p>
</body>
</html>`;

  fs.writeFileSync(redirectHtmlPath, redirectHtml, 'utf8');
  console.log(`✅ Created redirect: ${route}.html -> ${targetPath}`);
});

console.log('✅ All redirect files created');
```

**Run after build**:

```bash
npm run build
node create-redirects.js
node upload-manual-collection.js
```

---

## Upload Script

### upload-manual-collection.js

**Key Features**:
- Uploads entire `out/` directory as a collection
- Updates feed to point to new content hash
- Auto-whitelists content hash on proxy
- Uses existing feed manifest (doesn't recreate)

**Complete Script**:

```javascript
const { Bee, PrivateKey } = require('@ethersphere/bee-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.production' });

const BEE_URL = process.env.NEXT_PUBLIC_BEE_URL || 'http://localhost:1633';
const POSTAGE_BATCH_ID = process.env.POSTAGE_BATCH_ID;
const FEED_PRIVATE_KEY = process.env.FEED_PRIVATE_KEY;

// Feed constants
const FEED_TOPIC = 'woco-website';
const FEED_MANIFEST_HASH = '9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100';

async function uploadDirectory(bee, dir, batchId) {
  const files = [];

  function scanDir(currentDir, baseDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath, baseDir);
      } else {
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        files.push({
          path: relativePath,
          fsPath: fullPath
        });
      }
    }
  }

  scanDir(dir, dir);

  console.log(`📦 Scanning directory: ${dir}...`);
  console.log(`   Found ${files.length} files\n`);
  console.log('Sample file paths (first 10):');
  files.slice(0, 10).forEach(f => console.log(`   ${f.path}`));
  console.log('');

  // Upload as collection
  console.log('📤 Uploading collection to Swarm...');
  const fileObjects = files.map(f => ({
    path: f.path,
    content: fs.readFileSync(f.fsPath)
  }));

  const { reference } = await bee.uploadFiles(batchId, fileObjects, {
    indexDocument: 'index.html',
    errorDocument: '404.html'
  });

  return reference;
}

async function main() {
  console.log('🚀 Starting Swarm Manual Collection Upload...\n');

  if (!POSTAGE_BATCH_ID || !FEED_PRIVATE_KEY) {
    throw new Error('Missing POSTAGE_BATCH_ID or FEED_PRIVATE_KEY in .env.production');
  }

  const bee = new Bee(BEE_URL);
  console.log(`📡 Bee: ${BEE_URL}`);

  // Calculate topic hash
  const signer = new PrivateKey(FEED_PRIVATE_KEY.startsWith('0x') ? FEED_PRIVATE_KEY : `0x${FEED_PRIVATE_KEY}`);
  const owner = signer.publicKey().address().toHex();
  console.log(`📝 Feed Topic: ${FEED_TOPIC}`);
  console.log(`👤 Feed Owner: ${owner}\n`);

  // Upload the collection
  const siteRef = await uploadDirectory(bee, './out', POSTAGE_BATCH_ID);
  console.log(`✅ Collection uploaded. Reference: ${siteRef}`);

  // Use existing feed manifest
  console.log(`🔁 Using feed manifest: ${FEED_MANIFEST_HASH}`);

  // Update feed to point to new content
  console.log('🔄 Updating feed to new reference ...');
  const writer = bee.makeFeedWriter(FEED_TOPIC, signer);
  await writer.uploadPayload(POSTAGE_BATCH_ID, siteRef);
  console.log('✅ Feed updated.');

  // Auto-whitelist the new content hash
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
    }
  } catch (whitelistErr) {
    console.log('⚠️  Could not add to whitelist:', whitelistErr.message);
  }

  console.log(`📝 Feed manifest (permanent): ${FEED_MANIFEST_HASH}`);
  console.log(`📝 Latest content hash: ${siteRef}`);
  console.log('📝 basePath in .env.production uses feed manifest hash (never changes)\n');

  console.log('======================================================================');
  console.log('✅ UPLOAD COMPLETE!');
  console.log('======================================================================\n');

  console.log('🌐 TEST THESE URLS:');
  console.log(`   Feed manifest: ${BEE_URL}/bzz/${FEED_MANIFEST_HASH}/`);
  console.log(`   Content hash:  ${BEE_URL}/bzz/${siteRef}/\n`);

  console.log('📝 NEXT STEPS:');
  console.log(`   1) Test both URLs in your browser`);
  console.log(`   2) Check browser console for any errors`);
  console.log(`   3) Test on mobile for trailing slash redirects`);
}

main().catch(console.error);
```

---

## Proxy Configuration

### Feed Manifest Transparent Proxy

**Location**: In your proxy's `/bzz/:hash` route handler, BEFORE the whitelist check.

**Why needed**: The feed manifest hash never changes, but it needs to resolve to the latest content hash transparently (without changing the browser URL).

**Code to add**:

```typescript
app.use('/bzz/:hash', async (req: Request, res: Response) => {
  const hash = req.params.hash;

  // Feed manifest transparent proxy - intercept and resolve to actual content
  const FEED_MANIFEST_HASH = "9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100";
  const FEED_OWNER = "f8af4904c6e4f08ce5f7deab7f01221280b23a80";
  const FEED_TOPIC = "bb6a23bf07aa84a41fe44a485dd811ea10cc57a7cb88257789920813549f81d1";

  if (hash === FEED_MANIFEST_HASH) {
    try {
      console.log("Feed manifest request detected, resolving to actual content hash...");
      const feedResp = await fetchWithTimeout(`${beeApiUrl}/feeds/${FEED_OWNER}/${FEED_TOPIC}`);
      if (feedResp.ok) {
        const actualHash = (await feedResp.text()).trim();
        console.log(`Feed resolved to content hash: ${actualHash}`);

        // Preserve full path including query params
        const hashEndIndex = req.originalUrl.indexOf(hash) + hash.length;
        const remainder = req.originalUrl.substring(hashEndIndex);
        const proxyUrl = `${beeApiUrl}/bzz/${actualHash}${remainder}`;
        console.log(`Proxying feed manifest to: ${proxyUrl}`);

        const resp = await fetchWithTimeout(proxyUrl);
        resp.headers.forEach((v, k) => res.setHeader(k, v));
        res.status(resp.status);
        if (resp.body) {
          const reader = resp.body.getReader();
          await streamWithTimeout(reader, res);
        } else {
          res.end();
        }
        return;
      } else {
        console.error("Feed lookup failed:", feedResp.status);
      }
    } catch (e) {
      console.error("Feed manifest proxy error:", e);
      // Fall through to normal handling
    }
  }

  // Whitelist check comes AFTER feed manifest check
  if (!whitelist.isWhitelisted(hash)) {
    // ... existing whitelist logic
  }

  // ... rest of proxy logic
});
```

### Query Parameter Preservation

**Issue**: Profile pictures and other assets use cache-busting query params like `?v=timestamp`. Without proper handling, `?` becomes `/` in the proxied URL.

**Solution**: Preserve the entire URL structure after the hash:

```typescript
// OLD (breaks query params):
const url = subpath
  ? `${beeApiUrl}/bzz/${hash}/${subpath}`
  : `${beeApiUrl}/bzz/${hash}`;

// NEW (preserves query params):
const hashEndIndex = req.originalUrl.indexOf(hash) + hash.length;
const remainder = req.originalUrl.substring(hashEndIndex);
const url = `${beeApiUrl}/bzz/${hash}${remainder}`;
```

---

## Common Issues & Solutions

### 1. Old Batch ID Baked Into Build

**Symptom**: Console shows old batch ID `58a35141d74fedb10a6d4ebb9064b3f473ecd98df49be771cc6abed98a0ee756` in network requests, even though `.env.production` has correct ID `10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b`.

**Root Cause**: There are TWO `swarm.ts` config files that read `NEXT_PUBLIC_POSTAGE_BATCH_ID`:
1. **`src/config/swarm.ts`** - Server-side config (reads from env)
2. **`frontend/src/config/swarm.ts`** - Frontend-safe config (reads from env)

The batch ID gets hardcoded into the Next.js build at build-time. If you change the batch ID in `.env.production` but don't rebuild, the old ID remains in the compiled JS chunks.

**Solution**:
```bash
# 1. Clear Next.js cache completely
rm -rf .next out

# 2. Ensure .env.production has correct batch ID
cat .env.production | grep POSTAGE_BATCH_ID
# Should show: NEXT_PUBLIC_POSTAGE_BATCH_ID=10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b

# 3. Clear any Windows environment variables that might override
# Check: echo %NEXT_PUBLIC_POSTAGE_BATCH_ID%
# If set, clear it in Windows System Environment Variables

# 4. Rebuild with clean environment
npm run build
```

**Verification**:
```bash
# Check if old batch ID is in the built chunks
grep -r "58a35141d7" .next/static/chunks/
# Should return nothing

# Check if new batch ID is present
grep -r "10385383" .next/static/chunks/
# Should find it in the compiled chunks
```

**Prevention**:
- Both `NEXT_PUBLIC_POSTAGE_BATCH_ID` and `POSTAGE_BATCH_ID` (non-prefixed) in `.env.production`
- Always `rm -rf .next out` when changing batch ID
- Test in browser console after deploy to verify correct batch ID is being used
- Check both config files don't have hardcoded fallbacks

### 2. Website Downloads as Tar File Instead of Displaying

**Symptom**: When accessing the Swarm URL, browser downloads a `.tar` file instead of displaying the website.

**Root Cause**: When uploading from Windows PowerShell, the tar file created by `uploadFilesFromDirectory()` contains Windows-style backslash paths (`_next\static\...`) instead of Unix forward slashes (`_next/static/...`). Swarm expects Unix-style paths and fails to find files with backslashes.

**What We Tried (That Didn't Work)**:
1. **`upload-to-swarm-feed.js`** - Used tar-based `uploadFilesFromDirectory()` from Windows PowerShell
   - Result: Tar file had wrong path separators
   - Files couldn't be found by path, causing whole tar to download

2. **`upload-directory-to-swarm.js`** - Alternative using same method
   - Result: Same tar file path separator issue

3. **`upload-direct-api.js`** - Direct HTTP multipart upload attempt
   - Result: Not documented as working

**What Worked**:
- **`upload-manual-collection.js`** using `bee.uploadFiles()` method
- Upload from **WSL Ubuntu** instead of Windows PowerShell (for Unix path handling)

**Solution**:

**Option A: Use WSL Ubuntu (if you have existing tar-based scripts)**:
```bash
# 1. Open WSL Ubuntu terminal
wsl

# 2. Navigate to frontend (Windows filesystem accessible via /mnt/c/)
cd /mnt/c/Users/nabil/devconnect-profile-sandbox/frontend

# 3. Build and upload
npm run build
node upload-to-swarm-feed.js
```

**Option B: Use upload-manual-collection.js (Recommended)**:
This script uses `bee.uploadFiles()` which creates proper collections without tar:

```javascript
// Instead of uploadFilesFromDirectory() which creates tar:
const fileObjects = files.map(f => ({
  path: f.path,
  content: fs.readFileSync(f.fsPath)
}));

const { reference } = await bee.uploadFiles(batchId, fileObjects, {
  indexDocument: 'index.html',
  errorDocument: '404.html'
});
```

See [Upload Script](#upload-script) section for complete code.

**Verification**:
```bash
# After upload, test the content hash
curl -I "https://gateway.woco-net.com/bzz/{content-hash}/"

# Should return:
# HTTP/1.1 200 OK
# Content-Type: text/html; charset=utf-8

# NOT:
# Content-Type: application/x-tar
# Content-Disposition: attachment; filename="something.tar"
```

**Key Takeaway**:
- **DON'T** use `uploadFilesFromDirectory()` from Windows PowerShell
- **DO** use `bee.uploadFiles()` with manual file reading
- **OR** upload from WSL/Linux environment

### 3. "Cannot GET /dashboard" on Mobile

**Symptom**: Homepage loads, but clicking links gives "Cannot GET" error on mobile.

**Cause**: Next.js with `trailingSlash: true` creates `dashboard/index.html`, but mobile browsers navigate to `/dashboard` (no slash).

**Solution**: Create redirect HTML files for all routes (see [Build Process](#build-process) section).

### 3. Website Loads But Profile Pictures Don't Display

**Symptom**:
- Upload succeeds: `imageRefHex: '4a9776...'`
- Auto-whitelisted: "Auto-whitelisted imageRef from SOC: 4a9776..."
- Retrieval fails: `GET .../4a9776...?v=c87c43ce` returns 404

**Cause**: Proxy not preserving query parameters.

**Solution**: Use query parameter preservation code (see [Proxy Configuration](#proxy-configuration) section).

### 4. Feed Manifest Not Resolving

**Symptom**: Logs don't show "Feed manifest request detected" message, 404 errors on all pages.

**Cause**: Feed manifest check not in proxy, or running AFTER whitelist check.

**Solution**:
1. Add feed manifest transparent proxy code
2. Ensure it runs BEFORE the whitelist check
3. Whitelist the feed manifest hash itself (first deployment only)

### 5. Proxy Can't Serve Subpaths (JavaScript Files 404)

**Symptom**:
- Dashboard page loads but is broken/blank
- Browser console shows 404 errors for `/_next/static/chunks/webpack-xxx.js`
- JavaScript files return 404 or wrong Content-Type (text/html instead of application/javascript)

**Root Cause**: Proxy bug in `proxy/src/index.ts` around line 767. The proxy used `req.path` to extract subpaths, but Express's `req.path` only contains the matched route portion (just `/bzz/:hash`), not the full path including subpaths like `/_next/static/chunks/...` after the hash.

**The Bug**:
```typescript
// BROKEN CODE:
const fullPath = req.path;  // Only "/bzz/abc123..." not the full path
const subpath = fullPath.substring(hash.length + 1);  // Wrong!
```

**The Fix**:
```typescript
// FIXED CODE:
const hashIndex = req.originalUrl.indexOf(hash);
const subpath = hashIndex >= 0
  ? req.originalUrl.substring(hashIndex + hash.length + 1).split('?')[0]
  : '';
```

**Apply the fix**:
```bash
# On server, edit proxy/src/index.ts and replace the subpath extraction code
cd ~/bee_gateway/bee-slam/proxy

# Then rebuild Docker container
docker-compose build proxy
docker-compose up -d proxy
```

**Verification**:
```bash
# Test JS file loads correctly with proper Content-Type
curl -I http://localhost:3323/bzz/{hash}/_next/static/chunks/webpack-xxx.js

# Should return:
# HTTP/1.1 200 OK
# Content-Type: application/javascript

# NOT:
# HTTP/1.1 404 Not Found
# Content-Type: text/html
```

### 6. POST /feeds Endpoint Returns 502 (Feed Manifest Creation Fails)

**Symptom**: Upload script fails when trying to create feed manifest with 502 Bad Gateway error.

**Root Cause**: The proxy didn't have a POST /feeds endpoint to forward feed manifest creation requests to the Bee node.

**Solution**: Add POST /feeds endpoint to proxy at `src/index.ts`:

```typescript
/**
 * POST /feeds endpoint for creating/updating feed manifests
 * Forwards to Bee node and auto-whitelists the manifest reference
 */
app.post('/feeds/:owner/:topic', uploadLimiter, async (req: Request, res: Response) => {
  const { owner, topic } = req.params;

  try {
    const url = `${beeApiUrl}/feeds/${owner}/${topic}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'swarm-postage-batch-id': req.headers['swarm-postage-batch-id'] || '',
      },
      body: req.body
    });

    // Auto-whitelist the manifest reference
    const manifestRef = await response.text();
    if (manifestRef && /^[0-9a-f]{64}$/i.test(manifestRef)) {
      await whitelist.add(manifestRef);
      console.log(`Auto-whitelisted feed manifest: ${manifestRef}`);
    }

    res.status(response.status).send(manifestRef);
  } catch (error) {
    console.error('Error creating feed manifest:', error);
    res.status(500).json({
      error: 'Feed manifest creation failed',
      message: (error as Error).message
    });
  }
});
```

This allows the upload script to create the permanent feed manifest hash that never changes.

### 7. Assets Loading with Wrong Path

**Symptom**: Browser tries to load `/_next/static/...` instead of `/bzz/{hash}/_next/static/...`

**Cause**: webpack `publicPath` not configured.

**Solution**: Add webpack config to `next.config.ts`:
```typescript
webpack: (config) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
  config.output.publicPath = basePath ? `${basePath}/_next/` : '/_next/';
  return config;
},
```

---

## Testing & Verification

### Pre-Deployment Checklist

- [ ] `.env.production` has correct `NEXT_PUBLIC_POSTAGE_BATCH_ID`
- [ ] `.env.production` has correct `NEXT_PUBLIC_BASE_PATH` with feed manifest hash
- [ ] `next.config.ts` has `output: 'export'` and `trailingSlash: true`
- [ ] `create-redirects.js` includes all your routes
- [ ] Proxy has feed manifest transparent proxy code
- [ ] Proxy has query parameter preservation code
- [ ] Feed manifest hash is whitelisted (first deployment only)

### Build & Deploy Steps

```bash
# 1. Clean previous builds
rm -rf .next out

# 2. Build the app
npm run build

# 3. Create redirect files
node create-redirects.js

# 4. Upload to Swarm
node upload-manual-collection.js

# 5. Verify in logs:
# - "Collection uploaded. Reference: {hash}"
# - "Feed updated."
# - "Hash added to whitelist"
```

### Post-Deployment Testing

1. **Desktop Browser**:
   ```
   https://gateway.woco-net.com/bzz/{feed-manifest-hash}/
   ```
   - Homepage should load
   - Navigation should work
   - Console should show correct batch ID in network requests

2. **Mobile Browser**:
   - Test homepage
   - Click navigation links (should redirect `/dashboard` → `/dashboard/`)
   - Check profile pictures load
   - Check forum posts with images

3. **Proxy Logs**:
   ```bash
   docker logs bee-proxy --tail 50
   ```
   Should show:
   - "Feed manifest request detected, resolving..."
   - "Feed resolved to content hash: {actual-hash}"
   - "Proxying feed manifest to: ..."

4. **Direct Content Hash** (bypass feed):
   ```
   https://gateway.woco-net.com/bzz/{content-hash}/
   ```
   Should work identically to feed manifest URL.

### Debug Commands

```bash
# Check if hash is whitelisted
curl -s https://gateway.woco-net.com/admin/whitelist | jq '.hashes[] | select(. == "your-hash")'

# Test feed resolution
curl -s https://gateway.woco-net.com/feeds/{owner}/{topic}

# Test specific route
curl -sI https://gateway.woco-net.com/bzz/{feed-hash}/dashboard

# View proxy logs
docker logs bee-proxy --tail 100 -f
```

---

## Summary: Critical Success Factors

1. **Environment Variables**: Both `NEXT_PUBLIC_` and non-prefixed versions, correct batch ID
2. **Next.js Config**: `output: 'export'`, `trailingSlash: true`, webpack publicPath
3. **Redirect Files**: Create for all routes to handle mobile navigation
4. **Proxy Feed Resolution**: BEFORE whitelist check, preserves full URL
5. **Query Parameter Preservation**: Use `req.originalUrl` substring approach
6. **Auto-Whitelist**: Upload script adds content hash to whitelist automatically
7. **Clean Builds**: Always delete `.next` and `out` when changing env vars

---

## Architecture Diagram

```
User Browser
    ↓
    → https://gateway.woco-net.com/bzz/{FEED_MANIFEST_HASH}/dashboard
    ↓
Nginx/Proxy
    ↓
    → Detects FEED_MANIFEST_HASH
    → Looks up feed: /feeds/{owner}/{topic}
    → Gets current content hash: {CONTENT_HASH}
    → Proxies to: /bzz/{CONTENT_HASH}/dashboard
    ↓
Bee Node
    ↓
    → Checks whitelist (content hash must be whitelisted)
    → Serves content from Swarm
    ↓
User sees content (URL still shows FEED_MANIFEST_HASH)
```

**Key Point**: User's URL never changes, but server transparently serves latest content.

---

## Appendix: How We Got Here

### Complete Timeline of Issues (In Order Encountered)

1. **Tar File Download Issue** (First major blocker)
   - Website downloaded as `.tar` file instead of displaying
   - Caused by Windows PowerShell creating tar with backslash paths
   - Fixed by using `bee.uploadFiles()` instead of `uploadFilesFromDirectory()`

2. **Proxy Subpath Bug** (Second major blocker)
   - JavaScript files returned 404 errors
   - Dashboard loaded but was blank/broken
   - Proxy couldn't extract subpaths from `req.path`
   - Fixed by using `req.originalUrl` instead

3. **POST /feeds Missing** (Prevented feed manifest creation)
   - Upload script failed with 502 when creating feed manifest
   - Proxy didn't forward POST /feeds requests
   - Fixed by adding POST /feeds endpoint to proxy

4. **Feed Manifest Not Resolving** (Website 404 after upload)
   - Feed manifest hash returned 404 on all pages
   - Proxy didn't have transparent proxy code
   - Fixed by adding feed manifest detection and resolution before whitelist check

5. **Old Batch ID Baked Into Build** (Wrong batch ID in network requests)
   - Console showed old batch ID `58a35141d7...` instead of new `10385383...`
   - Caused by cached build with old environment variable
   - Two config files both reading `NEXT_PUBLIC_POSTAGE_BATCH_ID`
   - Fixed by `rm -rf .next out` and clean rebuild

6. **Query Parameters Broken** (Profile pictures 404)
   - Profile picture upload succeeded but retrieval failed
   - `?v=timestamp` cache-busting param became `/v=timestamp` in proxy
   - Fixed by preserving full URL path including query params

7. **Mobile Navigation Broken** ("Cannot GET /dashboard")
   - Homepage loaded but navigation gave "Cannot GET" errors on mobile
   - Next.js `trailingSlash: true` created `dashboard/index.html`
   - Mobile browsers navigated to `/dashboard` without trailing slash
   - Fixed by creating redirect HTML files for routes without trailing slashes

### Key Learnings

- **Upload method matters**: `uploadFiles()` works from Windows, `uploadFilesFromDirectory()` only works from Linux/WSL
- **Proxy bugs are subtle**: `req.path` vs `req.originalUrl` made the difference between working and broken
- **Feed manifests are powerful** but require multiple pieces:
  - POST /feeds endpoint to create manifest
  - Transparent proxy to resolve manifest → content
  - Whitelist for both manifest and content hashes
- **Environment variables are tricky**:
  - Need both `NEXT_PUBLIC_` and non-prefixed versions
  - Get baked into build at compile-time
  - Windows env vars can override `.env` files
  - Multiple config files can read same variable
- **Static export has gotchas**:
  - `trailingSlash: true` requires redirect files
  - Different behavior on mobile vs desktop
  - webpack `publicPath` must match `basePath`
- **URL handling is critical**:
  - Query parameters must be explicitly preserved
  - Subpaths need `req.originalUrl` not `req.path`
  - Relative redirects preserve full URL including basePath
- **Testing on mobile is essential** - behavior differs from desktop
- **Caching can hide issues** - always test with HTTP first, then HTTPS
- **Always clean build** when changing environment variables: `rm -rf .next out`

---

## Quick Reference

### File Locations

- **Next.js config**: `frontend/next.config.ts`
- **Env vars**: `frontend/.env.production`
- **Redirect script**: `frontend/create-redirects.js`
- **Upload script**: `frontend/upload-manual-collection.js`
- **Proxy code**: `/home/server-user/bee_gateway/bee-slam/proxy/src/index.ts`

### Key Hashes

- **Feed Manifest**: `9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100` (permanent)
- **Feed Owner**: `f8af4904c6e4f08ce5f7deab7f01221280b23a80`
- **Feed Topic**: `woco-website` (hex: `bb6a23bf07aa84a41fe44a485dd811ea10cc57a7cb88257789920813549f81d1`)
- **Current Batch ID**: `10385383779bc425047a1c9023fdb86b6873136ecccd52df9c10251c0991088b`

### URLs

- **Gateway**: `https://gateway.woco-net.com`
- **API**: `https://api.woco-net.com`
- **Feed Manifest URL**: `https://gateway.woco-net.com/bzz/9ebcea7ca2d4a3a975d1724ee579856684dc6f2ffa3082b64317006c922f3100/`
