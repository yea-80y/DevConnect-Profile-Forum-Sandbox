const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TypeScript/JavaScript files in src
const files = glob.sync('./src/**/*.{ts,tsx,js,jsx}');

let totalFixed = 0;

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // Fix all navigation patterns:
  
  // 1. location.href = "/" or location.href="/"
  content = content.replace(/location\.href\s*=\s*["']\/["']/g, 'location.href = "/"');
  
  // 2. location.replace("/path") or location.replace('/path')
  content = content.replace(/location\.replace\(["']\/dashboard\?fresh=1["']\)/g, 'location.replace("/dashboard/?fresh=1")');
  content = content.replace(/location\.replace\(["']\/dashboard["']\)/g, 'location.replace("/dashboard/")');
  content = content.replace(/location\.replace\(["']\/forum["']\)/g, 'location.replace("/forum/")');
  content = content.replace(/location\.replace\(["']\/account["']\)/g, 'location.replace("/account/")');
  content = content.replace(/location\.replace\(["']\/profile["']\)/g, 'location.replace("/profile/")');
  content = content.replace(/location\.replace\(["']\/["']\)/g, 'location.replace("/")');
  
  // 3. router.push('/path') or router.push("/path")
  content = content.replace(/router\.push\(["']\/dashboard["']\)/g, "router.push('/dashboard/')");
  content = content.replace(/router\.push\(["']\/forum["']\)/g, "router.push('/forum/')");
  content = content.replace(/router\.push\(["']\/account["']\)/g, "router.push('/account/')");
  content = content.replace(/router\.push\(["']\/profile["']\)/g, "router.push('/profile/')");
  content = content.replace(/router\.push\(["']\/["']\)/g, "router.push('/')");
  
  // 4. router.replace('/path') or router.replace("/path")
  content = content.replace(/router\.replace\(["']\/dashboard["']\)/g, "router.replace('/dashboard/')");
  content = content.replace(/router\.replace\(["']\/forum["']\)/g, "router.replace('/forum/')");
  content = content.replace(/router\.replace\(["']\/account["']\)/g, "router.replace('/account/')");
  content = content.replace(/router\.replace\(["']\/profile["']\)/g, "router.replace('/profile/')");
  content = content.replace(/router\.replace\(["']\/["']\)/g, "router.replace('/')");
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Fixed navigation in ${filePath}`);
    totalFixed++;
  }
});

console.log(`\n✅ Fixed navigation in ${totalFixed} files`);
console.log('All paths now use trailing slashes for consistency');
