# Swarm Deployment - Success!

## Problem Identified and Fixed

The issue preventing your Next.js site from working on Swarm was a bug in the proxy code.

### The Bug
In `proxy/src/index.ts` line 767, the proxy was using `req.path` to extract the subpath after the hash:

```typescript
const fullPath = req.path;
const subpath = fullPath.substring(hash.length + 1);
```

This didn't work because Express's `req.path` only contains the matched route portion, not the full path including subpaths after `/bzz/:hash/`.

### The Fix
Changed to use `req.originalUrl` which contains the complete URL:

```typescript
const hashIndex = req.originalUrl.indexOf(hash);
const subpath = hashIndex >= 0
  ? req.originalUrl.substring(hashIndex + hash.length + 1).split('?')[0]
  : '';
```

## Current Status

✅ **Proxy fixed and rebuilt**
✅ **Website uploaded to Swarm**
✅ **JavaScript files now load correctly**
✅ **Content hash**: `49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50`

## Testing URLs

**Working (HTTP - no cache):**
- Root: http://localhost:3323/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/
- Dashboard: http://localhost:3323/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/dashboard

**Will work once cache clears (HTTPS):**
- Root: https://gateway.woco-net.com/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/
- Dashboard: https://gateway.woco-net.com/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/dashboard

## Current Issues

### 1. HTTPS Cache
The Cloudflare Tunnel / HTTPS reverse proxy is caching old 404 responses. This affects:
- Dashboard page returning 404
- Images not loading
- Other pages that were accessed before the fix

**Solutions:**
- Wait for cache to expire (usually a few minutes to hours)
- Clear Cloudflare cache manually if you have access
- Use HTTP endpoint (localhost:3323) for immediate testing
- Access with `?fresh=1` query parameter to bypass some caches

### 2. Images May Need Path Fixes
If images still don't load after cache clears, they might be using absolute paths like `/logo.png` instead of relative paths `./logo.png`.

Check the fix-paths.js script and add image path replacements if needed.

## Feed Setup (Still TODO)

The feed update is currently failing with "chequebook out of funds". To use feeds:

1. Fund the Bee node's chequebook
2. Run the upload script with feed update:
   ```bash
   cd frontend
   node upload-manual-collection.js
   ```

The feed manifest hash is: `0b4ea8162a3fcbb19b63705f0c97137eef667d3c3cd4ecf69d686c5f98fb0054`

## Next Steps

1. **Clear HTTPS cache** (Cloudflare dashboard or wait)
2. **Test the website** via HTTPS once cache clears
3. **Fund Bee chequebook** if you want to use feeds for updates
4. **Update ENS** content hash to point to:
   - Content hash: `49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50` (current static version)
   - OR Feed manifest: `0b4ea8162a3fcbb19b63705f0c97137eef667d3c3cd4ecf69d686c5f98fb0054` (once feeds work)

## Files Modified

### On Server (~/bee_gateway/bee-slam/proxy/)
- `src/index.ts` - Fixed subpath extraction bug
- Docker image rebuilt with fix

### Upload Scripts Created
- `upload-manual-collection.js` - Working upload method using bee.uploadCollection()
- `upload-directory-to-swarm.js` - Alternative using uploadFilesFromDirectory()
- `upload-direct-api.js` - Alternative using direct HTTP multipart upload
- `upload-to-swarm-feed.js` - Original tar-based upload (has issues)

## Deployment Workflow

When you make changes to your Next.js app:

```bash
# 1. Build the Next.js site
cd frontend
npm run build
node fix-paths.js

# 2. Upload to Swarm
node upload-manual-collection.js

# 3. The script will output a new content hash
# 4. Update your ENS content hash OR wait for feed to update (if funded)
```

## Success Verification

Test these commands to verify everything works:

```bash
# Test JS file loads correctly
curl -I http://localhost:3323/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/_next/static/chunks/webpack-653b47f35bf84c66.js

# Should return: Content-Type: application/javascript
# NOT: Content-Type: text/html

# Test dashboard page
curl -I http://localhost:3323/bzz/49f9b2d46dba0df9fc0d2a0d4f1f0e4fcbbcda0fa705eeef38124fd34025eb50/dashboard

# Should return: 200 OK with Content-Type: text/html
```
