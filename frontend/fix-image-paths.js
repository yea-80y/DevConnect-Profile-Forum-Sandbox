const fs = require('fs');
const path = './src/components/auth/LoginScreen.tsx';
let content = fs.readFileSync(path, 'utf8');

// Fix logo.png path
content = content.replace(
  'src="/logo.png"',
  'src={`${process.env.NEXT_PUBLIC_BASE_PATH || \'\'}/logo.png`}\n            unoptimized'
);

// Fix discord-icon.svg path
content = content.replace(
  'src="/discord-icon.svg"',
  'src={`${process.env.NEXT_PUBLIC_BASE_PATH || \'\'}/discord-icon.svg`}\n                unoptimized'
);

fs.writeFileSync(path, content, 'utf8');
console.log('✅ Fixed image paths to include basePath');
