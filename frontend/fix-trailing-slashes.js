const fs = require('fs');
const path = require('path');

// Files to fix
const files = [
  './src/components/auth/LoginScreen.tsx',
  './src/app/forum/page.tsx',
  './src/app/account/page.tsx'
];

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Fix location.replace calls
  content = content.replace(
    /location\.replace\("\/dashboard\?fresh=1"\)/g,
    'location.replace("/dashboard/?fresh=1")'
  );
  
  // Fix router.push calls for dashboard
  content = content.replace(
    /router\.push\('\/dashboard'\)/g,
    "router.push('/dashboard/')"
  );
  
  // Fix router.push calls for forum
  content = content.replace(
    /router\.push\('\/forum'\)/g,
    "router.push('/forum/')"
  );
  
  // Fix router.push calls for account
  content = content.replace(
    /router\.push\('\/account'\)/g,
    "router.push('/account/')"
  );
  
  // Fix router.push calls for profile
  content = content.replace(
    /router\.push\('\/profile'\)/g,
    "router.push('/profile/')"
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Fixed trailing slashes in ${filePath}`);
});

console.log('✅ All navigation paths now include trailing slashes');
