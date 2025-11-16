// Create redirect HTML files for routes without trailing slashes
// This ensures /dashboard redirects to /dashboard/ for static export

const fs = require('fs');
const path = require('path');

const outDir = './out';
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

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
