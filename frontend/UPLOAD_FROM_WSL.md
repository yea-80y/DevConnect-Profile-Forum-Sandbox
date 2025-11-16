# Upload from WSL Ubuntu - Test Instructions

## Problem
When uploading from Windows PowerShell, the tar file created by `uploadFilesFromDirectory()` may contain Windows-style backslash paths (`_next\static\...`) instead of Unix forward slashes (`_next/static/...`), causing Swarm to not find the files correctly.

## Solution Test
Upload from WSL Ubuntu to use Unix-style path handling.

## Steps

### 1. Open WSL Ubuntu Terminal
In VSCode or Windows Terminal, open a WSL Ubuntu session:
```bash
wsl
```

### 2. Navigate to Frontend Directory
```bash
cd /mnt/c/Users/nabil/devconnect-profile-sandbox/frontend
```

### 3. Verify Node.js is Installed
```bash
node --version
npm --version
```

If not installed, install Node.js:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### 4. Install Dependencies (if needed)
```bash
npm install
```

### 5. Run Build Process
```bash
npm run build
node fix-paths.js
```

### 6. Run Upload Script
```bash
node upload-to-swarm-feed.js
```

### 7. Test the Content Hash
After upload, test the content hash URL in browser:
```
https://gateway.woco-net.com/bzz/<content-hash>/
```

Check browser console for:
- ✅ JS files loading correctly (no syntax errors)
- ✅ CSS files applying correctly
- ✅ No 404 errors for _next/static/... files

### 8. Test the Feed Manifest Hash
```
https://gateway.woco-net.com/bzz/<feed-manifest-hash>/
```

This should display the website (not download a file).

## Expected Results

If the WSL upload fixes the issue:
- Content hash should display the website correctly
- No doubled paths like `/_next/static/chunks/_next/static/chunks/`
- All JS/CSS assets load successfully
- Browser console shows no 404s or syntax errors

## Notes

- The `out` directory is already built from Windows
- WSL can access Windows files via `/mnt/c/`
- Node.js in WSL will use Unix path handling for tar creation
- The proxy at gateway.woco-net.com will forward requests the same way regardless of upload source
